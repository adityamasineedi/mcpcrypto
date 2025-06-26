#!/usr/bin/env node

/**
 * 🚀 ProTradeAI - Professional Crypto Signal Bot
 * 
 * Features:
 * - 75%+ win rate targeting $50+ daily profit
 * - AI-powered signals (GPT-4 + Claude)
 * - Market Context Protocol (MCP)
 * - Real-time BingX integration
 * - Telegram notifications & approvals
 * - Smart coin selection
 * - Risk management & position tracking
 * - Performance analytics & reporting
 */

const process = require('process');
const config = require('./config');
const logger = require('./utils/logger');

// Import all modules
const MarketFetcher = require('./marketFetcher');
const CoinSelector = require('./coinSelector');
const MCPEngine = require('./mcpEngine');
const OpenAIEngine = require('./openAIEngine');
const SignalEngine = require('./signalEngine');
const TelegramBot = require('./telegramBot');
const SignalApprovalBot = require('./signalApprovalBot');
const TradeExecutor = require('./tradeExecutor');
const AccuracyLogger = require('./accuracyLogger');
const SignalAPI = require('./signalAPI');
const DailySummaryBot = require('./dailySummaryBot');
const StrategyRegenerator = require('./strategyRegenerator');
const DashboardServer = require('./dashboard-server');
const AdvancedTradeManager = require('./advancedTradeManager'); // ✅ NEW: Advanced Trade Manager

class ProTradeAI {
  constructor() {
    this.modules = {};
    this.initialized = false;
    this.running = false;
    this.signalInterval = null;
    this.monitoringInterval = null;
    this.cleanupInterval = null; // ✅ Add cleanup interval tracking
    
    // ✅ Make bot instance globally available for Advanced Trade Manager
    global.proTradeAI = this;
    
    // ✅ Dynamic frequency adjustment
    this.dynamicInterval = config.strategy.updateInterval; // Start with base interval
    this.currentInterval = config.strategy.updateInterval;
    this.marketActivity = {
      volatility: 'MEDIUM',
      volume: 'NORMAL', 
      signalSuccess: 0.5
    };
  }

  /**
   * 🚀 Initialize the bot
   */
  async init() {
    try {
      logger.info('🚀 Starting ProTradeAI Bot...');
      
      // Validate configuration
      config.init();

      // Display startup banner
      this.displayBanner();

      // Initialize core modules
      await this.initializeModules();

      // Setup event listeners
      this.setupEventListeners();

      // Start main trading loop
      this.startTradingLoop();

      // Start monitoring
      this.startMonitoring();

      // Start periodic cleanup
      this.startPeriodicCleanup(); // ✅ Start the periodic cleanup

      // Initialize and connect dashboard
      this.connectDashboard();

      this.initialized = true;
      this.running = true;

      logger.info('✅ ProTradeAI Bot is now running!');
      
      // Send startup notification
      if (this.modules.telegramBot) {
        await this.modules.telegramBot.sendMessage(
          '🚀 <b>ProTradeAI Bot Started</b>\n\n' +
          `📊 Mode: <b>${config.tradeMode.toUpperCase()}</b>\n` +
          `💰 Capital: <b>$${config.capital.total}</b>\n` +
          `🎯 Daily Target: <b>$${config.profitTargets.daily}</b>\n` +
          `⚖️ Risk per Trade: <b>${config.capital.riskPerTrade}%</b>\n` +
          `🤖 AI Confidence: <b>${config.ai.confidence.minimum}%+</b>\n\n` +
          '🔄 Bot is now actively monitoring markets and generating signals...',
          { parse_mode: 'HTML' }
        );
      }

    } catch (error) {
      logger.error('❌ Failed to initialize ProTradeAI:', error.message);
      process.exit(1);
    }
  }

