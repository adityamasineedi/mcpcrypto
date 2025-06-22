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

class ProTradeAI {
  constructor() {
    this.modules = {};
    this.initialized = false;
    this.running = false;
    this.signalInterval = null;
    this.monitoringInterval = null;
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
   * 🔄 Start main trading loop
   */
  startTradingLoop() {
    const generateSignals = async () => {
      try {
        if (!this.running) return;

        logger.info('🔄 Starting signal generation cycle...');

        // Generate new signals
        const signals = await this.modules.signalEngine.generateSignals();

        if (signals.length === 0) {
          logger.info('📊 No high-quality signals found this cycle');
          return;
        }

        logger.info(`📊 Generated ${signals.length} quality signals`);

        // Process each signal
        for (const signalItem of signals) {
          const signal = signalItem.signal;
          
          // Log signal generation
          await this.modules.accuracyLogger.logSignal(signal);

          // Send signal notification to Telegram FIRST
          await this.modules.telegramBot.sendSignal(signal);

          // Request approval (handles auto-approval if configured)
          const approval = await this.modules.signalApprovalBot.requestApproval(signal);

          if (approval.approved) {
            logger.info(`✅ Signal approved: ${signal.symbol} ${signal.type}`);
          } else {
            logger.info(`❌ Signal not approved: ${signal.symbol} ${signal.type} - ${approval.reason}`);
          }
        }

      } catch (error) {
        logger.error('❌ Error in trading loop:', error.message);
        await this.modules.telegramBot?.sendError(error, 'Trading loop');
      }
    };

    // Run immediately, then on interval
    generateSignals();
    
    this.signalInterval = setInterval(generateSignals, config.strategy.updateInterval);
    logger.info(`🔄 Trading loop started (${config.strategy.updateInterval / 1000}s intervals)`);
  }

  /**
   * 👀 Start monitoring
   */
  startMonitoring() {
    const monitorPositions = async () => {
      try {
        if (!this.running) return;

        // Check stop loss and take profit
        await this.modules.tradeExecutor.checkStopLossAndTakeProfit();

        // Log system health
        this.logSystemHealth();

      } catch (error) {
        logger.error('❌ Error in monitoring:', error.message);
      }
    };

    // Monitor every minute
    this.monitoringInterval = setInterval(monitorPositions, 60000);
    logger.info('👀 Monitoring started (60s intervals)');
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
    
    return {
      running: this.running,
      initialized: this.initialized,
      uptime: process.uptime(),
      mode: config.tradeMode,
      account: account,
      signals: signalStats,
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

      // Cleanup all modules
      const cleanupPromises = Object.entries(this.modules).map(async ([name, module]) => {
        try {
          if (module && typeof module.cleanup === 'function') {
            await module.cleanup();
            logger.debug(`✅ ${name} cleaned up`);
          }
        } catch (error) {
          logger.error(`❌ Error cleaning up ${name}:`, error.message);
        }
      });

      await Promise.all(cleanupPromises);

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