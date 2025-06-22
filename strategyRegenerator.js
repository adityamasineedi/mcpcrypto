const cron = require('node-cron');
const config = require('./config');
const logger = require('./utils/logger');

class StrategyRegenerator {
  constructor() {
    this.openaiEngine = null;
    this.mcpEngine = null;
    this.coinSelector = null;
    this.accuracyLogger = null;
    this.telegramBot = null;
    this.currentStrategies = [];
    this.strategyHistory = [];
    this.cronJobs = [];
    this.initialized = false;
  }

  /**
   * 🚀 Initialize Strategy Regenerator
   */
  async init(dependencies = {}) {
    try {
      // Store dependencies
      this.openaiEngine = dependencies.openaiEngine;
      this.mcpEngine = dependencies.mcpEngine;
      this.coinSelector = dependencies.coinSelector;
      this.accuracyLogger = dependencies.accuracyLogger;
      this.telegramBot = dependencies.telegramBot;

      // Schedule daily strategy refresh
      this.scheduleDailyRefresh();

      // Schedule market regime change refresh
      this.scheduleMarketRegimeRefresh();

      // Generate initial strategies
      await this.refreshStrategies('initialization');

      this.initialized = true;
      logger.info('✅ Strategy Regenerator initialized');
    } catch (error) {
      logger.error('❌ Strategy Regenerator initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * ⏰ Schedule daily strategy refresh
   */
  scheduleDailyRefresh() {
    // Run every day at 06:00 (before market activity)
    const dailyJob = cron.schedule('0 6 * * *', async () => {
      await this.refreshStrategies('daily_scheduled');
    }, {
      scheduled: true,
      timezone: config.timezone || 'UTC'
    });

    this.cronJobs.push({ name: 'daily_strategy_refresh', job: dailyJob });
    logger.info('⏰ Daily strategy refresh scheduled for 06:00');
  }

  /**
   * 📊 Schedule market regime change refresh
   */
  scheduleMarketRegimeRefresh() {
    // Check for market regime changes every 2 hours
    const regimeJob = cron.schedule('0 */2 * * *', async () => {
      await this.checkMarketRegimeChange();
    }, {
      scheduled: true,
      timezone: config.timezone || 'UTC'
    });

    this.cronJobs.push({ name: 'market_regime_check', job: regimeJob });
    logger.info('📊 Market regime monitoring scheduled every 2 hours');
  }

  /**
   * 🔄 Refresh trading strategies
   */
  async refreshStrategies(trigger = 'manual') {
    try {
      logger.info(`🔄 Refreshing strategies (trigger: ${trigger})...`);

      // Collect market intelligence
      const marketIntelligence = await this.gatherMarketIntelligence();

      // Generate new strategies using AI
      const newStrategies = await this.generateFreshStrategies(marketIntelligence);

      // Validate and rank strategies
      const validatedStrategies = await this.validateStrategies(newStrategies, marketIntelligence);

      // Archive current strategies
      if (this.currentStrategies.length > 0) {
        this.archiveCurrentStrategies();
      }

      // Activate new strategies
      this.currentStrategies = validatedStrategies;

      // Log strategy change
      this.logStrategyRefresh(trigger, validatedStrategies);

      // Notify via Telegram
      if (this.telegramBot && config.telegram.enabled) {
        await this.notifyStrategyRefresh(validatedStrategies, trigger);
      }

      logger.info(`✅ Strategies refreshed: ${validatedStrategies.length} new strategies activated`);
      return validatedStrategies;

    } catch (error) {
      logger.error('❌ Error refreshing strategies:', error.message);
      return this.currentStrategies; // Return existing strategies on error
    }
  }

  /**
   * 🧠 Gather market intelligence
   */
  async gatherMarketIntelligence() {
    const intelligence = {
      timestamp: Date.now(),
      marketContext: null,
      coinAnalysis: [],
      performanceHistory: null,
      recentTrends: null
    };

    try {
      // Get market context from MCP
      if (this.mcpEngine) {
        intelligence.marketContext = await this.mcpEngine.updateMarketContextIfNeeded();
      }

      // Get top performing coins
      if (this.coinSelector) {
        const selectedCoins = await this.coinSelector.updateCoinSelectionIfNeeded();
        intelligence.coinAnalysis = selectedCoins.slice(0, 10); // Top 10 coins
      }

      // Get recent performance data
      if (this.accuracyLogger) {
        intelligence.performanceHistory = await this.accuracyLogger.getStats('7d');
        intelligence.recentTrends = await this.analyzeRecentTrends();
      }

      // Determine market conditions summary
      intelligence.marketSummary = this.summarizeMarketConditions(intelligence);

      return intelligence;
    } catch (error) {
      logger.error('❌ Error gathering market intelligence:', error.message);
      return intelligence;
    }
  }

  /**
   * 🔮 Generate fresh strategies using AI
   */
  async generateFreshStrategies(marketIntelligence) {
    try {
      if (!this.openaiEngine) {
        return this.generateMockStrategies(marketIntelligence);
      }

      const prompt = this.buildStrategyPrompt(marketIntelligence);
      const aiStrategies = await this.openaiEngine.generateDailyStrategy(
        marketIntelligence.marketContext,
        marketIntelligence.coinAnalysis
      );

      // Parse and enhance AI strategies
      const strategies = this.parseAIStrategies(aiStrategies);

      // Add additional strategies based on market conditions
      const adaptiveStrategies = this.generateAdaptiveStrategies(marketIntelligence);

      return [...strategies, ...adaptiveStrategies];
    } catch (error) {
      logger.error('❌ Error generating AI strategies:', error.message);
      return this.generateMockStrategies(marketIntelligence);
    }
  }

  /**
   * 📝 Build strategy generation prompt
   */
  buildStrategyPrompt(intelligence) {
    const marketContext = intelligence.marketContext || {};
    const performance = intelligence.performanceHistory || {};
    
    return `Generate 5 adaptive crypto trading strategies for current market conditions:

MARKET INTELLIGENCE:
- Regime: ${marketContext.regime || 'UNKNOWN'}
- Sentiment: ${marketContext.sentiment || 'NEUTRAL'} 
- Fear/Greed: ${marketContext.fearGreedIndex || 50}
- Volatility: ${marketContext.volatility || 'MEDIUM'}

RECENT PERFORMANCE:
- Win Rate: ${performance.winRate?.toFixed(1) || 'N/A'}%
- Total Trades: ${performance.totalTrades || 0}
- Best Strategy: ${this.getBestRecentStrategy()}
- Market Trends: ${intelligence.marketSummary || 'Mixed signals'}

TOP COINS: ${intelligence.coinAnalysis.slice(0, 5).join(', ') || 'BTC, ETH, SOL, LINK, OP'}

REQUIREMENTS:
- Target: $50+ daily profit with 75%+ win rate
- Capital: $${config.capital.total}
- Risk: ${config.capital.riskPerTrade}% per trade
- Max positions: ${config.capital.maxConcurrentTrades}

Focus on:
1. Market regime-specific strategies
2. High-probability setups
3. Clear entry/exit rules
4. Risk management
5. Current market momentum

Return strategies with specific coins, entry conditions, and profit targets.`;
  }

  /**
   * ✅ Validate generated strategies
   */
  async validateStrategies(strategies, marketIntelligence) {
    const validatedStrategies = [];

    for (const strategy of strategies) {
      try {
        // Basic validation
        const validation = this.validateStrategy(strategy);
        if (!validation.valid) {
          logger.warn(`⚠️ Strategy rejected: ${validation.reason}`);
          continue;
        }

        // Market compatibility check
        const compatibility = this.checkMarketCompatibility(strategy, marketIntelligence);
        if (compatibility.score < 60) {
          logger.warn(`⚠️ Strategy low compatibility: ${strategy.name} (${compatibility.score}%)`);
          continue;
        }

        // Risk assessment
        const riskAssessment = this.assessStrategyRisk(strategy, marketIntelligence);
        strategy.riskScore = riskAssessment.score;
        strategy.riskFactors = riskAssessment.factors;

        // Performance prediction
        const prediction = this.predictStrategyPerformance(strategy, marketIntelligence);
        strategy.expectedWinRate = prediction.winRate;
        strategy.expectedProfit = prediction.dailyProfit;

        // Add metadata
        strategy.id = `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        strategy.createdAt = Date.now();
        strategy.marketConditions = {
          regime: marketIntelligence.marketContext?.regime,
          sentiment: marketIntelligence.marketContext?.sentiment,
          volatility: marketIntelligence.marketContext?.volatility
        };

        validatedStrategies.push(strategy);
      } catch (error) {
        logger.error(`❌ Error validating strategy ${strategy.name}:`, error.message);
      }
    }

    // Sort by expected performance
    validatedStrategies.sort((a, b) => b.expectedProfit - a.expectedProfit);

    // Limit to top strategies
    return validatedStrategies.slice(0, 5);
  }

  /**
   * ✅ Validate individual strategy
   */
  validateStrategy(strategy) {
    // Check required fields
    const requiredFields = ['name', 'description', 'coins', 'setup', 'risk'];
    for (const field of requiredFields) {
      if (!strategy[field]) {
        return { valid: false, reason: `Missing required field: ${field}` };
      }
    }

    // Check coins are valid
    if (!Array.isArray(strategy.coins) || strategy.coins.length === 0) {
      return { valid: false, reason: 'Invalid or empty coins array' };
    }

    // Check risk level
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(strategy.risk)) {
      return { valid: false, reason: 'Invalid risk level' };
    }

    return { valid: true };
  }

  /**
   * 🎯 Check market compatibility
   */
  checkMarketCompatibility(strategy, intelligence) {
    let score = 50; // Base score
    const marketContext = intelligence.marketContext || {};

    // Strategy type vs market regime
    if (strategy.type === 'trend_following' && marketContext.regime === 'BULL') score += 20;
    if (strategy.type === 'mean_reversion' && marketContext.regime === 'SIDEWAYS') score += 20;
    if (strategy.type === 'breakout' && marketContext.volatility === 'HIGH') score += 15;

    // Risk level vs market conditions
    if (strategy.risk === 'LOW' && marketContext.volatility === 'HIGH') score += 10;
    if (strategy.risk === 'HIGH' && marketContext.regime === 'BEAR') score -= 20;

    // Coin selection vs current top performers
    const topCoins = intelligence.coinAnalysis.slice(0, 5);
    const matchingCoins = strategy.coins.filter(coin => topCoins.includes(coin));
    score += (matchingCoins.length / strategy.coins.length) * 20;

    return { score: Math.min(100, Math.max(0, score)) };
  }

  /**
   * ⚠️ Assess strategy risk
   */
  assessStrategyRisk(strategy, intelligence) {
    const riskFactors = [];
    let riskScore = 50; // Base neutral risk

    // Market volatility risk
    const volatility = intelligence.marketContext?.volatility;
    if (volatility === 'VERY_HIGH') {
      riskScore += 20;
      riskFactors.push('High market volatility');
    }

    // Strategy complexity risk
    if (strategy.setup.split(' ').length > 20) {
      riskScore += 10;
      riskFactors.push('Complex setup conditions');
    }

    // Coin concentration risk
    if (strategy.coins.length === 1) {
      riskScore += 15;
      riskFactors.push('Single coin exposure');
    }

    // Market regime mismatch risk
    const regime = intelligence.marketContext?.regime;
    if ((strategy.type === 'long_only' && regime === 'BEAR') ||
        (strategy.type === 'short_only' && regime === 'BULL')) {
      riskScore += 25;
      riskFactors.push('Strategy-regime mismatch');
    }

    return {
      score: Math.min(100, Math.max(0, riskScore)),
      factors: riskFactors
    };
  }

  /**
   * 📊 Predict strategy performance
   */
  predictStrategyPerformance(strategy, intelligence) {
    let winRate = 65; // Base win rate
    let dailyProfit = 30; // Base daily profit

    // Adjust based on market compatibility
    const compatibility = this.checkMarketCompatibility(strategy, intelligence);
    winRate += (compatibility.score - 50) * 0.3;

    // Adjust based on risk level
    switch (strategy.risk) {
      case 'LOW':
        winRate += 10;
        dailyProfit += 5;
        break;
      case 'MEDIUM':
        winRate += 5;
        dailyProfit += 15;
        break;
      case 'HIGH':
        winRate -= 5;
        dailyProfit += 25;
        break;
    }

    // Adjust based on recent performance
    const recentPerformance = intelligence.performanceHistory;
    if (recentPerformance && recentPerformance.winRate > 75) {
      winRate += 5; // Momentum bonus
      dailyProfit += 10;
    }

    return {
      winRate: Math.min(95, Math.max(45, winRate)),
      dailyProfit: Math.min(100, Math.max(10, dailyProfit))
    };
  }

  /**
   * 🎲 Generate adaptive strategies based on market conditions
   */
  generateAdaptiveStrategies(intelligence) {
    const strategies = [];
    const marketContext = intelligence.marketContext || {};
    const topCoins = intelligence.coinAnalysis.slice(0, 3);

    // Bull market strategy
    if (marketContext.regime === 'BULL') {
      strategies.push({
        name: 'Bull Market Momentum',
        description: 'Ride strong uptrends with momentum indicators',
        type: 'trend_following',
        coins: topCoins,
        setup: 'Price above EMA9 + EMA21, RSI > 50, increasing volume',
        risk: 'MEDIUM',
        entryConditions: ['EMA9 > EMA21', 'Price > EMA9', 'RSI > 50', 'Volume > 1.2x avg'],
        exitConditions: ['RSI > 80', 'Price < EMA9', 'Volume spike down'],
        stopLoss: '3%',
        takeProfit: '6%',
        timeframe: '15m-1h',
        maxPositions: 2
      });
    }

    // Bear market strategy
    if (marketContext.regime === 'BEAR') {
      strategies.push({
        name: 'Bear Market Defense',
        description: 'Conservative shorts and bounces',
        type: 'defensive',
        coins: ['BTC', 'ETH'], // Stick to major coins in bear market
        setup: 'Price below EMA21, RSI < 40, breakdown confirmation',
        risk: 'LOW',
        entryConditions: ['Price < EMA21', 'RSI < 40', 'Volume confirmation'],
        exitConditions: ['RSI < 30', 'Support level test'],
        stopLoss: '2%',
        takeProfit: '4%',
        timeframe: '1h-4h',
        maxPositions: 1
      });
    }

    // High volatility strategy
    if (marketContext.volatility === 'HIGH' || marketContext.volatility === 'VERY_HIGH') {
      strategies.push({
        name: 'Volatility Breakout',
        description: 'Capture breakouts during high volatility',
        type: 'breakout',
        coins: topCoins,
        setup: 'Bollinger Band squeeze release + volume spike',
        risk: 'HIGH',
        entryConditions: ['BB squeeze', 'Volume > 2x avg', 'Price breakout'],
        exitConditions: ['BB upper/lower touch', 'Volume exhaustion'],
        stopLoss: '4%',
        takeProfit: '8%',
        timeframe: '5m-15m',
        maxPositions: 1
      });
    }

    // Sideways market strategy
    if (marketContext.regime === 'SIDEWAYS') {
      strategies.push({
        name: 'Range Trading',
        description: 'Trade within established ranges',
        type: 'mean_reversion',
        coins: topCoins,
        setup: 'Clear support/resistance levels, RSI extremes',
        risk: 'MEDIUM',
        entryConditions: ['Support/resistance test', 'RSI < 35 or > 65', 'Range confirmed'],
        exitConditions: ['Opposite range level', 'RSI mean reversion'],
        stopLoss: '2.5%',
        takeProfit: '5%',
        timeframe: '15m-1h',
        maxPositions: 2
      });
    }

    return strategies;
  }

  /**
   * 🎲 Generate mock strategies (fallback)
   */
  generateMockStrategies(intelligence) {
    const topCoins = intelligence.coinAnalysis.slice(0, 3) || ['BTC', 'ETH', 'SOL'];
    
    return [
      {
        name: 'EMA Golden Cross',
        description: 'Classic EMA 9/21 crossover with volume confirmation',
        type: 'trend_following',
        coins: topCoins,
        setup: 'EMA9 crosses above EMA21 with volume spike',
        risk: 'LOW',
        profit_potential: '$25-35'
      },
      {
        name: 'RSI Oversold Bounce',
        description: 'Buy oversold conditions in uptrend',
        type: 'mean_reversion',
        coins: ['BTC', 'ETH'],
        setup: 'RSI < 35 in established uptrend',
        risk: 'MEDIUM',
        profit_potential: '$20-30'
      },
      {
        name: 'MACD Momentum',
        description: 'Trade MACD histogram expansion',
        type: 'momentum',
        coins: topCoins,
        setup: 'MACD > Signal + expanding histogram',
        risk: 'MEDIUM',
        profit_potential: '$30-40'
      }
    ];
  }

  /**
   * 📊 Parse AI-generated strategies
   */
  parseAIStrategies(aiResponse) {
    try {
      if (aiResponse.strategies && Array.isArray(aiResponse.strategies)) {
        return aiResponse.strategies.map(strategy => ({
          ...strategy,
          type: this.determineStrategyType(strategy),
          entryConditions: this.parseSetup(strategy.setup),
          exitConditions: ['Take profit hit', 'Stop loss hit', 'Signal reversal'],
          timeframe: '15m-1h',
          maxPositions: 1
        }));
      }
      return [];
    } catch (error) {
      logger.error('❌ Error parsing AI strategies:', error.message);
      return [];
    }
  }

  /**
   * 🔍 Determine strategy type from description
   */
  determineStrategyType(strategy) {
    const description = (strategy.description || '').toLowerCase();
    const setup = (strategy.setup || '').toLowerCase();
    const combined = description + ' ' + setup;

    if (combined.includes('crossover') || combined.includes('trend') || combined.includes('momentum')) {
      return 'trend_following';
    }
    if (combined.includes('oversold') || combined.includes('overbought') || combined.includes('reversal')) {
      return 'mean_reversion';
    }
    if (combined.includes('breakout') || combined.includes('break') || combined.includes('volume')) {
      return 'breakout';
    }
    return 'mixed';
  }

  /**
   * 📋 Parse setup conditions
   */
  parseSetup(setup) {
    if (!setup) return [];
    
    // Simple parsing of setup conditions
    return setup.split(/[+&,]/).map(condition => condition.trim()).filter(Boolean);
  }

  /**
   * 📊 Check for market regime changes
   */
  async checkMarketRegimeChange() {
    try {
      if (!this.mcpEngine) return;

      const currentContext = this.mcpEngine.getMarketContext();
      const lastKnownRegime = this.getLastKnownRegime();

      if (currentContext.regime !== lastKnownRegime && lastKnownRegime !== null) {
        logger.info(`📊 Market regime changed: ${lastKnownRegime} → ${currentContext.regime}`);
        
        // Trigger strategy refresh for significant regime changes
        if (this.isSignificantRegimeChange(lastKnownRegime, currentContext.regime)) {
          await this.refreshStrategies('market_regime_change');
        }
      }

      this.updateLastKnownRegime(currentContext.regime);
    } catch (error) {
      logger.error('❌ Error checking market regime change:', error.message);
    }
  }

  /**
   * 🔄 Check if regime change is significant
   */
  isSignificantRegimeChange(oldRegime, newRegime) {
    const significantChanges = [
      ['BULL', 'BEAR'],
      ['BEAR', 'BULL'],
      ['SIDEWAYS', 'BULL'],
      ['SIDEWAYS', 'BEAR']
    ];

    return significantChanges.some(([from, to]) => 
      oldRegime === from && newRegime === to
    );
  }

  /**
   * 📊 Analyze recent trends
   */
  async analyzeRecentTrends() {
    try {
      if (!this.accuracyLogger) return 'No trend data available';

      const recentStats = await this.accuracyLogger.getStats('3d');
      
      if (recentStats.winRate > 80) return 'Strong uptrend in performance';
      if (recentStats.winRate < 50) return 'Performance declining';
      if (recentStats.totalTrades < 5) return 'Low trading activity';
      
      return 'Stable performance trend';
    } catch (error) {
      return 'Trend analysis unavailable';
    }
  }

  /**
   * 📋 Summarize market conditions
   */
  summarizeMarketConditions(intelligence) {
    const context = intelligence.marketContext || {};
    const parts = [];

    if (context.regime) parts.push(`${context.regime.toLowerCase()} market`);
    if (context.sentiment) parts.push(`${context.sentiment.toLowerCase()} sentiment`);
    if (context.volatility) parts.push(`${context.volatility.toLowerCase()} volatility`);

    return parts.join(', ') || 'Mixed market conditions';
  }

  /**
   * 📈 Get best recent strategy
   */
  getBestRecentStrategy() {
    if (this.strategyHistory.length === 0) return 'No history available';
    
    const recent = this.strategyHistory.slice(-5);
    const best = recent.reduce((best, strategy) => 
      (strategy.performance?.profit || 0) > (best.performance?.profit || 0) ? strategy : best
    );
    
    return best.name || 'Unknown strategy';
  }

  /**
   * 📚 Archive current strategies
   */
  archiveCurrentStrategies() {
    const archived = this.currentStrategies.map(strategy => ({
      ...strategy,
      archivedAt: Date.now(),
      performance: strategy.performance || null
    }));

    this.strategyHistory.push(...archived);
    
    // Keep only last 50 strategies in history
    if (this.strategyHistory.length > 50) {
      this.strategyHistory = this.strategyHistory.slice(-50);
    }
  }

  /**
   * 📝 Log strategy refresh
   */
  logStrategyRefresh(trigger, strategies) {
    const logEntry = {
      timestamp: Date.now(),
      trigger,
      strategiesCount: strategies.length,
      strategies: strategies.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        risk: s.risk,
        expectedWinRate: s.expectedWinRate,
        expectedProfit: s.expectedProfit
      }))
    };

    logger.info('📝 Strategy refresh logged:', logEntry);
  }

  /**
   * 📢 Notify strategy refresh via Telegram
   */
  async notifyStrategyRefresh(strategies, trigger) {
    try {
      let message = `🔄 <b>Strategies Refreshed</b>\n\n`;
      message += `🎯 <b>Trigger:</b> ${trigger.replace(/_/g, ' ')}\n`;
      message += `📊 <b>New Strategies:</b> ${strategies.length}\n\n`;

      strategies.slice(0, 3).forEach((strategy, index) => {
        message += `${index + 1}. <b>${strategy.name}</b>\n`;
        message += `   • Risk: ${strategy.risk}\n`;
        message += `   • Expected Win Rate: ${strategy.expectedWinRate?.toFixed(1) || 'N/A'}%\n`;
        message += `   • Coins: ${strategy.coins.slice(0, 3).join(', ')}\n\n`;
      });

      message += `⏰ <i>${new Date().toLocaleString()}</i>`;

      await this.telegramBot.sendMessage(message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('❌ Error sending strategy refresh notification:', error.message);
    }
  }

  /**
   * 📊 Get current strategies
   */
  getCurrentStrategies() {
    return this.currentStrategies;
  }

  /**
   * 📈 Get strategy performance
   */
  getStrategyPerformance(strategyId) {
    const strategy = this.currentStrategies.find(s => s.id === strategyId) ||
                    this.strategyHistory.find(s => s.id === strategyId);
    
    return strategy?.performance || null;
  }

  /**
   * 🏆 Get best performing strategies
   */
  getBestPerformingStrategies(limit = 5) {
    return this.strategyHistory
      .filter(s => s.performance && s.performance.trades > 3)
      .sort((a, b) => (b.performance.winRate || 0) - (a.performance.winRate || 0))
      .slice(0, limit);
  }

  /**
   * 📚 Utility methods for regime tracking
   */
  getLastKnownRegime() {
    return this._lastKnownRegime || null;
  }

  updateLastKnownRegime(regime) {
    this._lastKnownRegime = regime;
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    // Stop all cron jobs
    this.cronJobs.forEach(({ name, job }) => {
      job.destroy();
      logger.debug(`⏰ Stopped cron job: ${name}`);
    });
    
    this.cronJobs = [];
    this.currentStrategies = [];
    
    logger.info('🧹 Strategy Regenerator cleaned up');
  }
}

module.exports = StrategyRegenerator;