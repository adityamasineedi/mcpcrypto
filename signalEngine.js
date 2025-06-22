const { RSI, MACD, EMA, BollingerBands } = require('technicalindicators');
const config = require('./config');
const logger = require('./utils/logger');
const MarketFetcher = require('./marketFetcher');
const MCPEngine = require('./mcpEngine');
const OpenAIEngine = require('./openAIEngine');
const CoinSelector = require('./coinSelector');

class SignalEngine {
  constructor() {
    this.marketFetcher = new MarketFetcher();
    this.mcpEngine = new MCPEngine();
    this.aiEngine = new OpenAIEngine();
    this.coinSelector = new CoinSelector();
    this.lastSignals = new Map();
    this.signalHistory = [];
    this.initialized = false;
  }

  /**
   * 🚀 Initialize Signal Engine
   */
  async init() {
    try {
      await Promise.all([
        this.marketFetcher.init(),
        this.mcpEngine.init(),
        this.aiEngine.init(),
        this.coinSelector.init()
      ]);

      this.initialized = true;
      logger.info('✅ Signal Engine initialized');
    } catch (error) {
      logger.error('❌ Signal Engine initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 🎯 Generate signals for all selected coins
   */
  async generateSignals() {
    try {
      if (!this.initialized) {
        throw new Error('Signal Engine not initialized');
      }

      logger.info('🔍 Starting signal generation...');

      // Update market context and coin selection
      const [marketContext, selectedCoins] = await Promise.all([
        this.mcpEngine.updateMarketContextIfNeeded(),
        this.coinSelector.updateCoinSelectionIfNeeded()
      ]);

      logger.info(`📊 Market: ${marketContext.regime} | Coins: ${selectedCoins.length}`);

      // Generate signals for each coin with better error handling
      const signalPromises = selectedCoins.map(coin => 
        this.generateCoinSignalSafe(coin, marketContext)
      );
      const results = await Promise.allSettled(signalPromises);

      // Process results and filter successful ones
      const signals = results
        .map((result, index) => ({
          coin: selectedCoins[index],
          signal: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason?.message : null
        }))
        .filter(item => item.signal !== null);

      // Filter high-quality signals
      const qualitySignals = this.filterHighQualitySignals(signals, marketContext);

      // Sort by confidence
      qualitySignals.sort((a, b) => b.signal.finalConfidence - a.signal.finalConfidence);

      logger.info(`✅ Generated ${qualitySignals.length} quality signals`);

      return qualitySignals;
    } catch (error) {
      logger.error('❌ Error generating signals:', error.message);
      return [];
    }
  }

  /**
   * 🛡️ Safe wrapper for coin signal generation
   */
  async generateCoinSignalSafe(symbol, marketContext) {
    try {
      return await this.generateCoinSignal(symbol, marketContext);
    } catch (error) {
      logger.warn(`⚠️ Failed to generate signal for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * 🪙 Generate signal for individual coin
   */
  async generateCoinSignal(symbol, marketContext) {
    try {
      // Check if too soon since last signal
      if (this.isSignalTooSoon(symbol)) {
        return null;
      }

      // Get market data with retries and fallbacks
      const marketData = await this.getMarketDataWithFallback(symbol);
      
      if (!marketData) {
        logger.debug(`⚠️ No market data available for ${symbol}`);
        return null;
      }

      // Calculate technical indicators with safe handling
      const technicalData = this.calculateTechnicalIndicatorsSafe(marketData);

      // Generate technical signal
      const technicalSignal = this.generateTechnicalSignal(technicalData, marketContext);

      // Skip if no clear technical signal
      if (!technicalSignal || technicalSignal.type === 'HOLD') {
        return null;
      }

      // Get AI analysis
      const aiAnalysis = await this.aiEngine.analyzeSignal({
        symbol,
        technicalData,
        marketContext,
        proposedSignal: technicalSignal
      });

      // Create final signal
      const finalSignal = this.createFinalSignal(symbol, technicalSignal, aiAnalysis, technicalData, marketContext);

      // Update last signal time
      this.lastSignals.set(symbol, Date.now());

      return finalSignal;
    } catch (error) {
      logger.error(`❌ Error generating signal for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 📊 Get market data with fallback to mock data
   */
  async getMarketDataWithFallback(symbol) {
    try {
      // Try to get real market data
      const [ticker, klines4h, klines1h, klines15m] = await Promise.allSettled([
        this.marketFetcher.get24hTicker(symbol),
        this.marketFetcher.getKlines(symbol, '4h', 100),
        this.marketFetcher.getKlines(symbol, '1h', 100),
        this.marketFetcher.getKlines(symbol, '15m', 100)
      ]);

      // Check if we have at least ticker data
      if (ticker.status !== 'fulfilled') {
        logger.debug(`⚠️ No ticker data for ${symbol}, using mock data`);
        return this.generateMockMarketData(symbol);
      }

      // Use real ticker, generate mock klines if needed
      const tickerData = ticker.value;
      const klinesData = {
        klines4h: klines4h.status === 'fulfilled' ? klines4h.value : this.generateMockKlines(tickerData.price, '4h', 100),
        klines1h: klines1h.status === 'fulfilled' ? klines1h.value : this.generateMockKlines(tickerData.price, '1h', 100),
        klines15m: klines15m.status === 'fulfilled' ? klines15m.value : this.generateMockKlines(tickerData.price, '15m', 100)
      };

      return {
        ticker: tickerData,
        ...klinesData
      };

    } catch (error) {
      logger.debug(`⚠️ Market data error for ${symbol}, using mock data:`, error.message);
      return this.generateMockMarketData(symbol);
    }
  }

  /**
   * 🎲 Generate mock market data
   */
  generateMockMarketData(symbol) {
    const basePrices = {
      BTC: 65000, ETH: 3500, SOL: 150, LINK: 15, OP: 2.5,
      ADA: 0.5, DOT: 7, AVAX: 35, UNI: 8
    };
    
    const basePrice = basePrices[symbol] || 100;
    const variation = (Math.random() - 0.5) * 0.04; // ±2%
    const currentPrice = basePrice * (1 + variation);

    const ticker = {
      symbol,
      price: currentPrice,
      change24h: (Math.random() - 0.5) * 10, // ±5%
      volume24h: Math.random() * 1000000 + 100000,
      high24h: currentPrice * 1.03,
      low24h: currentPrice * 0.97,
      openPrice: currentPrice * (1 - variation),
      closePrice: currentPrice,
      count: Math.floor(Math.random() * 10000) + 1000
    };

    return {
      ticker,
      klines4h: this.generateMockKlines(currentPrice, '4h', 100),
      klines1h: this.generateMockKlines(currentPrice, '1h', 100),
      klines15m: this.generateMockKlines(currentPrice, '15m', 100)
    };
  }

  /**
   * 📊 Generate mock klines
   */
  generateMockKlines(currentPrice, interval, count) {
    const klines = [];
    const intervalMs = this.getIntervalMs(interval);
    const now = Date.now();
    
    let price = currentPrice;
    
    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - (i * intervalMs);
      const change = (Math.random() - 0.5) * 0.02; // ±1% per period
      
      const open = price;
      const close = price * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
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
      
      price = close;
    }
    
    return klines;
  }

  /**
   * ⏰ Get interval in milliseconds
   */
  getIntervalMs(interval) {
    const intervals = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };
    return intervals[interval] || 900000;
  }

  /**
   * 📊 Calculate technical indicators with robust live data handling
   */
  calculateTechnicalIndicatorsSafe(marketData) {
    const { ticker, klines4h, klines1h, klines15m } = marketData;
    
    try {
      // Validate input data first
      if (!klines1h || klines1h.length < 20) {
        logger.warn(`⚠️ Insufficient klines data for ${ticker.symbol}, using price-based indicators`);
        return this.calculateIndicatorsFromPrice(ticker);
      }

      const closes4h = klines4h.map(k => k.close).filter(c => typeof c === 'number' && !isNaN(c));
      const closes1h = klines1h.map(k => k.close).filter(c => typeof c === 'number' && !isNaN(c));
      const closes15m = klines15m.map(k => k.close).filter(c => typeof c === 'number' && !isNaN(c));
      const volumes1h = klines1h.map(k => k.volume).filter(v => typeof v === 'number' && !isNaN(v));

      // Ensure we have enough data points
      if (closes1h.length < 14) {
        logger.warn(`⚠️ Not enough valid data points for ${ticker.symbol}, using simplified indicators`);
        return this.calculateIndicatorsFromPrice(ticker);
      }

      // Safe RSI calculation
      let currentRSI = 50; // Default neutral
      try {
        const rsi = RSI.calculate({ values: closes1h.slice(-50), period: 14 });
        currentRSI = rsi && rsi.length > 0 ? rsi[rsi.length - 1] : 50;
        if (isNaN(currentRSI)) currentRSI = 50;
      } catch (error) {
        logger.debug(`RSI calculation failed for ${ticker.symbol}: ${error.message}`);
        currentRSI = 50;
      }

      // Safe MACD calculation with fallback
      let currentMACD = { MACD: 0, signal: 0, histogram: 0 };
      try {
        if (closes1h.length >= 26) {
          const macdData = MACD.calculate({
            values: closes1h.slice(-100), // Use more recent data
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
          });
          
          if (macdData && macdData.length > 0) {
            const lastMACD = macdData[macdData.length - 1];
            currentMACD = {
              MACD: typeof lastMACD.MACD === 'number' ? lastMACD.MACD : 0,
              signal: typeof lastMACD.signal === 'number' ? lastMACD.signal : 0,
              histogram: typeof lastMACD.histogram === 'number' ? lastMACD.histogram : 0
            };
          }
        }
      } catch (error) {
        logger.debug(`MACD calculation failed for ${ticker.symbol}: ${error.message}`);
        // Keep default values
      }

      // Safe EMA calculations
      const calculateEMA = (prices, period) => {
        try {
          if (prices.length >= period) {
            const ema = EMA.calculate({ values: prices.slice(-period * 2), period });
            return ema && ema.length > 0 ? ema[ema.length - 1] : ticker.price;
          }
          return ticker.price;
        } catch (error) {
          return ticker.price;
        }
      };

      const ema9 = calculateEMA(closes1h, 9);
      const ema21 = calculateEMA(closes1h, 21);
      const ema50 = calculateEMA(closes1h, 50);
      const ema200_4h = closes4h.length >= 200 ? calculateEMA(closes4h, 200) : ticker.price;

      // Safe Bollinger Bands calculation
      let currentBB = null;
      try {
        if (closes1h.length >= 20) {
          const bb = BollingerBands.calculate({
            values: closes1h.slice(-50),
            period: 20,
            stdDev: 2
          });
          currentBB = bb && bb.length > 0 ? bb[bb.length - 1] : null;
        }
      } catch (error) {
        logger.debug(`Bollinger Bands calculation failed for ${ticker.symbol}: ${error.message}`);
      }

      // Volume analysis with fallback
      const avgVolume = volumes1h.length > 0 ? 
        volumes1h.slice(-20).reduce((sum, v) => sum + v, 0) / Math.min(20, volumes1h.length) : 
        ticker.volume24h / 24;
      
      const volumeRatio = ticker.volume24h && avgVolume > 0 ? ticker.volume24h / avgVolume : 1;

      // Price analysis
      const currentPrice = ticker.price;
      const change24h = ticker.change24h || 0;

      // Support/Resistance levels
      const supportResistance = this.calculateSupportResistanceSafe(klines4h);

      return {
        currentPrice,
        change24h,
        rsi: currentRSI,
        macd: currentMACD,
        ema9: typeof ema9 === 'number' ? ema9 : currentPrice,
        ema21: typeof ema21 === 'number' ? ema21 : currentPrice,
        ema50: typeof ema50 === 'number' ? ema50 : currentPrice,
        ema200_4h: typeof ema200_4h === 'number' ? ema200_4h : currentPrice,
        bollingerBands: currentBB,
        volumeRatio: typeof volumeRatio === 'number' ? volumeRatio : 1,
        avgVolume,
        volatility: this.calculateVolatilitySafe(closes1h),
        momentum: this.calculateMomentumSafe(closes15m),
        supportResistance,
        technicalScore: 0 // Will be calculated in generateTechnicalSignal
      };

    } catch (error) {
      logger.error(`❌ Error calculating technical indicators for ${ticker.symbol}: ${error.message}`);
      // Return price-based indicators as fallback
      return this.calculateIndicatorsFromPrice(ticker);
    }
  }

  /**
   * 💰 Fallback: Calculate indicators from price data only
   */
  calculateIndicatorsFromPrice(ticker) {
    logger.info(`📊 Using price-based indicators for ${ticker.symbol}`);
    
    const currentPrice = ticker.price;
    const change24h = ticker.change24h || 0;
    
    // Estimate RSI from price change
    let estimatedRSI = 50;
    if (change24h > 5) estimatedRSI = 70;
    else if (change24h > 2) estimatedRSI = 60;
    else if (change24h < -5) estimatedRSI = 30;
    else if (change24h < -2) estimatedRSI = 40;

    return {
      currentPrice,
      change24h,
      rsi: estimatedRSI,
      macd: { MACD: change24h > 0 ? 0.1 : -0.1, signal: 0, histogram: change24h > 0 ? 0.1 : -0.1 },
      ema9: currentPrice,
      ema21: currentPrice,
      ema50: currentPrice,
      ema200_4h: currentPrice,
      bollingerBands: null,
      volumeRatio: 1,
      avgVolume: ticker.volume24h / 24,
      volatility: Math.abs(change24h) * 0.5,
      momentum: change24h,
      supportResistance: { support: [], resistance: [] },
      technicalScore: 50
    };
  }

  /**
   * 🛡️ Get default technical data
   */
  getDefaultTechnicalData(ticker) {
    return {
      currentPrice: ticker.price,
      change24h: ticker.change24h || 0,
      rsi: 50,
      macd: { MACD: 0, signal: 0, histogram: 0 },
      ema9: ticker.price,
      ema21: ticker.price,
      ema50: ticker.price,
      ema200_4h: ticker.price,
      bollingerBands: null,
      volumeRatio: 1,
      avgVolume: ticker.volume24h / 24,
      volatility: 2,
      momentum: 0,
      supportResistance: { support: [], resistance: [] },
      technicalScore: 50
    };
  }

  /**
   * 🌊 Safe volatility calculation
   */
  calculateVolatilitySafe(prices) {
    try {
      if (prices.length < 20) return 2; // Default medium volatility
      
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
      }
      
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      return Math.sqrt(variance) * 100;
    } catch (error) {
      return 2; // Default volatility
    }
  }

  /**
   * 🚀 Safe momentum calculation
   */
  calculateMomentumSafe(prices) {
    try {
      if (prices.length < 20) return 0;
      
      const recent = prices.slice(-10);
      const older = prices.slice(-20, -10);
      
      const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
      const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;
      
      return (recentAvg - olderAvg) / olderAvg * 100;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 📊 Safe support/resistance calculation
   */
  calculateSupportResistanceSafe(klines) {
    try {
      if (!klines || klines.length < 10) {
        return { support: [], resistance: [] };
      }

      const highs = klines.map(k => k.high).filter(h => typeof h === 'number');
      const lows = klines.map(k => k.low).filter(l => typeof l === 'number');
      
      const support = [];
      const resistance = [];
      
      // Simple pivot detection
      for (let i = 2; i < lows.length - 2; i++) {
        if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
            lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
          support.push(lows[i]);
        }
      }
      
      for (let i = 2; i < highs.length - 2; i++) {
        if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
            highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
          resistance.push(highs[i]);
        }
      }
      
      return {
        support: support.slice(-3),
        resistance: resistance.slice(-3)
      };
    } catch (error) {
      return { support: [], resistance: [] };
    }
  }

  // ... (rest of the methods remain the same as in the original signalEngine.js)

  /**
   * 📈 Generate technical signal with market regime awareness
   */
  generateTechnicalSignal(tech, marketContext) {
    let signals = [];
    let confidence = 0;

    // 1. EMA Crossover Signals
    const emaCrossover = this.analyzeEMACrossover(tech);
    if (emaCrossover.signal !== 'NEUTRAL') {
      signals.push(emaCrossover);
      confidence += emaCrossover.weight;
    }

    // 2. RSI Signals (now includes sideways market strategies)
    const rsiSignal = this.analyzeRSI(tech, marketContext);
    if (rsiSignal.signal !== 'NEUTRAL') {
      signals.push(rsiSignal);
      confidence += rsiSignal.weight;
    }

    // 3. MACD Signals
    const macdSignal = this.analyzeMACD(tech);
    if (macdSignal.signal !== 'NEUTRAL') {
      signals.push(macdSignal);
      confidence += macdSignal.weight;
    }

    // 4. Volume Breakout
    const volumeSignal = this.analyzeVolume(tech);
    if (volumeSignal.signal !== 'NEUTRAL') {
      signals.push(volumeSignal);
      confidence += volumeSignal.weight;
    }

    // 5. Support/Resistance (enhanced for sideways markets)
    const srSignal = this.analyzeSupportResistance(tech);
    if (srSignal.signal !== 'NEUTRAL') {
      signals.push(srSignal);
      confidence += srSignal.weight;
    }

    // 6. Bollinger Bands (enhanced for sideways markets)
    const bbSignal = this.analyzeBollingerBands(tech);
    if (bbSignal.signal !== 'NEUTRAL') {
      signals.push(bbSignal);
      confidence += bbSignal.weight;
    }

    // Determine overall signal with market regime adjustments
    if (signals.length === 0) {
      return { type: 'HOLD', confidence: 0, reasoning: 'No clear signals' };
    }

    const bullishSignals = signals.filter(s => s.signal === 'LONG').length;
    const bearishSignals = signals.filter(s => s.signal === 'SHORT').length;

    let signalType = 'HOLD';
    let strength = 'WEAK';

    // Adjust confidence thresholds based on market regime
    let minConfidence = 60;
    if (marketContext.regime === 'SIDEWAYS') {
      minConfidence = 45; // Lower threshold for sideways markets
    } else if (marketContext.regime === 'BULL') {
      minConfidence = 50; // Slightly lower for bull markets
    } else if (marketContext.regime === 'BEAR') {
      minConfidence = 65; // Higher threshold for bear markets
    }

    if (bullishSignals > bearishSignals && confidence > minConfidence) {
      signalType = 'LONG';
      strength = confidence > 80 ? 'STRONG' : confidence > 65 ? 'MEDIUM' : 'WEAK';
    } else if (bearishSignals > bullishSignals && confidence > minConfidence) {
      signalType = 'SHORT';
      strength = confidence > 80 ? 'STRONG' : confidence > 65 ? 'MEDIUM' : 'WEAK';
    }

    // Calculate entry price
    const entryPrice = this.calculateEntryPrice(tech, signalType);

    // Update technical score
    tech.technicalScore = confidence;

    return {
      type: signalType,
      strength,
      confidence,
      entryPrice,
      reasoning: this.buildSignalReasoning(signals, marketContext.regime),
      signals: signals.map(s => ({ indicator: s.indicator, signal: s.signal, weight: s.weight }))
    };
  }

  /**
   * 📊 Analyze EMA Crossover
   */
  analyzeEMACrossover(tech) {
    const { ema9, ema21, ema50, currentPrice } = tech;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    // Golden cross (9 > 21 > 50) with price above
    if (ema9 > ema21 && ema21 > ema50 && currentPrice > ema9) {
      signal = 'LONG';
      weight = 25;
    }
    // Death cross (9 < 21 < 50) with price below
    else if (ema9 < ema21 && ema21 < ema50 && currentPrice < ema9) {
      signal = 'SHORT';
      weight = 25;
    }
    // Partial bullish (9 > 21, price > 21)
    else if (ema9 > ema21 && currentPrice > ema21) {
      signal = 'LONG';
      weight = 15;
    }
    // Partial bearish (9 < 21, price < 21)
    else if (ema9 < ema21 && currentPrice < ema21) {
      signal = 'SHORT';
      weight = 15;
    }
    
    return { indicator: 'EMA_CROSSOVER', signal, weight };
  }

  /**
   * 📊 Analyze RSI with sideways market support
   */
  analyzeRSI(tech, marketContext) {
    const { rsi } = tech;
    const { oversold, overbought } = config.indicators.rsi;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    // Oversold bounce in bull market
    if (rsi < oversold && marketContext.regime === 'BULL') {
      signal = 'LONG';
      weight = 20;
    }
    // Overbought rejection in bear market
    else if (rsi > overbought && marketContext.regime === 'BEAR') {
      signal = 'SHORT';
      weight = 20;
    }
    // SIDEWAYS MARKET STRATEGIES
    else if (marketContext.regime === 'SIDEWAYS') {
      // Mean reversion in sideways markets
      if (rsi < 30) {
        signal = 'LONG';
        weight = 18; // Strong signal for oversold bounce
      } else if (rsi > 70) {
        signal = 'SHORT';
        weight = 18; // Strong signal for overbought rejection
      } else if (rsi < 40) {
        signal = 'LONG';
        weight = 12; // Moderate signal for potential bounce
      } else if (rsi > 60) {
        signal = 'SHORT';
        weight = 12; // Moderate signal for potential rejection
      }
    }
    // Momentum continuation
    else if (rsi > 50 && rsi < 70 && marketContext.regime === 'BULL') {
      signal = 'LONG';
      weight = 10;
    }
    else if (rsi < 50 && rsi > 30 && marketContext.regime === 'BEAR') {
      signal = 'SHORT';
      weight = 10;
    }
    
    return { indicator: 'RSI', signal, weight };
  }

  /**
   * 📊 Analyze MACD
   */
  analyzeMACD(tech) {
    const { macd } = tech;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    if (!macd) return { indicator: 'MACD', signal, weight };
    
    // MACD line above signal line (bullish)
    if (macd.MACD > macd.signal) {
      signal = 'LONG';
      weight = macd.histogram > 0 ? 20 : 15;
    }
    // MACD line below signal line (bearish)
    else if (macd.MACD < macd.signal) {
      signal = 'SHORT';
      weight = macd.histogram < 0 ? 20 : 15;
    }
    
    return { indicator: 'MACD', signal, weight };
  }

  /**
   * 📊 Analyze Volume
   */
  analyzeVolume(tech) {
    const { volumeRatio } = tech;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    // High volume breakout
    if (volumeRatio > config.indicators.volume.spikeFactor) {
      // Determine direction based on price action
      if (tech.change24h > 2) {
        signal = 'LONG';
        weight = 15;
      } else if (tech.change24h < -2) {
        signal = 'SHORT';
        weight = 15;
      }
    }
    
    return { indicator: 'VOLUME', signal, weight };
  }

  /**
   * 📊 Analyze Support/Resistance with sideways market focus
   */
  analyzeSupportResistance(tech) {
    const { currentPrice, supportResistance } = tech;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    // Near support level
    const nearSupport = supportResistance.support.find(level => 
      Math.abs(currentPrice - level) / currentPrice < 0.02
    );
    
    // Near resistance level
    const nearResistance = supportResistance.resistance.find(level => 
      Math.abs(currentPrice - level) / currentPrice < 0.02
    );
    
    if (nearSupport && tech.rsi < 45) {
      signal = 'LONG';
      weight = 20; // Increased weight for sideways markets
    } else if (nearResistance && tech.rsi > 55) {
      signal = 'SHORT';
      weight = 20; // Increased weight for sideways markets
    }
    // Additional signals for sideways markets
    else if (nearSupport) {
      signal = 'LONG';
      weight = 15; // Support bounce even without RSI confirmation
    } else if (nearResistance) {
      signal = 'SHORT';
      weight = 15; // Resistance rejection even without RSI confirmation
    }
    
    return { indicator: 'SUPPORT_RESISTANCE', signal, weight };
  }

  /**
   * 📊 Analyze Bollinger Bands with sideways market strategies
   */
  analyzeBollingerBands(tech) {
    const { currentPrice, bollingerBands } = tech;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    if (!bollingerBands) return { indicator: 'BOLLINGER_BANDS', signal, weight };
    
    const { upper, middle, lower } = bollingerBands;
    
    // Price near lower band (oversold) - stronger in sideways markets
    if (currentPrice <= lower * 1.01) {
      signal = 'LONG';
      weight = 15; // Increased weight for mean reversion
    }
    // Price near upper band (overbought) - stronger in sideways markets
    else if (currentPrice >= upper * 0.99) {
      signal = 'SHORT';
      weight = 15; // Increased weight for mean reversion
    }
    // Price near middle band - trend continuation or reversal
    else if (Math.abs(currentPrice - middle) / middle < 0.005) {
      // Near middle band - direction depends on momentum
      if (tech.momentum > 1) {
        signal = 'LONG';
        weight = 8;
      } else if (tech.momentum < -1) {
        signal = 'SHORT';
        weight = 8;
      }
    }
    
    return { indicator: 'BOLLINGER_BANDS', signal, weight };
  }

  /**
   * 🎯 Calculate entry price
   */
  calculateEntryPrice(tech, signalType) {
    const { currentPrice, ema9, ema21 } = tech;
    
    if (signalType === 'LONG') {
      // Enter slightly above current price or EMA
      return Math.max(currentPrice * 1.001, ema9 * 1.002);
    } else if (signalType === 'SHORT') {
      // Enter slightly below current price or EMA
      return Math.min(currentPrice * 0.999, ema9 * 0.998);
    }
    
    return currentPrice;
  }

  /**
   * 🏗️ Create final signal
   */
  createFinalSignal(symbol, technicalSignal, aiAnalysis, technicalData, marketContext) {
    // Calculate final confidence using AI consensus
    const finalConfidence = Math.min(100, Math.max(0, aiAnalysis.confidence || 50));
    
    // Determine if signal meets minimum confidence
    if (finalConfidence < config.ai.confidence.minimum) {
      return null;
    }
    
    // Calculate position size
    const positionSize = this.calculatePositionSize(technicalSignal.entryPrice, aiAnalysis.risk_level);
    
    // Calculate stop loss and take profit
    const stopLoss = this.calculateStopLoss(technicalSignal.entryPrice, technicalSignal.type, aiAnalysis.stop_loss);
    const takeProfit = this.calculateTakeProfit(technicalSignal.entryPrice, technicalSignal.type, aiAnalysis.price_target);
    
    const signal = {
      id: `${symbol}_${Date.now()}`,
      symbol,
      timestamp: Date.now(),
      type: aiAnalysis.recommendation.includes('BUY') ? 'LONG' : 
            aiAnalysis.recommendation.includes('SELL') ? 'SHORT' : 'HOLD',
      strength: technicalSignal.strength,
      finalConfidence,
      entryPrice: technicalSignal.entryPrice,
      currentPrice: technicalData.currentPrice,
      positionSize,
      stopLoss,
      takeProfit,
      risk: aiAnalysis.risk_level,
      timeHorizon: aiAnalysis.time_horizon,
      marketRegime: marketContext.regime,
      
      // Technical details
      technical: {
        confidence: technicalSignal.confidence,
        signals: technicalSignal.signals,
        reasoning: technicalSignal.reasoning
      },
      
      // AI analysis
      ai: {
        confidence: aiAnalysis.confidence,
        recommendation: aiAnalysis.recommendation,
        reasoning: aiAnalysis.reasoning,
        sources: aiAnalysis.ai_sources
      },
      
      // Market context
      context: {
        regime: marketContext.regime,
        sentiment: marketContext.sentiment,
        fearGreed: marketContext.fearGreedIndex,
        volatility: marketContext.volatility
      },
      
      // Risk metrics
      riskReward: takeProfit ? (takeProfit - technicalSignal.entryPrice) / (technicalSignal.entryPrice - stopLoss) : null,
      maxLoss: positionSize * (Math.abs(technicalSignal.entryPrice - stopLoss) / technicalSignal.entryPrice),
      maxGain: takeProfit ? positionSize * (Math.abs(takeProfit - technicalSignal.entryPrice) / technicalSignal.entryPrice) : null
    };
    
    // Add to signal history
    this.signalHistory.push(signal);
    
    return signal;
  }

  /**
   * 💰 Calculate position size
   */
  calculatePositionSize(entryPrice, riskLevel) {
    const baseAmount = config.capital.total * (config.capital.riskPerTrade / 100);
    
    // Adjust based on risk level
    let riskMultiplier = 1;
    switch (riskLevel) {
      case 'LOW': riskMultiplier = 1.2; break;
      case 'MEDIUM': riskMultiplier = 1; break;
      case 'HIGH': riskMultiplier = 0.7; break;
    }
    
    const adjustedAmount = baseAmount * riskMultiplier;
    
    // Apply min/max limits
    return Math.max(
      config.capital.minTradeAmount,
      Math.min(config.capital.maxTradeAmount, adjustedAmount)
    );
  }

  /**
   * 🛑 Calculate stop loss
   */
  calculateStopLoss(entryPrice, signalType, aiStopLoss) {
    if (aiStopLoss) return aiStopLoss;
    
    const stopLossPercent = config.capital.stopLossPercent / 100;
    
    if (signalType === 'LONG') {
      return entryPrice * (1 - stopLossPercent);
    } else if (signalType === 'SHORT') {
      return entryPrice * (1 + stopLossPercent);
    }
    
    return entryPrice;
  }

  /**
   * 🎯 Calculate take profit
   */
  calculateTakeProfit(entryPrice, signalType, aiTarget) {
    if (aiTarget) return aiTarget;
    
    const takeProfitPercent = config.capital.takeProfitPercent / 100;
    
    if (signalType === 'LONG') {
      return entryPrice * (1 + takeProfitPercent);
    } else if (signalType === 'SHORT') {
      return entryPrice * (1 - takeProfitPercent);
    }
    
    return entryPrice;
  }

  /**
   * ✨ Filter high-quality signals
   */
  filterHighQualitySignals(signals, marketContext) {
    return signals.filter(item => {
      const signal = item.signal;
      
      // Minimum confidence
      if (signal.finalConfidence < config.ai.confidence.minimum) return false;
      
      // Risk/reward ratio
      if (signal.riskReward && signal.riskReward < 1.5) return false;
      
      // Max loss limit
      if (signal.maxLoss > config.capital.maxTradeAmount * 0.5) return false;
      
      // Market regime compatibility
      if (marketContext.regime === 'BEAR' && signal.type === 'LONG' && signal.finalConfidence < 75) return false;
      if (marketContext.regime === 'BULL' && signal.type === 'SHORT' && signal.finalConfidence < 75) return false;
      
      return true;
    });
  }

  /**
   * 📝 Build signal reasoning with market context
   */
  buildSignalReasoning(signals, marketRegime) {
    const indicators = signals.map(s => s.indicator).join(', ');
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    
    let strategy = '';
    switch (marketRegime) {
      case 'SIDEWAYS':
        strategy = 'Mean reversion strategy in sideways market';
        break;
      case 'BULL':
        strategy = 'Momentum continuation in bull market';
        break;
      case 'BEAR':
        strategy = 'Trend following in bear market';
        break;
      default:
        strategy = 'Technical confluence';
    }
    
    return `${strategy}: ${indicators}. Total weight: ${totalWeight}%`;
  }

  /**
   * ⏰ Check if signal is too soon
   */
  isSignalTooSoon(symbol) {
    const lastSignal = this.lastSignals.get(symbol);
    if (!lastSignal) return false;
    
    return (Date.now() - lastSignal) < config.strategy.minSignalGap;
  }

  /**
   * 📊 Get signal statistics
   */
  getSignalStats() {
    const stats = {
      totalSignals: this.signalHistory.length,
      byType: {},
      byRisk: {},
      avgConfidence: 0,
      recentSignals: this.signalHistory.slice(-10)
    };
    
    if (this.signalHistory.length === 0) return stats;
    
    // Count by type
    stats.byType = this.signalHistory.reduce((acc, signal) => {
      acc[signal.type] = (acc[signal.type] || 0) + 1;
      return acc;
    }, {});
    
    // Count by risk
    stats.byRisk = this.signalHistory.reduce((acc, signal) => {
      acc[signal.risk] = (acc[signal.risk] || 0) + 1;
      return acc;
    }, {});
    
    // Average confidence
    stats.avgConfidence = this.signalHistory.reduce((sum, signal) => 
      sum + signal.finalConfidence, 0) / this.signalHistory.length;
    
    return stats;
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    this.lastSignals.clear();
    this.marketFetcher.cleanup();
    this.mcpEngine.cleanup();
    this.aiEngine.cleanup();
    this.coinSelector.cleanup();
    logger.info('🧹 Signal Engine cleaned up');
  }
}

module.exports = SignalEngine;