const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./utils/logger');

class MarketFetcher {
  constructor() {
    this.baseURL = config.exchange.baseURL;
    this.apiKey = config.exchange.apiKey;
    this.secret = config.exchange.secret;
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds cache
    this.rateLimiter = new Map();
    this.initialized = false;
  }

  /**
   * 🚀 Initialize the market fetcher
   */
  async init() {
    try {
      if (config.mockData.enabled) {
        logger.info('📊 MarketFetcher initialized with MOCK DATA');
        this.initialized = true;
        return;
      }

      if (!this.apiKey || !this.secret) {
        logger.warn('⚠️ BingX API credentials not found, using mock data');
        config.mockData.enabled = true;
        this.initialized = true;
        return;
      }

      // Test API connection with better error handling
      try {
        const serverTime = await this.getServerTime();
        logger.info(`✅ MarketFetcher connected to BingX. Server time: ${new Date(serverTime)}`);
        
        // Test a basic market data endpoint to ensure trading APIs work
        await this.getCurrentPrice('BTC');
        logger.info('✅ BingX trading API validated');
        
      } catch (apiError) {
        logger.error('❌ BingX API validation failed:', apiError.message);
        
        // Check if it's an authentication issue
        if (apiError.message.includes('401') || apiError.message.includes('403')) {
          logger.error('🔑 Invalid BingX API credentials');
        }
        
        throw apiError;
      }

      this.initialized = true;
    } catch (error) {
      logger.error('❌ Failed to initialize MarketFetcher:', error.message);
      logger.warn('🔄 Falling back to mock data');
      config.mockData.enabled = true;
      this.initialized = true;
    }
  }

  /**
   * 📡 Get server time from BingX
   */
  async getServerTime() {
    if (config.mockData.enabled) {
      return Date.now();
    }

    try {
      const response = await this.makeRequest('GET', '/openApi/swap/v2/server/time');
      // BingX returns different response structure, handle both cases
      let serverTime;
      if (response.data.serverTime) {
        serverTime = response.data.serverTime;
      } else if (response.data.data && response.data.data.serverTime) {
        serverTime = response.data.data.serverTime;
      } else {
        throw new Error('Invalid server time response structure');
      }
      
      // Ensure it's a valid timestamp
      const timestamp = parseInt(serverTime);
      if (isNaN(timestamp) || timestamp <= 0) {
        throw new Error('Invalid server time value');
      }
      
      return timestamp;
    } catch (error) {
      logger.warn('⚠️ Could not get BingX server time:', error.message);
      return Date.now(); // Fallback to local time
    }
  }

  /**
   * 📊 Get current price for a symbol
   */
  async getCurrentPrice(symbol) {
    const cacheKey = `price_${symbol}`;
    const cached = this.getCached(cacheKey);
    
    if (cached) return cached;

    try {
      let price;
      
      if (config.mockData.enabled) {
        price = this.generateMockPrice(symbol);
      } else {
        const response = await this.makeRequest('GET', '/openApi/swap/v2/quote/price', {
          symbol: this.formatSymbol(symbol)
        });
        
        // Handle different BingX response structures
        let priceData;
        if (response.data.price) {
          priceData = response.data.price;
        } else if (response.data.data && response.data.data.price) {
          priceData = response.data.data.price;
        } else {
          throw new Error('Price not found in response');
        }
        
        price = parseFloat(priceData);
        
        if (isNaN(price) || price <= 0) {
          throw new Error(`Invalid price value: ${priceData}`);
        }
      }

      this.setCache(cacheKey, price);
      return price;
    } catch (error) {
      logger.error(`❌ Error fetching price for ${symbol}:`, error.message);
      return this.generateMockPrice(symbol); // Fallback to mock
    }
  }

  /**
   * 📈 Get 24h ticker data
   */
  async get24hTicker(symbol) {
    const cacheKey = `ticker_${symbol}`;
    const cached = this.getCached(cacheKey);
    
    if (cached) return cached;

    try {
      let ticker;
      
      if (config.mockData.enabled) {
        ticker = this.generateMockTicker(symbol);
      } else {
        const response = await this.makeRequest('GET', '/openApi/swap/v2/quote/ticker', {
          symbol: this.formatSymbol(symbol)
        });
        
        // Handle BingX response structure
        let data;
        if (response.data.data) {
          data = response.data.data;
        } else {
          data = response.data;
        }
        
        // Safely parse numeric values with fallbacks
        const safeParseFloat = (value, fallback = 0) => {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? fallback : parsed;
        };
        
        const safeParseInt = (value, fallback = 0) => {
          const parsed = parseInt(value);
          return isNaN(parsed) ? fallback : parsed;
        };
        
        ticker = {
          symbol: symbol,
          price: safeParseFloat(data.lastPrice || data.price),
          change24h: safeParseFloat(data.priceChangePercent || data.change24h),
          volume24h: safeParseFloat(data.volume || data.volume24h),
          high24h: safeParseFloat(data.highPrice || data.high24h),
          low24h: safeParseFloat(data.lowPrice || data.low24h),
          openPrice: safeParseFloat(data.openPrice),
          closePrice: safeParseFloat(data.lastPrice || data.price),
          count: safeParseInt(data.count || data.trades, 1000)
        };
        
        // Validate critical fields
        if (ticker.price <= 0) {
          throw new Error(`Invalid ticker price for ${symbol}`);
        }
      }

      this.setCache(cacheKey, ticker, 60000); // Cache for 1 minute
      return ticker;
    } catch (error) {
      logger.error(`❌ Error fetching ticker for ${symbol}:`, error.message);
      return this.generateMockTicker(symbol); // Fallback to mock
    }
  }