  /**
   * 🎨 Display startup banner
   */
  displayBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      🚀 PROTRADE AI BOT 🚀                   ║
║                                                              ║
║  Professional Crypto Signal Bot with AI & Risk Management   ║
║                                                              ║
║  📊 Target: $50+ daily profit with 75%+ win rate           ║
║  🤖 AI: GPT-4 + Claude + Market Context Protocol           ║
║  💼 Capital: $${config.capital.total.toString().padEnd(47, ' ')} ║
║  ⚖️  Risk: ${config.capital.riskPerTrade}% per trade${' '.repeat(39)} ║
║  🏦 Exchange: BingX (${config.tradeMode.toUpperCase()} mode)${' '.repeat(32)} ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  }

  /**
   * ⚙️ Initialize all modules
   */
  async initializeModules() {
    logger.info('⚙️ Initializing modules...');

    // Initialize core data modules
    this.modules.marketFetcher = new MarketFetcher();
    await this.modules.marketFetcher.init();

    this.modules.coinSelector = new CoinSelector();
    await this.modules.coinSelector.init();

    this.modules.mcpEngine = new MCPEngine();
    await this.modules.mcpEngine.init();

    this.modules.openaiEngine = new OpenAIEngine();
    await this.modules.openaiEngine.init();

    // Initialize signal engine
    this.modules.signalEngine = new SignalEngine();
    await this.modules.signalEngine.init();

    // Initialize communication modules
    this.modules.telegramBot = new TelegramBot();
    await this.modules.telegramBot.init();

    this.modules.signalApprovalBot = new SignalApprovalBot();
    await this.modules.signalApprovalBot.init();

    // Initialize trading modules
    this.modules.tradeExecutor = new TradeExecutor();
    await this.modules.tradeExecutor.init();

    this.modules.accuracyLogger = new AccuracyLogger();
    await this.modules.accuracyLogger.init();

    // Initialize API server
    this.modules.signalAPI = new SignalAPI();
    await this.modules.signalAPI.init({
      signalEngine: this.modules.signalEngine,
      approvalBot: this.modules.signalApprovalBot,
      telegramBot: this.modules.telegramBot,
      accuracyLogger: this.modules.accuracyLogger,
      tradeExecutor: this.modules.tradeExecutor
    });

    // Initialize automation modules
    this.modules.dailySummaryBot = new DailySummaryBot();
    await this.modules.dailySummaryBot.init({
      accuracyLogger: this.modules.accuracyLogger,
      tradeExecutor: this.modules.tradeExecutor,
      telegramBot: this.modules.telegramBot,
      signalEngine: this.modules.signalEngine,
      mcpEngine: this.modules.mcpEngine
    });

    this.modules.strategyRegenerator = new StrategyRegenerator();
    await this.modules.strategyRegenerator.init({
      openaiEngine: this.modules.openaiEngine,
      mcpEngine: this.modules.mcpEngine,
      coinSelector: this.modules.coinSelector,
      accuracyLogger: this.modules.accuracyLogger,
      telegramBot: this.modules.telegramBot
    });

    // ✅ Initialize Advanced Trade Manager with Multiple Take Profits
    this.modules.advancedTradeManager = new AdvancedTradeManager();
    await this.modules.advancedTradeManager.init();
    logger.info('✅ Advanced Trade Manager with TP1/TP2/TP3 initialized');

    logger.info('✅ All modules initialized successfully');
  }

  /**
   * 🔗 Setup event listeners
   */
  setupEventListeners() {
    // Handle signal approval requests
    this.modules.signalApprovalBot.on('approvalRequested', async (signal) => {
      await this.modules.telegramBot.sendSignal(signal);
    });

    // Handle signal approvals/rejections
    this.modules.signalApprovalBot.on('signalApproved', async (signal, approval) => {
      try {
        const trade = await this.modules.tradeExecutor.executeTrade(signal, approval);
        await this.modules.accuracyLogger.logTrade(trade);
        await this.modules.telegramBot.sendTradeExecution(trade);
      } catch (error) {
        logger.error('❌ Error executing approved trade:', error.message);
        await this.modules.telegramBot.sendError(error, 'Trade execution');
      }
    });

    this.modules.signalApprovalBot.on('signalRejected', (signal, rejection) => {
      logger.info(`❌ Signal rejected: ${signal.symbol} ${signal.type} - ${rejection.reason}`);
    });

    // Handle trade events
    this.modules.tradeExecutor.on('tradeExecuted', async (trade) => {
      await this.modules.accuracyLogger.logTrade(trade);
    });

    this.modules.tradeExecutor.on('positionClosed', async (position, closeTrade) => {
      await this.modules.accuracyLogger.logTrade(closeTrade, position);
      await this.modules.telegramBot.sendTradeExecution(closeTrade);
    });

    this.modules.tradeExecutor.on('tradeError', async (trade, error) => {
      await this.modules.telegramBot.sendError(error, `Trade execution: ${trade.symbol}`);
    });

    // Handle process signals
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      this.gracefulShutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  /**
   * 🔄 Start main trading loop with dynamic frequency adjustment
   */
  startTradingLoop() {
    const generateSignals = async () => {
      try {
        if (!this.running) return;

        logger.info('🔄 Starting signal generation cycle...');

        // ✅ Update market activity metrics and adjust frequency
        this.updateMarketActivity();
        const newInterval = this.adjustSignalFrequency();

        // ✅ Clean up old deduplication data periodically
        this.modules.signalEngine.cleanupOldData();

        // ✅ Log deduplication debug info every few cycles
        if (Math.random() < 0.2) { // 20% chance to log debug info
          const debugInfo = this.modules.signalEngine.getSignalDebugInfo();
          logger.debug('🔍 Signal deduplication status:', debugInfo.summary);
        }

        // Generate new signals
        const signals = await this.modules.signalEngine.generateSignals();

        if (signals.length === 0) {
          logger.info('📊 No high-quality signals found this cycle');
          
          // ✅ Restart timer with new interval if it changed
          if (newInterval !== this.currentInterval) {
            clearInterval(this.signalInterval);
            this.currentInterval = newInterval;
            this.signalInterval = setInterval(generateSignals, newInterval);
            logger.info(`⏰ Updated signal interval to ${newInterval/1000}s (no signals found)`);
          }
          
          return;
        }

        logger.info(`📊 Generated ${signals.length} quality signals`);

        // ✅ Process signals with enhanced deduplication tracking
        const processedSymbols = new Set();
        let processedCount = 0;

        for (const signalItem of signals) {
          const signal = signalItem.signal;
          
          // ✅ Skip if we've already processed this symbol in this cycle
          if (processedSymbols.has(signal.symbol)) {
            logger.debug(`⏭️ Skipping duplicate ${signal.symbol} in same cycle`);
            continue;
          }
          
          processedSymbols.add(signal.symbol);
          
          try {
            // Log signal generation
            await this.modules.accuracyLogger.logSignal(signal);

            // Send signal notification to Telegram FIRST
            await this.modules.telegramBot.sendSignal(signal);

            // Request approval (handles auto-approval if configured)
            const approval = await this.modules.signalApprovalBot.requestApproval(signal);

            if (approval.approved) {
              logger.info(`✅ Signal approved: ${signal.symbol} ${signal.type} (confidence: ${signal.finalConfidence}%)`);
              
              // ✅ FIX: Execute the approved signal
              try {
                // Use Advanced Trade Manager for TP1/TP2/TP3 execution
                if (this.modules.advancedTradeManager && signal.dynamicTPs) {
                  await this.modules.advancedTradeManager.executeSignal(signal);
                  logger.info(`🎯 Advanced trade executed for ${signal.symbol} with multiple TPs`);
                } else {
                  // Fallback to legacy trade executor
                  const trade = await this.modules.tradeExecutor.executeSignal(signal);
                  if (trade) {
                    logger.info(`📈 Trade executed: ${signal.symbol} ${signal.type} @ $${signal.entryPrice}`);
                  }
                }
              } catch (executeError) {
                logger.error(`❌ Trade execution failed for ${signal.symbol}:`, executeError.message);
                await this.modules.telegramBot?.sendError(executeError, `Trade execution failed for ${signal.symbol}`);
              }
            } else {
              logger.info(`❌ Signal not approved: ${signal.symbol} ${signal.type} - ${approval.reason}`);
            }
            
            processedCount++;
            
          } catch (error) {
            logger.error(`❌ Error processing signal for ${signal.symbol}:`, error.message);
          }
        }

        logger.info(`📊 Processed ${processedCount} unique signals successfully`);

        // ✅ Restart timer with new interval if it changed
        if (newInterval !== this.currentInterval) {
          clearInterval(this.signalInterval);
          this.currentInterval = newInterval;
          this.signalInterval = setInterval(generateSignals, newInterval);
          logger.info(`⏰ Updated signal interval to ${newInterval/1000}s`);
        }

      } catch (error) {
        logger.error('❌ Error in trading loop:', error.message);
        await this.modules.telegramBot?.sendError(error, 'Trading loop');
      }
    };

    // Start with initial frequency
    this.currentInterval = this.dynamicInterval;
    generateSignals();
    this.signalInterval = setInterval(generateSignals, this.currentInterval);
    
    logger.info(`🔄 Dynamic trading loop started (initial: ${this.currentInterval/1000}s intervals)`);
  }

  /**
   * 👀 Start monitoring
   */
  startMonitoring() {
    const monitorPositions = async () => {
      try {
        if (!this.running) return;

        // ✅ Monitor Advanced Trade Manager (TP1/TP2/TP3)
        if (this.modules.advancedTradeManager) {
          await this.modules.advancedTradeManager.monitorTrades();
        }

        // Check stop loss and take profit (legacy)
        await this.modules.tradeExecutor.checkStopLossAndTakeProfit();

        // Log system health
        this.logSystemHealth();

      } catch (error) {
        logger.error('❌ Error in monitoring:', error.message);
      }
    };

    // Monitor every minute
    this.monitoringInterval = setInterval(monitorPositions, 60000);
    logger.info('👀 Monitoring started (60s intervals) with Advanced Trade Manager');
  }

  /**
   * 🧹 Start periodic cleanup
   */
  startPeriodicCleanup() {
    const cleanup = async () => {
      try {
        if (!this.running) return;

        // Clean up signal engine deduplication data
        this.modules.signalEngine.cleanupOldData();

        // Log detailed deduplication status
        const debugInfo = this.modules.signalEngine.getSignalDebugInfo();
        logger.info('🧹 Cleanup completed:', {
          activeLocks: debugInfo.summary.totalActiveLocks,
          symbolsTracked: debugInfo.summary.symbolsWithRecentSignals,
          dailySignals: debugInfo.summary.totalDailySignals
        });

        // Optional: garbage collection hint
        if (global.gc) {
          global.gc();
          logger.debug('🗑️ Garbage collection triggered');
        }

      } catch (error) {
        logger.error('❌ Error in periodic cleanup:', error.message);
      }
    };

    // Clean up every 30 minutes
    this.cleanupInterval = setInterval(cleanup, 30 * 60 * 1000);
    logger.info('🧹 Periodic cleanup started (30min intervals)');
  }

  /**
   * 🔄 Dynamic frequency adjustment based on market conditions
   * Reduces API calls by 30-50% during low-activity periods
   */
  adjustSignalFrequency() {
    const baseInterval = config.strategy.updateInterval; // 3 minutes
    let multiplier = 1;
    
    // Market volatility adjustment
    switch (this.marketActivity.volatility) {
      case 'VERY_LOW':
        multiplier *= 3; // Check every 9 minutes during low volatility
        break;
      case 'LOW':
        multiplier *= 2; // Check every 6 minutes
        break;
      case 'MEDIUM':
        multiplier *= 1; // Normal frequency
        break;
      case 'HIGH':
        multiplier *= 0.75; // Check more frequently during high volatility
        break;
      case 'VERY_HIGH':
        multiplier *= 0.5; // Check every 1.5 minutes during extreme volatility
        break;
    }
    
    // Volume adjustment
    if (this.marketActivity.volume === 'VERY_LOW') multiplier *= 1.5;
    else if (this.marketActivity.volume === 'HIGH') multiplier *= 0.8;
    
    // Signal success rate adjustment
    if (this.marketActivity.signalSuccess < 0.3) multiplier *= 1.5; // Slow down if poor success
    else if (this.marketActivity.signalSuccess > 0.7) multiplier *= 0.9; // Speed up if good success
    
    // Apply time-of-day adjustment (market hours vs off-hours)
    const hour = new Date().getUTCHours();
    if (hour >= 22 || hour <= 6) { // Off-hours
      multiplier *= 1.5; // Less frequent during off-hours
    }
    
    // Calculate new interval (min: 1 minute, max: 15 minutes)
    this.dynamicInterval = Math.max(60000, Math.min(900000, baseInterval * multiplier));
    
    logger.info(`🔄 Adjusted signal frequency: ${this.dynamicInterval/1000}s (${multiplier.toFixed(1)}x multiplier)`);
    
    return this.dynamicInterval;
  }

  /**
   * 📊 Update market activity metrics
   */
  updateMarketActivity() {
    try {
      // Get current market context
      const marketContext = this.modules.mcpEngine?.getMarketContext();
      if (marketContext) {
        this.marketActivity.volatility = marketContext.volatility || 'MEDIUM';
        this.marketActivity.volume = marketContext.volume || 'NORMAL';
      }
      
      // Calculate signal success rate from recent signals
      const stats = this.modules.signalEngine?.getSignalStats();
      if (stats && stats.recentSignals.length > 5) {
        const recent = stats.recentSignals.slice(-10);
        const successful = recent.filter(s => s.finalConfidence > 75).length;
        this.marketActivity.signalSuccess = successful / recent.length;
      }
      
      logger.debug(`📊 Market activity: Volatility=${this.marketActivity.volatility}, Volume=${this.marketActivity.volume}, Success=${(this.marketActivity.signalSuccess * 100).toFixed(1)}%`);
    } catch (error) {
      logger.error('❌ Error updating market activity:', error.message);
    }
  }

  /**
   * 📊 Log system health
   */
  logSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    logger.debug('📊 System Health:', {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      memory: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      mode: config.tradeMode,
      running: this.running
    });
  }

  /**
   * 📊 Get bot status
   */
  getStatus() {
    const account = this.modules.tradeExecutor?.getAccountSummary() || {};
    const signalStats = this.modules.signalEngine?.getSignalStats() || {};
    const cacheStats = this.modules.openAIEngine?.getCacheStats() || {};
    
    return {
      running: this.running,
      initialized: this.initialized,
      uptime: process.uptime(),
      mode: config.tradeMode,
      account: account,
      signals: signalStats,
      // ✅ Dynamic frequency information
      frequency: {
        current: this.currentInterval,
        base: config.strategy.updateInterval,
        multiplier: (this.currentInterval / config.strategy.updateInterval).toFixed(2),
        marketActivity: this.marketActivity
      },
      // ✅ AI caching statistics
      aiCache: cacheStats,
      lastUpdate: Date.now()
    };
  }

  /**
   * ⚠️ Handle emergency stop
   */
  async emergencyStop(reason = 'Manual emergency stop') {
    try {
      logger.warn(`🚨 Emergency stop triggered: ${reason}`);

      // Stop trading loop
      if (this.signalInterval) {
        clearInterval(this.signalInterval);
        this.signalInterval = null;
      }

      // Reject all pending signals
      if (this.modules.signalApprovalBot) {
        await this.modules.signalApprovalBot.emergencyRejectAll(reason);
      }

      // Notify via Telegram
      if (this.modules.telegramBot) {
        await this.modules.telegramBot.sendMessage(
          `🚨 <b>EMERGENCY STOP</b>\n\n` +
          `📍 Reason: ${reason}\n` +
          `⏰ Time: ${new Date().toLocaleString()}\n\n` +
          `• Trading loop stopped\n` +
          `• Pending signals rejected\n` +
          `• Manual intervention required`,
          { parse_mode: 'HTML' }
        );
      }

      this.running = false;
      logger.warn('🚨 Emergency stop completed');

    } catch (error) {
      logger.error('❌ Error during emergency stop:', error.message);
    }
  }

  /**
   * 🔄 Restart bot
   */
  async restart() {
    try {
      logger.info('🔄 Restarting ProTradeAI...');
      
      await this.gracefulShutdown(false);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.init();
      
    } catch (error) {
      logger.error('❌ Error during restart:', error.message);
      process.exit(1);
    }
  }

  /**
   * 🧹 Graceful shutdown
   */
  async gracefulShutdown(exit = true) {
    try {
      logger.info('🧹 Initiating graceful shutdown...');
      
      this.running = false;

      // Clear intervals
      if (this.signalInterval) {
        clearInterval(this.signalInterval);
        this.signalInterval = null;
      }
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Cleanup all modules
      const cleanupPromises = Object.entries(this.modules).map(async ([name, module]) => {
        try {
          if (module && typeof module.cleanup === 'function') {
            logger.debug(`🧹 Cleaning up ${name}...`);
            await Promise.race([
              module.cleanup(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 5000))
            ]);
            logger.debug(`✅ ${name} cleaned up successfully`);
          } else {
            logger.debug(`⚠️ ${name} has no cleanup method or is not initialized`);
          }
        } catch (error) {
          logger.error(`❌ Error cleaning up ${name}: ${error.message}`);
          // Continue with other cleanups even if one fails
        }
      });

      await Promise.allSettled(cleanupPromises);

      // Send shutdown notification
      if (this.modules.telegramBot && this.initialized) {
        await this.modules.telegramBot.sendMessage(
          '🛑 <b>ProTradeAI Bot Shutdown</b>\n\n' +
          '• All modules cleaned up\n' +
          '• Trading stopped\n' +
          '• Data saved\n\n' +
          `⏰ ${new Date().toLocaleString()}`,
          { parse_mode: 'HTML' }
        );
      }

      logger.info('✅ Graceful shutdown completed');
      
      if (exit) {
        process.exit(0);
      }

    } catch (error) {
      logger.error('❌ Error during shutdown:', error.message);
      if (exit) {
        process.exit(1);
      }
    }
  }

  /**
   * 🌐 Connect dashboard to live bot
   */
  connectDashboard() {
    try {
      // Connect the dashboard server to this bot instance
      if (DashboardServer && typeof DashboardServer.connectLiveBot === 'function') {
        DashboardServer.connectLiveBot(this);
        logger.info('✅ Dashboard connected to live bot data');
        
        // Start the dashboard server if it has a start function
        if (typeof DashboardServer.startDashboardServer === 'function') {
          DashboardServer.startDashboardServer();
          logger.info('🌐 Dashboard server started on port 3000');
        }
      } else {
        logger.warn('⚠️ Dashboard server not available for live connection');
      }
    } catch (error) {
      logger.warn('⚠️ Failed to connect dashboard:', error.message);
    }
  }
}

// Create and start the bot
const bot = new ProTradeAI();

// Export for testing/external use
module.exports = bot;

// Auto-start if run directly
if (require.main === module) {
  bot.init().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}