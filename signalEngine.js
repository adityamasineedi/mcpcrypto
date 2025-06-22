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

      // Generate signals for each coin
      const signalPromises = selectedCoins.map(coin => this.generateCoinSignal(coin, marketContext));
      const results = await Promise.allSettled(signalPromises);

      // Process results
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
   * 🪙 Generate signal for individual coin
   */
  async generateCoinSignal(symbol, marketContext) {
    try {
      // Check if too soon since last signal
      if (this.isSignalTooSoon(symbol)) {
        return null;
      }

      // Get market data
      const [ticker, klines4h, klines1h, klines15m] = await Promise.all([
        this.marketFetcher.get24hTicker(symbol),
        this.marketFetcher.getKlines(symbol, '4h', 100),
        this.marketFetcher.getKlines(symbol, '1h', 100),
        this.marketFetcher.getKlines(symbol, '15m', 100)
      ]);

      // Calculate technical indicators
      const technicalData = this.calculateTechnicalIndicators(klines4h, klines1h, klines15m, ticker);

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
   * 📊 Calculate technical indicators
   */
  calculateTechnicalIndicators(klines4h, klines1h, klines15m, ticker) {
    const closes4h = klines4h.map(k => k.close);
    const closes1h = klines1h.map(k => k.close);
    const closes15m = klines15m.map(k => k.close);
    const volumes1h = klines1h.map(k => k.volume);

    // RSI
    const rsi = RSI.calculate({ values: closes1h, period: config.indicators.rsi.period });
    const currentRSI = rsi[rsi.length - 1];

    // MACD
    const macdData = MACD.calculate({
      values: closes1h,
      fastPeriod: config.indicators.macd.fast,
      slowPeriod: config.indicators.macd.slow,
      signalPeriod: config.indicators.macd.signal,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const currentMACD = macdData[macdData.length - 1];

    // EMAs
    const ema9 = EMA.calculate({ values: closes1h, period: config.indicators.ema.fast });
    const ema21 = EMA.calculate({ values: closes1h, period: config.indicators.ema.medium });
    const ema50 = EMA.calculate({ values: closes1h, period: config.indicators.ema.slow });
    const ema200_4h = EMA.calculate({ values: closes4h, period: 200 });

    // Bollinger Bands
    const bb = BollingerBands.calculate({
      values: closes1h,
      period: config.indicators.bollinger.period,
      stdDev: config.indicators.bollinger.deviation
    });
    const currentBB = bb[bb.length - 1];

    // Volume analysis
    const avgVolume = volumes1h.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
    const volumeRatio = ticker.volume24h / avgVolume;

    // Price analysis
    const currentPrice = ticker.price;
    const change24h = ticker.change24h;

    // Support/Resistance levels
    const supportResistance = this.calculateSupportResistance(klines4h);

    return {
      currentPrice,
      change24h,
      rsi: currentRSI,
      macd: currentMACD,
      ema9: ema9[ema9.length - 1],
      ema21: ema21[ema21.length - 1],
      ema50: ema50[ema50.length - 1],
      ema200_4h: ema200_4h[ema200_4h.length - 1],
      bollingerBands: currentBB,
      volumeRatio,
      avgVolume,
      volatility: this.calculateVolatility(closes1h),
      momentum: this.calculateMomentum(closes15m),
      supportResistance,
      technicalScore: 0 // Will be calculated in generateTechnicalSignal
    };
  }

  /**
   * 📈 Generate technical signal
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

    // 2. RSI Signals
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

    // 5. Support/Resistance
    const srSignal = this.analyzeSupportResistance(tech);
    if (srSignal.signal !== 'NEUTRAL') {
      signals.push(srSignal);
      confidence += srSignal.weight;
    }

    // 6. Bollinger Bands
    const bbSignal = this.analyzeBollingerBands(tech);
    if (bbSignal.signal !== 'NEUTRAL') {
      signals.push(bbSignal);
      confidence += bbSignal.weight;
    }

    // Determine overall signal
    if (signals.length === 0) {
      return { type: 'HOLD', confidence: 0, reasoning: 'No clear signals' };
    }

    const bullishSignals = signals.filter(s => s.signal === 'LONG').length;
    const bearishSignals = signals.filter(s => s.signal === 'SHORT').length;

    let signalType = 'HOLD';
    let strength = 'WEAK';

    if (bullishSignals > bearishSignals && confidence > 60) {
      signalType = 'LONG';
      strength = confidence > 80 ? 'STRONG' : confidence > 70 ? 'MEDIUM' : 'WEAK';
    } else if (bearishSignals > bullishSignals && confidence > 60) {
      signalType = 'SHORT';
      strength = confidence > 80 ? 'STRONG' : confidence > 70 ? 'MEDIUM' : 'WEAK';
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
      reasoning: this.buildSignalReasoning(signals),
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
   * 📊 Analyze RSI
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
   * 📊 Analyze Support/Resistance
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
      weight = 15;
    } else if (nearResistance && tech.rsi > 55) {
      signal = 'SHORT';
      weight = 15;
    }
    
    return { indicator: 'SUPPORT_RESISTANCE', signal, weight };
  }

  /**
   * 📊 Analyze Bollinger Bands
   */
  analyzeBollingerBands(tech) {
    const { currentPrice, bollingerBands } = tech;
    
    let signal = 'NEUTRAL';
    let weight = 0;
    
    if (!bollingerBands) return { indicator: 'BOLLINGER_BANDS', signal, weight };
    
    const { upper, middle, lower } = bollingerBands;
    
    // Price near lower band (oversold)
    if (currentPrice <= lower * 1.01) {
      signal = 'LONG';
      weight = 10;
    }
    // Price near upper band (overbought)
    else if (currentPrice >= upper * 0.99) {
      signal = 'SHORT';
      weight = 10;
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
    const finalConfidence = Math.min(100, Math.max(0, aiAnalysis.confidence));
    
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
   * 📝 Build signal reasoning
   */
  buildSignalReasoning(signals) {
    const indicators = signals.map(s => s.indicator).join(', ');
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    
    return `Technical confluence: ${indicators}. Total weight: ${totalWeight}%`;
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
   * 🧮 Utility calculations
   */
  calculateVolatility(prices) {
    if (prices.length < 20) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100;
  }

  calculateMomentum(prices) {
    if (prices.length < 20) return 0;
    
    const recent = prices.slice(-10);
    const older = prices.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;
    
    return (recentAvg - olderAvg) / olderAvg * 100;
  }

  calculateSupportResistance(klines) {
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    
    // Simple support/resistance calculation
    const support = [];
    const resistance = [];
    
    // Find recent lows (support)
    for (let i = 2; i < lows.length - 2; i++) {
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
          lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        support.push(lows[i]);
      }
    }
    
    // Find recent highs (resistance)
    for (let i = 2; i < highs.length - 2; i++) {
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
          highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        resistance.push(highs[i]);
      }
    }
    
    return {
      support: support.slice(-3), // Last 3 support levels
      resistance: resistance.slice(-3) // Last 3 resistance levels
    };
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