  /**
   * 📊 Get OHLCV kline data
   */
  async getKlines(symbol, interval = '15m', limit = 100) {
    const cacheKey = `klines_${symbol}_${interval}_${limit}`;
    const cached = this.getCached(cacheKey);
    
    if (cached) return cached;

    try {
      let klines;
      
      if (config.mockData.enabled) {
        klines = this.generateMockKlines(symbol, interval, limit);
      } else {
        const response = await this.makeRequest('GET', '/openApi/swap/v3/quote/klines', {
          symbol: this.formatSymbol(symbol),
          interval: interval,
          limit: limit
        });

        klines = response.data.map(k => ({
          timestamp: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          closeTime: parseInt(k[6]),
          quoteVolume: parseFloat(k[7]),
          trades: parseInt(k[8])
        }));
      }

      this.setCache(cacheKey, klines, 30000); // Cache for 30 seconds
      return klines;
    } catch (error) {
      logger.error(`❌ Error fetching klines for ${symbol}:`, error.message);
      return this.generateMockKlines(symbol, interval, limit); // Fallback to mock
    }
  }

  /**
   * 📋 Get all trading symbols
   */
  async getAllSymbols() {
    const cacheKey = 'all_symbols';
    const cached = this.getCached(cacheKey);
    
    if (cached) return cached;

    try {
      let symbols;
      
      if (config.mockData.enabled) {
        symbols = config.coins.whitelist.map(coin => ({
          symbol: coin,
          baseAsset: coin,
          quoteAsset: 'USDT',
          status: 'TRADING'
        }));
      } else {
        const response = await this.makeRequest('GET', '/openApi/swap/v2/quote/contracts');
        symbols = response.data.map(s => ({
          symbol: s.symbol.replace('-USDT', ''),
          baseAsset: s.asset,
          quoteAsset: 'USDT',
          status: s.status
        }));
      }

      this.setCache(cacheKey, symbols, 300000); // Cache for 5 minutes
      return symbols;
    } catch (error) {
      logger.error('❌ Error fetching symbols:', error.message);
      return config.coins.whitelist.map(coin => ({
        symbol: coin,
        baseAsset: coin,
        quoteAsset: 'USDT',
        status: 'TRADING'
      }));
    }
  }

