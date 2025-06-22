const axios = require('axios');
const config = require('./config');
const logger = require('./utils/logger');
const MarketFetcher = require('./marketFetcher');

class MCPEngine {
  constructor() {
    this.marketFetcher = new MarketFetcher();
    this.marketContext = {
      regime: 'SIDEWAYS',
      confidence: 50,
      fearGreedIndex: 50,
      sentiment: 'NEUTRAL',
      volatility: 'MEDIUM',
      volume: 'NORMAL',
      lastUpdate: 0
    };
    this.updateInterval = config.mcp.refreshInterval; // 1 hour
  }

  /**
   * 🚀 Initialize MCP Engine
   */
  async init() {
    try {
      await this.marketFetcher.init();
      await this.updateMarketContext();
      logger.info('✅ MCP Engine initialized');
    } catch (error) {
      logger.error('❌ MCP Engine initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 🎯 Get current market context
   */
  getMarketContext() {
    return { ...this.marketContext };
  }

  /**
   * 🔄 Update market context if needed
   */
  async updateMarketContextIfNeeded() {
    const now = Date.now();
    if (now - this.marketContext.lastUpdate > this.updateInterval) {
      await this.updateMarketContext();
    }
    return this.getMarketContext();
  }

  /**
   * 🌍 Update complete market context
   */
  async updateMarketContext() {
    try {
      logger.info('🔍 Updating market context...');

      // Get all context data in parallel
      const [
        fearGreedData,
        sentimentData,
        marketMetrics,
        majorCoinAnalysis
      ] = await Promise.allSettled([
        this.getFearGreedIndex(),
        this.getSentimentAnalysis(),
        this.getMarketMetrics(),
        this.analyzeMajorCoins()
      ]);

      // Extract data from settled promises
      const fearGreed = fearGreedData.status === 'fulfilled' ? fearGreedData.value : 50;
      const sentiment = sentimentData.status === 'fulfilled' ? sentimentData.value : { score: 50, label: 'NEUTRAL' };
      const metrics = marketMetrics.status === 'fulfilled' ? marketMetrics.value : this.getDefaultMetrics();
      const coinAnalysis = majorCoinAnalysis.status === 'fulfilled' ? majorCoinAnalysis.value : this.getDefaultCoinAnalysis();

      // Calculate market regime
      const regime = this.calculateMarketRegime(fearGreed, sentiment, metrics, coinAnalysis);
      const confidence = this.calculateConfidence(fearGreed, sentiment, metrics, coinAnalysis);

      // Update market context
      this.marketContext = {
        regime: regime.regime,
        confidence: confidence,
        fearGreedIndex: fearGreed,
        sentiment: sentiment.label,
        volatility: metrics.volatility,
        volume: metrics.volume,
        trends: {
          short: coinAnalysis.shortTrend,
          medium: coinAnalysis.mediumTrend,
          long: coinAnalysis.longTrend
        },
        dominance: {
          btc: coinAnalysis.btcDominance,
          eth: coinAnalysis.ethDominance
        },
        signals: regime.signals,
        lastUpdate: Date.now()
      };

      logger.info(`✅ Market context updated:`, {
        regime: this.marketContext.regime,
        confidence: this.marketContext.confidence,
        sentiment: this.marketContext.sentiment,
        fearGreed: this.marketContext.fearGreedIndex
      });

    } catch (error) {
      logger.error('❌ Error updating market context:', error.message);
      // Keep previous context but update timestamp
      this.marketContext.lastUpdate = Date.now();
    }
  }

  /**
   * 😨 Get Fear & Greed Index
   */
  async getFearGreedIndex() {
    try {
      if (config.mockData.enabled) {
        return this.generateMockFearGreed();
      }

      const response = await axios.get('https://api.alternative.me/fng/', {
        timeout: 10000
      });

      if (response.data && response.data.data && response.data.data[0]) {
        const fngData = response.data.data[0];
        return parseInt(fngData.value);
      }

      return 50; // Neutral fallback
    } catch (error) {
      logger.warn('⚠️ Could not fetch Fear & Greed Index, using mock data');
      return this.generateMockFearGreed();
    }
  }

  /**
   * 🎭 Get sentiment analysis from multiple sources
   */
  async getSentimentAnalysis() {
    try {
      if (config.mockData.enabled) {
        return this.generateMockSentiment();
      }

      // Try to get sentiment from news/social media
      const sentiment = await this.aggregateSentimentSources();
      return sentiment;
    } catch (error) {
      logger.warn('⚠️ Could not fetch sentiment data, using mock data');
      return this.generateMockSentiment();
    }
  }

  /**
   * 📊 Get market metrics (volatility, volume, etc.)
   */
  async getMarketMetrics() {
    try {
      // Get Bitcoin data as market leader
      const btcKlines = await this.marketFetcher.getKlines('BTC', '4h', 50);
      const btcTicker = await this.marketFetcher.get24hTicker('BTC');

      // Calculate volatility
      const volatility = this.calculateVolatility(btcKlines);
      const volatilityLabel = this.getVolatilityLabel(volatility);

      // Calculate volume
      const avgVolume = this.calculateAverageVolume(btcKlines);
      const currentVolume = btcTicker.volume24h;
      const volumeRatio = currentVolume / avgVolume;
      const volumeLabel = this.getVolumeLabel(volumeRatio);

      return {
        volatility: volatilityLabel,
        volume: volumeLabel,
        volatilityValue: volatility,
        volumeRatio: volumeRatio,
        btcPrice: btcTicker.price,
        btcChange: btcTicker.change24h
      };
    } catch (error) {
      logger.error('❌ Error calculating market metrics:', error.message);
      return this.getDefaultMetrics();
    }
  }

  /**
   * 🪙 Analyze major coins for market trends
   */
  async analyzeMajorCoins() {
    try {
      const majorCoins = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT'];
      const coinPromises = majorCoins.map(coin => this.analyzeCoinTrend(coin));
      const results = await Promise.allSettled(coinPromises);

      const validResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      if (validResults.length === 0) {
        return this.getDefaultCoinAnalysis();
      }

      // Calculate trend consensus
      const shortTrends = validResults.map(r => r.shortTrend);
      const mediumTrends = validResults.map(r => r.mediumTrend);
      const longTrends = validResults.map(r => r.longTrend);

      return {
        shortTrend: this.calculateTrendConsensus(shortTrends),
        mediumTrend: this.calculateTrendConsensus(mediumTrends),
        longTrend: this.calculateTrendConsensus(longTrends),
        btcDominance: await this.calculateBTCDominance(),
        ethDominance: await this.calculateETHDominance(),
        coinCount: validResults.length
      };
    } catch (error) {
      logger.error('❌ Error analyzing major coins:', error.message);
      return this.getDefaultCoinAnalysis();
    }
  }

  /**
   * 📈 Analyze individual coin trend
   */
  async analyzeCoinTrend(symbol) {
    try {
      const [klines4h, klines1h, klines15m] = await Promise.all([
        this.marketFetcher.getKlines(symbol, '4h', 50),
        this.marketFetcher.getKlines(symbol, '1h', 50),
        this.marketFetcher.getKlines(symbol, '15m', 50)
      ]);

      const prices4h = klines4h.map(k => k.close);
      const prices1h = klines1h.map(k => k.close);
      const prices15m = klines15m.map(k => k.close);

      return {
        symbol,
        shortTrend: this.calculateTrendDirection(prices15m),
        mediumTrend: this.calculateTrendDirection(prices1h),
        longTrend: this.calculateTrendDirection(prices4h)
      };
    } catch (error) {
      logger.debug(`⚠️ Error analyzing ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * 🧮 Calculate market regime
   */
  calculateMarketRegime(fearGreed, sentiment, metrics, coinAnalysis) {
    const weights = config.mcp;
    let bullScore = 0;
    let bearScore = 0;

    // Fear & Greed Index influence
    if (fearGreed > 70) bullScore += weights.fearGreedWeight;
    else if (fearGreed < 30) bearScore += weights.fearGreedWeight;

    // Sentiment influence
    if (sentiment.score > 60) bullScore += weights.sentimentWeight;
    else if (sentiment.score < 40) bearScore += weights.sentimentWeight;

    // Volume influence
    if (metrics.volumeRatio > 1.3) bullScore += weights.volumeWeight;
    else if (metrics.volumeRatio < 0.7) bearScore += weights.volumeWeight;

    // Volatility influence (high volatility can be bull or bear)
    if (metrics.volatilityValue > 4) {
      if (fearGreed > 50) bullScore += weights.volatilityWeight * 0.5;
      else bearScore += weights.volatilityWeight * 0.5;
    }

    // Trend consensus
    const trendWeight = 25;
    if (coinAnalysis.longTrend === 'BULLISH') bullScore += trendWeight;
    else if (coinAnalysis.longTrend === 'BEARISH') bearScore += trendWeight;

    if (coinAnalysis.mediumTrend === 'BULLISH') bullScore += trendWeight * 0.5;
    else if (coinAnalysis.mediumTrend === 'BEARISH') bearScore += trendWeight * 0.5;

    // Determine regime
    let regime = 'SIDEWAYS';
    let signals = [];

    if (bullScore > bearScore + 20) {
      regime = 'BULL';
      signals = ['FAVOR_LONGS', 'BREAKOUT_POTENTIAL', 'MOMENTUM_TRADES'];
    } else if (bearScore > bullScore + 20) {
      regime = 'BEAR';
      signals = ['FAVOR_SHORTS', 'BREAKDOWN_RISK', 'DEFENSIVE_TRADES'];
    } else {
      regime = 'SIDEWAYS';
      signals = ['RANGE_BOUND', 'MEAN_REVERSION', 'LOW_CONVICTION'];
    }

    return { regime, signals, bullScore, bearScore };
  }

  /**
   * 🎯 Calculate confidence level
   */
  calculateConfidence(fearGreed, sentiment, metrics, coinAnalysis) {
    let confidence = 50; // Base confidence

    // Strong Fear & Greed signals increase confidence
    if (fearGreed > 80 || fearGreed < 20) confidence += 15;
    else if (fearGreed > 70 || fearGreed < 30) confidence += 10;

    // Consistent sentiment increases confidence
    if (sentiment.score > 70 || sentiment.score < 30) confidence += 10;

    // High volume increases confidence
    if (metrics.volumeRatio > 1.5) confidence += 10;

    // Trend consensus increases confidence
    const trendConsistency = this.calculateTrendConsistency(coinAnalysis);
    confidence += trendConsistency * 15;

    // Volatility affects confidence
    if (metrics.volatilityValue > 6) confidence -= 10; // Very high volatility reduces confidence
    else if (metrics.volatilityValue < 1) confidence -= 5; // Very low volatility also reduces confidence

    return Math.max(20, Math.min(95, confidence));
  }

  /**
   * 🌊 Calculate volatility from klines
   */
  calculateVolatility(klines) {
    const prices = klines.map(k => k.close);
    const returns = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100; // Percentage volatility
  }

  /**
   * 📊 Calculate average volume
   */
  calculateAverageVolume(klines) {
    const volumes = klines.map(k => k.volume);
    return volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
  }

  /**
   * 📈 Calculate trend direction from prices
   */
  calculateTrendDirection(prices) {
    if (prices.length < 10) return 'NEUTRAL';

    const ema9 = this.calculateEMA(prices, 9);
    const ema21 = this.calculateEMA(prices, 21);
    const currentPrice = prices[prices.length - 1];

    const slope = this.calculateSlope(prices.slice(-10));
    
    if (currentPrice > ema9 && ema9 > ema21 && slope > 0) return 'BULLISH';
    if (currentPrice < ema9 && ema9 < ema21 && slope < 0) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * 🗳️ Calculate trend consensus
   */
  calculateTrendConsensus(trends) {
    const bullish = trends.filter(t => t === 'BULLISH').length;
    const bearish = trends.filter(t => t === 'BEARISH').length;
    const neutral = trends.filter(t => t === 'NEUTRAL').length;

    if (bullish > bearish + neutral) return 'BULLISH';
    if (bearish > bullish + neutral) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * 📊 Calculate trend consistency
   */
  calculateTrendConsistency(coinAnalysis) {
    const trends = [coinAnalysis.shortTrend, coinAnalysis.mediumTrend, coinAnalysis.longTrend];
    const uniqueTrends = [...new Set(trends)];
    
    if (uniqueTrends.length === 1) return 1; // All same direction
    if (uniqueTrends.length === 2) return 0.5; // Mixed signals
    return 0; // All different
  }

  /**
   * 🪙 Calculate BTC dominance
   */
  async calculateBTCDominance() {
    try {
      // Simplified BTC dominance calculation
      // In a real implementation, you'd fetch total market cap data
      const btcTicker = await this.marketFetcher.get24hTicker('BTC');
      const ethTicker = await this.marketFetcher.get24hTicker('ETH');
      
      // Estimate based on major coins (simplified)
      const btcVolume = btcTicker.volume24h * btcTicker.price;
      const ethVolume = ethTicker.volume24h * ethTicker.price;
      const totalVolume = btcVolume + ethVolume;
      
      return (btcVolume / totalVolume) * 100;
    } catch (error) {
      return 45; // Default BTC dominance
    }
  }

  /**
   * 🏛️ Calculate ETH dominance
   */
  async calculateETHDominance() {
    try {
      const btcTicker = await this.marketFetcher.get24hTicker('BTC');
      const ethTicker = await this.marketFetcher.get24hTicker('ETH');
      
      const btcVolume = btcTicker.volume24h * btcTicker.price;
      const ethVolume = ethTicker.volume24h * ethTicker.price;
      const totalVolume = btcVolume + ethVolume;
      
      return (ethVolume / totalVolume) * 100;
    } catch (error) {
      return 20; // Default ETH dominance
    }
  }

  /**
   * 📰 Aggregate sentiment from multiple sources
   */
  async aggregateSentimentSources() {
    // This would integrate with news APIs, social media sentiment, etc.
    // For now, we'll use a simplified approach
    
    try {
      // You could integrate with:
      // - Twitter API for crypto sentiment
      // - News APIs like NewsAPI, CryptoPanic
      // - Reddit sentiment analysis
      // - Google Trends
      
      // Simplified sentiment based on Fear & Greed and market momentum
      const fearGreed = await this.getFearGreedIndex();
      let sentimentScore = fearGreed;
      
      // Adjust based on recent market performance
      const btcTicker = await this.marketFetcher.get24hTicker('BTC');
      if (btcTicker.change24h > 5) sentimentScore += 10;
      else if (btcTicker.change24h < -5) sentimentScore -= 10;
      
      sentimentScore = Math.max(0, Math.min(100, sentimentScore));
      
      let label = 'NEUTRAL';
      if (sentimentScore > 70) label = 'BULLISH';
      else if (sentimentScore < 30) label = 'BEARISH';
      
      return { score: sentimentScore, label };
    } catch (error) {
      return { score: 50, label: 'NEUTRAL' };
    }
  }

  /**
   * 📊 Helper methods for labeling
   */
  getVolatilityLabel(volatility) {
    if (volatility > 6) return 'VERY_HIGH';
    if (volatility > 4) return 'HIGH';
    if (volatility > 2) return 'MEDIUM';
    if (volatility > 1) return 'LOW';
    return 'VERY_LOW';
  }

  getVolumeLabel(ratio) {
    if (ratio > 2) return 'VERY_HIGH';
    if (ratio > 1.5) return 'HIGH';
    if (ratio > 0.8) return 'NORMAL';
    if (ratio > 0.5) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * 🧪 Mock data generators
   */
  generateMockFearGreed() {
    return Math.floor(Math.random() * 100);
  }

  generateMockSentiment() {
    const score = Math.floor(Math.random() * 100);
    let label = 'NEUTRAL';
    if (score > 70) label = 'BULLISH';
    else if (score < 30) label = 'BEARISH';
    return { score, label };
  }

  getDefaultMetrics() {
    return {
      volatility: 'MEDIUM',
      volume: 'NORMAL',
      volatilityValue: 3,
      volumeRatio: 1,
      btcPrice: 65000,
      btcChange: 0
    };
  }

  getDefaultCoinAnalysis() {
    return {
      shortTrend: 'NEUTRAL',
      mediumTrend: 'NEUTRAL',
      longTrend: 'NEUTRAL',
      btcDominance: 45,
      ethDominance: 20,
      coinCount: 0
    };
  }

  /**
   * 📊 Utility methods
   */
  calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    
    return ema[ema.length - 1];
  }

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
   * 🧹 Cleanup resources
   */
  cleanup() {
    this.marketFetcher.cleanup();
    logger.info('🧹 MCP Engine cleaned up');
  }
}

module.exports = MCPEngine;