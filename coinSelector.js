const config = require('./config');
const logger = require('./utils/logger');
const MarketFetcher = require('./marketFetcher');

class CoinSelector {
  constructor() {
    this.marketFetcher = new MarketFetcher();
    this.selectedCoins = [];
    this.coinScores = new Map();
    this.lastUpdate = 0;
    this.updateInterval = 3600000; // 1 hour
  }

  /**
   * 🚀 Initialize coin selector
   */
  async init() {
    try {
      await this.marketFetcher.init();
      await this.updateCoinSelection();
      logger.info('✅ CoinSelector initialized');
    } catch (error) {
      logger.error('❌ CoinSelector initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 🎯 Get current selected coins
   */
  getSelectedCoins() {
    return this.selectedCoins;
  }

  /**
   * 📊 Get coin scores
   */
  getCoinScores() {
    return Array.from(this.coinScores.entries())
      .map(([coin, score]) => ({ coin, score }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 🔄 Update coin selection if needed
   */
  async updateCoinSelectionIfNeeded() {
    const now = Date.now();
    if (now - this.lastUpdate > this.updateInterval) {
      await this.updateCoinSelection();
    }
    return this.selectedCoins;
  }

  /**
   * 🎲 Select best coins for trading
   */
  async updateCoinSelection() {
    try {
      logger.info('🔍 Starting coin selection process...');
      
      // Get all available symbols
      const allSymbols = await this.getAllTradableSymbols();
      logger.info(`📋 Found ${allSymbols.length} tradable symbols`);
      
      // Score each coin
      const coinAnalysis = await this.analyzeCoins(allSymbols);
      
      // Filter and sort by score
      const filteredCoins = this.filterCoinsByRequirements(coinAnalysis);
      const sortedCoins = this.sortCoinsByScore(filteredCoins);
      
      // Select top coins
      this.selectedCoins = sortedCoins
        .slice(0, config.coins.maxCoins)
        .map(coin => coin.symbol);
      
      // Update coin scores map
      this.coinScores.clear();
      sortedCoins.forEach(coin => {
        this.coinScores.set(coin.symbol, coin.totalScore);
      });
      
      this.lastUpdate = Date.now();
      
      logger.info(`✅ Selected ${this.selectedCoins.length} coins:`, this.selectedCoins);
      logger.info('📊 Top 5 scores:', sortedCoins.slice(0, 5).map(c => `${c.symbol}: ${c.totalScore.toFixed(2)}`));
      
      return this.selectedCoins;
    } catch (error) {
      logger.error('❌ Error updating coin selection:', error.message);
      
      // Fallback to whitelist if selection fails
      this.selectedCoins = config.coins.whitelist.slice(0, config.coins.maxCoins);
      logger.warn('🔄 Using fallback coin list:', this.selectedCoins);
      
      return this.selectedCoins;
    }
  }

  /**
   * 📋 Get all tradable symbols
   */
  async getAllTradableSymbols() {
    try {
      const symbols = await this.marketFetcher.getAllSymbols();
      
      // Filter by whitelist and blacklist
      return symbols
        .filter(s => s.status === 'TRADING')
        .filter(s => this.isSymbolAllowed(s.symbol))
        .map(s => s.symbol);
    } catch (error) {
      logger.error('❌ Error getting tradable symbols:', error.message);
      return config.coins.whitelist; // Fallback to whitelist
    }
  }

  /**
   * ✅ Check if symbol is allowed
   */
  isSymbolAllowed(symbol) {
    // Check blacklist
    if (config.coins.blacklist.includes(symbol)) {
      return false;
    }
    
    // If whitelist is empty, allow all (except blacklisted)
    if (config.coins.whitelist.length === 0) {
      return true;
    }
    
    // Check whitelist
    return config.coins.whitelist.includes(symbol);
  }

  /**
   * 🔬 Analyze coins for scoring
   */
  async analyzeCoins(symbols) {
    logger.info(`🔬 Analyzing ${symbols.length} coins...`);
    
    const results = [];
    
    // Process coins sequentially to avoid rate limits
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const analysis = await this.analyzeCoin(symbol);
        results.push({
          symbol,
          analysis,
          error: null
        });
        
        // Add delay between coin analysis to respect rate limits
        if (i < symbols.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
        }
      } catch (error) {
        logger.debug(`⚠️ Error analyzing ${symbol}: ${error.message}`);
        results.push({
          symbol,
          analysis: null,
          error: error.message
        });
      }
    }
    
    return results.filter(item => item.analysis !== null);
  }

  /**
   * 📊 Analyze individual coin with sequential data fetching
   */
  async analyzeCoin(symbol) {
    try {
      // Get market data sequentially to avoid rate limits
      const ticker = await this.marketFetcher.get24hTicker(symbol);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      
      const klines4h = await this.marketFetcher.getKlines(symbol, '4h', 50);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      
      const klines1h = await this.marketFetcher.getKlines(symbol, '1h', 100);

      // Calculate scores
      const volumeScore = this.calculateVolumeScore(ticker);
      const trendScore = this.calculateTrendScore(klines4h, klines1h);
      const volatilityScore = this.calculateVolatilityScore(klines1h);
      const momentumScore = this.calculateMomentumScore(ticker, klines1h);
      const liquidityScore = this.calculateLiquidityScore(ticker);

      return {
        symbol,
        ticker,
        scores: {
          volume: volumeScore,
          trend: trendScore,
          volatility: volatilityScore,
          momentum: momentumScore,
          liquidity: liquidityScore
        },
        metrics: {
          volume24h: ticker.volume24h,
          change24h: ticker.change24h,
          price: ticker.price,
          trades: ticker.count
        }
      };
    } catch (error) {
      logger.debug(`⚠️ Error analyzing ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * 📈 Calculate volume score (40% weight)
   */
  calculateVolumeScore(ticker) {
    const volume = ticker.volume24h * ticker.price; // USD volume
    
    if (volume < config.coins.minVolume) return 0;
    
    // Logarithmic scaling for volume
    const logVolume = Math.log10(volume);
    const logMinVolume = Math.log10(config.coins.minVolume);
    const logMaxVolume = Math.log10(100000000); // $100M as high volume
    
    const normalizedScore = Math.min(
      (logVolume - logMinVolume) / (logMaxVolume - logMinVolume),
      1
    );
    
    return Math.max(0, normalizedScore * 100);
  }

  /**
   * 📊 Calculate trend score (35% weight)
   */
  calculateTrendScore(klines4h, klines1h) {
    try {
      // Calculate EMAs for trend analysis
      const prices4h = klines4h.map(k => k.close);
      const prices1h = klines1h.map(k => k.close);
      
      const ema20_4h = this.calculateEMA(prices4h, 20);
      const ema50_4h = this.calculateEMA(prices4h, 50);
      const ema9_1h = this.calculateEMA(prices1h, 9);
      const ema21_1h = this.calculateEMA(prices1h, 21);
      
      // Trend strength indicators
      const trend4h = this.getTrendDirection(ema20_4h, ema50_4h);
      const trend1h = this.getTrendDirection(ema9_1h, ema21_1h);
      const pricePosition4h = this.getPricePosition(prices4h[prices4h.length - 1], ema20_4h, ema50_4h);
      const pricePosition1h = this.getPricePosition(prices1h[prices1h.length - 1], ema9_1h, ema21_1h);
      
      // Calculate trend score
      let trendScore = 0;
      
      // Strong uptrend gets high score
      if (trend4h === 'up' && trend1h === 'up') trendScore += 40;
      else if (trend4h === 'up' || trend1h === 'up') trendScore += 20;
      
      // Price above EMAs
      trendScore += pricePosition4h * 20;
      trendScore += pricePosition1h * 20;
      
      // EMA slope (momentum)
      const emaSlope4h = this.calculateSlope(ema20_4h.slice(-10));
      const emaSlope1h = this.calculateSlope(ema9_1h.slice(-10));
      
      if (emaSlope4h > 0) trendScore += 10;
      if (emaSlope1h > 0) trendScore += 10;
      
      return Math.min(trendScore, 100);
    } catch (error) {
      logger.debug('Error calculating trend score:', error.message);
      return 50; // Neutral score
    }
  }

  /**
   * 🌊 Calculate volatility score (25% weight)
   */
  calculateVolatilityScore(klines) {
    try {
      const prices = klines.map(k => k.close);
      const returns = [];
      
      // Calculate price returns
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
      }
      
      // Calculate volatility (standard deviation)
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance) * 100; // Percentage
      
      // Optimal volatility range: 2-6%
      const optimalMin = 2;
      const optimalMax = 6;
      
      if (volatility < optimalMin) {
        return (volatility / optimalMin) * 50; // Low volatility = lower score
      } else if (volatility <= optimalMax) {
        return 100; // Optimal range = high score
      } else {
        return Math.max(20, 100 - (volatility - optimalMax) * 10); // High volatility = decreasing score
      }
    } catch (error) {
      logger.debug('Error calculating volatility score:', error.message);
      return 50;
    }
  }

  /**
   * 🚀 Calculate momentum score
   */
  calculateMomentumScore(ticker, klines) {
    try {
      let momentumScore = 0;
      
      // 24h change momentum
      const change24h = Math.abs(ticker.change24h);
      if (change24h > 5) momentumScore += 30;
      else if (change24h > 2) momentumScore += 20;
      else if (change24h > 1) momentumScore += 10;
      
      // Recent price action (last 12 hours)
      const recentKlines = klines.slice(-12);
      const recentPrices = recentKlines.map(k => k.close);
      const recentChange = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100;
      
      if (Math.abs(recentChange) > 3) momentumScore += 25;
      else if (Math.abs(recentChange) > 1.5) momentumScore += 15;
      
      // Volume momentum
      const recentVolumes = recentKlines.map(k => k.volume);
      const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
      const currentVolume = recentVolumes[recentVolumes.length - 1];
      
      if (currentVolume > avgVolume * 1.5) momentumScore += 25;
      else if (currentVolume > avgVolume * 1.2) momentumScore += 15;
      
      // Trading activity
      if (ticker.count > 10000) momentumScore += 20;
      else if (ticker.count > 5000) momentumScore += 10;
      
      return Math.min(momentumScore, 100);
    } catch (error) {
      logger.debug('Error calculating momentum score:', error.message);
      return 50;
    }
  }

  /**
   * 💧 Calculate liquidity score
   */
  calculateLiquidityScore(ticker) {
    const spread = Math.abs(ticker.high24h - ticker.low24h) / ticker.price * 100;
    const tradeCount = ticker.count;
    
    let liquidityScore = 0;
    
    // Lower spread = higher liquidity
    if (spread < 5) liquidityScore += 50;
    else if (spread < 10) liquidityScore += 30;
    else if (spread < 15) liquidityScore += 15;
    
    // Higher trade count = higher liquidity
    if (tradeCount > 50000) liquidityScore += 50;
    else if (tradeCount > 20000) liquidityScore += 35;
    else if (tradeCount > 10000) liquidityScore += 20;
    else if (tradeCount > 5000) liquidityScore += 10;
    
    return Math.min(liquidityScore, 100);
  }

  /**
   * 🔍 Filter coins by requirements
   */
  filterCoinsByRequirements(coinAnalysis) {
    return coinAnalysis.filter(coin => {
      const ticker = coin.analysis.ticker;
      const volume = ticker.volume24h * ticker.price;
      
      // Minimum volume requirement
      if (volume < config.coins.minVolume) {
        logger.debug(`❌ ${coin.symbol} rejected: Volume too low (${volume.toFixed(0)})`);
        return false;
      }
      
      // Minimum trade count
      if (ticker.count < 1000) {
        logger.debug(`❌ ${coin.symbol} rejected: Trade count too low (${ticker.count})`);
        return false;
      }
      
      return true;
    });
  }

  /**
   * 📊 Sort coins by total score
   */
  sortCoinsByScore(coinAnalysis) {
    return coinAnalysis.map(coin => {
      const scores = coin.analysis.scores;
      const weights = config.coins.selection;
      
      const totalScore = 
        (scores.volume * weights.volumeWeight / 100) +
        (scores.trend * weights.trendWeight / 100) +
        (scores.volatility * weights.volatilityWeight / 100);
      
      return {
        ...coin,
        totalScore
      };
    }).sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * 📈 Calculate EMA (Exponential Moving Average)
   */
  calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    
    return ema[ema.length - 1];
  }

  /**
   * 🎯 Get trend direction
   */
  getTrendDirection(ema1, ema2) {
    if (ema1 > ema2 * 1.001) return 'up';
    if (ema1 < ema2 * 0.999) return 'down';
    return 'sideways';
  }

  /**
   * 📍 Get price position relative to EMAs
   */
  getPricePosition(price, ema1, ema2) {
    const avgEma = (ema1 + ema2) / 2;
    if (price > avgEma * 1.02) return 1; // Strong above
    if (price > avgEma * 1.005) return 0.5; // Slightly above
    if (price < avgEma * 0.98) return -1; // Strong below
    if (price < avgEma * 0.995) return -0.5; // Slightly below
    return 0; // Around EMAs
  }

  /**
   * 📐 Calculate slope of price array
   */
  calculateSlope(prices) {
    if (prices.length < 2) return 0;
    
    const n = prices.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = prices;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  /**
   * 📊 Get detailed coin analysis
   */
  async getCoinAnalysis(symbol) {
    try {
      const analysis = await this.analyzeCoin(symbol);
      const scores = analysis.scores;
      const weights = config.coins.selection;
      
      const totalScore = 
        (scores.volume * weights.volumeWeight / 100) +
        (scores.trend * weights.trendWeight / 100) +
        (scores.volatility * weights.volatilityWeight / 100);
      
      return {
        ...analysis,
        totalScore,
        recommendation: this.getRecommendation(totalScore)
      };
    } catch (error) {
      logger.error(`❌ Error getting analysis for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 💡 Get trading recommendation based on score
   */
  getRecommendation(score) {
    if (score >= 80) return 'STRONG_BUY';
    if (score >= 65) return 'BUY';
    if (score >= 50) return 'NEUTRAL';
    if (score >= 35) return 'WEAK';
    return 'AVOID';
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    this.coinScores.clear();
    this.marketFetcher.cleanup();
    logger.info('🧹 CoinSelector cleaned up');
  }
}

module.exports = CoinSelector;