  /**
   * 📊 Get market depth (order book)
   */
  async getOrderBook(symbol, limit = 20) {
    try {
      let orderBook;
      
      if (config.mockData.enabled) {
        orderBook = this.generateMockOrderBook(symbol, limit);
      } else {
        const response = await this.makeRequest('GET', '/openApi/swap/v2/quote/depth', {
          symbol: this.formatSymbol(symbol),
          limit: limit
        });

        orderBook = {
          symbol: symbol,
          bids: response.data.bids.map(b => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: response.data.asks.map(a => [parseFloat(a[0]), parseFloat(a[1])]),
          timestamp: Date.now()
        };
      }

      return orderBook;
    } catch (error) {
      logger.error(`❌ Error fetching order book for ${symbol}:`, error.message);
      return this.generateMockOrderBook(symbol, limit);
    }
  }

  /**
   * 🌐 Get multiple tickers at once
   */
  async getMultipleTickers(symbols) {
    const promises = symbols.map(symbol => this.get24hTicker(symbol));
    const results = await Promise.allSettled(promises);
    
    return results
      .map((result, index) => ({
        symbol: symbols[index],
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null
      }))
      .filter(item => item.data !== null);
  }

  /**
   * 📡 Make authenticated API request
   */
  async makeRequest(method, endpoint, params = {}) {
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    const timestamp = Date.now();
    const queryString = new URLSearchParams(params).toString();
    
    let url = `${this.baseURL}${endpoint}`;
    if (queryString) {
      url += `?${queryString}`;
    }

    const headers = {
      'X-BX-APIKEY': this.apiKey,
      'Content-Type': 'application/json'
    };

    // Add signature for authenticated endpoints
    if (this.needsSignature(endpoint)) {
      const signaturePayload = `${timestamp}${method}${endpoint.split('/openApi')[1]}${queryString}`;
      const signature = crypto.createHmac('sha256', this.secret).update(signaturePayload).digest('hex');
      
      headers['X-BX-TIMESTAMP'] = timestamp;
      headers['X-BX-SIGNATURE'] = signature;
    }

    try {
      const response = await axios({
        method,
        url,
        headers,
        timeout: 10000
      });

      // Enhanced BingX response validation
      if (!response.data) {
        throw new Error('Empty response from BingX API');
      }

      // Check for BingX error codes
      if (response.data.code !== undefined && response.data.code !== 0) {
        throw new Error(`BingX API Error ${response.data.code}: ${response.data.msg || 'Unknown error'}`);
      }

      // Validate response has expected data structure
      if (response.data.data === undefined && endpoint !== '/openApi/swap/v2/server/time') {
        throw new Error('Invalid BingX response structure: missing data field');
      }

      return response;
    } catch (error) {
      if (error.response) {
        // API responded with error status
        throw new Error(`BingX API HTTP ${error.response.status}: ${error.response.data?.msg || error.message}`);
      } else if (error.request) {
        // Network error
        throw new Error(`BingX API network error: ${error.message}`);
      } else {
        // Other error
        throw error;
      }
    }
  }

  /**
   * 🔐 Check if endpoint needs signature
   */
  needsSignature(endpoint) {
    const publicEndpoints = [
      '/openApi/swap/v2/server/time',
      '/openApi/swap/v2/quote/price',
      '/openApi/swap/v2/quote/ticker',
      '/openApi/swap/v3/quote/klines',
      '/openApi/swap/v2/quote/depth',
      '/openApi/swap/v2/quote/contracts'
    ];
    
    return !publicEndpoints.includes(endpoint);
  }

  /**
   * ⏱️ Rate limiting check
   */
  checkRateLimit() {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    if (!this.rateLimiter.has(minute)) {
      this.rateLimiter.clear(); // Clear old entries
      this.rateLimiter.set(minute, 1);
      return true;
    }
    
    const requests = this.rateLimiter.get(minute);
    if (requests >= config.exchange.rateLimit.requests) {
      return false;
    }
    
    this.rateLimiter.set(minute, requests + 1);
    return true;
  }

  /**
   * 🏷️ Format symbol for BingX API
   */
  formatSymbol(symbol) {
    return `${symbol}-USDT`;
  }

  /**
   * 💾 Cache management
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data, timeout = this.cacheTimeout) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Auto cleanup after timeout
    setTimeout(() => {
      this.cache.delete(key);
    }, timeout);
  }

  /**
   * 🧪 Mock data generators for testing
   */
  generateMockPrice(symbol) {
    const basePrices = {
      BTC: 65000, ETH: 3500, SOL: 150, LINK: 15, OP: 2.5,
      ADA: 0.5, DOT: 7, AVAX: 35, MATIC: 0.8, UNI: 8
    };
    
    const basePrice = basePrices[symbol] || 100;
    const variation = (Math.random() - 0.5) * 2 * config.mockData.priceVariation;
    return basePrice * (1 + variation);
  }

  generateMockTicker(symbol) {
    const price = this.generateMockPrice(symbol);
    const change = (Math.random() - 0.5) * 10; // -5% to +5%
    const volume = Math.random() * 1000000 + 100000; // 100K to 1.1M
    
    return {
      symbol,
      price,
      change24h: change,
      volume24h: volume,
      high24h: price * 1.05,
      low24h: price * 0.95,
      openPrice: price * (1 - change / 100),
      closePrice: price,
      count: Math.floor(Math.random() * 10000) + 1000
    };
  }

  generateMockKlines(symbol, interval, limit) {
    const klines = [];
    const now = Date.now();
    const intervalMs = this.getIntervalMs(interval);
    let currentPrice = this.generateMockPrice(symbol);
    
    for (let i = limit - 1; i >= 0; i--) {
      const timestamp = now - (i * intervalMs);
      const open = currentPrice;
      const change = (Math.random() - 0.5) * 0.04; // 2% max change per interval
      const close = open * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.random() * 10000 + 1000;
      
      klines.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        closeTime: timestamp + intervalMs - 1,
        quoteVolume: volume * close,
        trades: Math.floor(Math.random() * 100) + 10
      });
      
      currentPrice = close;
    }
    
    return klines;
  }

  generateMockOrderBook(symbol, limit) {
    const currentPrice = this.generateMockPrice(symbol);
    const spread = currentPrice * 0.001; // 0.1% spread
    
    const bids = [];
    const asks = [];
    
    for (let i = 0; i < limit; i++) {
      const bidPrice = currentPrice - spread - (i * spread * 0.1);
      const askPrice = currentPrice + spread + (i * spread * 0.1);
      const quantity = Math.random() * 10 + 0.1;
      
      bids.push([bidPrice, quantity]);
      asks.push([askPrice, quantity]);
    }
    
    return {
      symbol,
      bids,
      asks,
      timestamp: Date.now()
    };
  }

  getIntervalMs(interval) {
    const intervals = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };
    return intervals[interval] || 900000; // Default to 15m
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    this.cache.clear();
    this.rateLimiter.clear();
    logger.info('🧹 MarketFetcher cleaned up');
  }
}

module.exports = MarketFetcher;