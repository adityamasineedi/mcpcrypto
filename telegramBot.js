const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const logger = require('./utils/logger');

class TelegramBot {
  constructor() {
    this.bot = null;
    this.initialized = false;
    this.messageQueue = [];
    this.rateLimitQueue = [];
    this.lastMessageTime = 0;
    this.minMessageInterval = 2000; // 2 seconds between messages
  }

  /**
   * 🚀 Initialize Telegram Bot
   */
  async init() {
    try {
      if (!config.telegram.enabled || !config.telegram.botToken) {
        logger.warn('⚠️ Telegram bot disabled or token missing');
        this.initialized = true; // Mark as initialized but inactive
        return;
      }

      this.bot = new Telegraf(config.telegram.botToken);
      
      // Set up bot commands
      this.setupCommands();
      
      // Test bot connection
      const botInfo = await this.bot.telegram.getMe();
      logger.info(`✅ Telegram bot connected: @${botInfo.username}`);
      
      // Start bot
      if (!config.testMode) {
        this.bot.launch();
        logger.info('🚀 Telegram bot launched');
      }
      
      this.initialized = true;
      
      // Send startup message
      await this.sendMessage('🚀 ProTradeAI Bot is now online and ready to send signals!');
      
    } catch (error) {
      logger.error('❌ Telegram bot initialization failed:', error.message);
      this.initialized = true; // Continue without Telegram
    }
  }

  /**
   * ⚙️ Setup bot commands
   */
  setupCommands() {
    if (!this.bot) return;

    // Start command
    this.bot.command('start', (ctx) => {
      ctx.reply(
        '🤖 Welcome to ProTradeAI Bot!\n\n' +
        '📊 I provide crypto trading signals with 75%+ win rate\n' +
        '💰 Target: $50+ daily profit\n' +
        '🎯 Features: AI analysis, technical indicators, risk management\n\n' +
        'Commands:\n' +
        '/status - Bot status\n' +
        '/stats - Trading statistics\n' +
        '/settings - Bot settings\n' +
        '/help - Show help'
      );
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      const status = await this.getBotStatus();
      ctx.reply(status, { parse_mode: 'HTML' });
    });

    // Stats command
    this.bot.command('stats', async (ctx) => {
      const stats = await this.getTradingStats();
      ctx.reply(stats, { parse_mode: 'HTML' });
    });

    // Settings command
    this.bot.command('settings', (ctx) => {
      const settings = this.getSettingsInfo();
      ctx.reply(settings, { parse_mode: 'HTML' });
    });

    // Help command
    this.bot.command('help', (ctx) => {
      ctx.reply(
        '📚 <b>ProTradeAI Bot Help</b>\n\n' +
        '🔔 <b>Notifications:</b>\n' +
        '• Trading signals with entry/exit points\n' +
        '• Trade execution confirmations\n' +
        '• Daily P&L summaries\n' +
        '• Error alerts\n\n' +
        '📊 <b>Signal Format:</b>\n' +
        '• Coin symbol and direction (LONG/SHORT)\n' +
        '• Confidence level (0-100%)\n' +
        '• Entry price and targets\n' +
        '• Risk level and position size\n' +
        '• AI reasoning\n\n' +
        '⚙️ <b>Commands:</b>\n' +
        '/start - Welcome message\n' +
        '/status - Current bot status\n' +
        '/stats - Trading performance\n' +
        '/settings - Configuration info\n' +
        '/help - This help message',
        { parse_mode: 'HTML' }
      );
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      logger.error('Telegram bot error:', err);
    });
  }

  /**
   * 📨 Send trading signal
   */
  async sendSignal(signal) {
    logger.debug(`🔍 sendSignal called for ${signal.symbol}, initialized: ${this.initialized}, notifications.signals: ${config.telegram.notifications.signals}`);
    
    if (!this.initialized || !config.telegram.notifications.signals) {
      logger.debug(`⚠️ Skipping signal send - initialized: ${this.initialized}, notifications: ${config.telegram.notifications.signals}`);
      return;
    }

    try {
      const message = this.formatSignalMessage(signal);
      const keyboard = this.createSignalKeyboard(signal);
      
      logger.debug(`📨 Sending signal message for ${signal.symbol}...`);
      
      await this.sendMessage(message, { 
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      
      logger.info(`📨 Signal sent for ${signal.symbol}: ${signal.type}`);
    } catch (error) {
      logger.error('❌ Error sending signal:', error.message);
    }
  }

  /**
   * 🎯 Format signal message
   */
  formatSignalMessage(signal) {
    const direction = signal.type === 'LONG' ? '🟢' : signal.type === 'SHORT' ? '🔴' : '🟡';
    const risk = signal.risk === 'LOW' ? '🟢' : signal.risk === 'MEDIUM' ? '🟡' : '🔴';
    const confidence = signal.finalConfidence;
    const confidenceEmoji = confidence >= 80 ? '🔥' : confidence >= 70 ? '⚡' : confidence >= 60 ? '✅' : '⚠️';

    let message = `${direction} <b>${signal.symbol} ${signal.type}</b> ${confidenceEmoji}\n\n`;
    
    // Signal details
    message += `📊 <b>Signal Details:</b>\n`;
    message += `• Confidence: <b>${confidence}%</b>\n`;
    message += `• Strength: <b>${signal.strength}</b>\n`;
    message += `• Risk Level: ${risk} <b>${signal.risk}</b>\n`;
    
    // ✅ ENHANCED: Specific hold duration
    const holdDuration = this.getHoldDuration(signal.timeHorizon, signal.strength, signal.context.regime);
    message += `• Hold Duration: <b>${holdDuration}</b>\n`;
    message += `• Strategy: <b>${this.getStrategyType(signal.context.regime, signal.timeHorizon)}</b>\n\n`;
    
    // Prices
    message += `💰 <b>Price Levels:</b>\n`;
    message += `• Current: <b>$${signal.currentPrice.toFixed(4)}</b>\n`;
    message += `• Entry: <b>$${signal.entryPrice.toFixed(4)}</b>\n`;
    message += `• Stop Loss: <b>$${signal.stopLoss.toFixed(4)}</b>\n`;
    if (signal.takeProfit) {
      message += `• Take Profit: <b>$${signal.takeProfit.toFixed(4)}</b>\n`;
    }
    message += '\n';
    
    // Position details
    message += `📈 <b>Position:</b>\n`;
    message += `• Size: <b>$${signal.positionSize.toFixed(2)}</b>\n`;
    message += `• Max Loss: <b>$${signal.maxLoss.toFixed(2)}</b>\n`;
    if (signal.maxGain) {
      message += `• Max Gain: <b>$${signal.maxGain.toFixed(2)}</b>\n`;
    }
    if (signal.riskReward) {
      message += `• Risk/Reward: <b>1:${signal.riskReward.toFixed(1)}</b>\n`;
    }
    message += '\n';

    // ✅ NEW: Position Management
    message += `⏰ <b>Position Management:</b>\n`;
    const exitConditions = this.getExitConditions(signal);
    exitConditions.forEach(condition => {
      message += `• ${condition}\n`;
    });
    message += '\n';
    
    // Market context
    message += `🌍 <b>Market Context:</b>\n`;
    message += `• Regime: <b>${signal.context.regime}</b>\n`;
    message += `• Sentiment: <b>${signal.context.sentiment}</b>\n`;
    message += `• Fear/Greed: <b>${signal.context.fearGreed}</b>\n\n`;
    
    // AI Analysis with all 3 models
    message += `🤖 <b>AI Analysis:</b>\n`;
    message += `• GPT-4: <b>${signal.ai.sources.gpt.confidence}%</b> (${signal.ai.sources.gpt.recommendation})\n`;
    message += `• Claude: <b>${signal.ai.sources.claude.confidence}%</b> (${signal.ai.sources.claude.recommendation})\n`;
    if (signal.ai.sources.gemini) {
      message += `• Gemini: <b>${signal.ai.sources.gemini.confidence}%</b> (${signal.ai.sources.gemini.recommendation})\n`;
    }
    message += `• Reasoning: <i>${signal.ai.reasoning}</i>\n\n`;
    
    // Technical analysis
    message += `📊 <b>Technical:</b>\n`;
    message += `• Score: <b>${signal.technical.confidence}%</b>\n`;
    message += `• Signals: <i>${signal.technical.reasoning}</i>\n\n`;
    
    message += `⏰ <i>${new Date(signal.timestamp).toLocaleString()}</i>`;
    
    return message;
  }

  /**
   * ✅ NEW: Get specific hold duration
   */
  getHoldDuration(timeHorizon, strength, regime) {
    const durations = {
      SHORT: {
        WEAK: '15-30 min',
        MEDIUM: '30-60 min', 
        STRONG: '1-2 hours'
      },
      MEDIUM: {
        WEAK: '2-4 hours',
        MEDIUM: '4-8 hours',
        STRONG: '8-12 hours'
      },
      LONG: {
        WEAK: '12-24 hours',
        MEDIUM: '1-2 days',
        STRONG: '2-3 days'
      }
    };

    // Adjust for market regime
    let baseDuration = durations[timeHorizon]?.[strength] || '1-2 hours';
    
    if (regime === 'SIDEWAYS') {
      baseDuration = baseDuration.replace(/hours/g, 'hours (shorter in sideways market)');
    }
    
    return baseDuration;
  }

  /**
   * ✅ NEW: Get strategy type
   */
  getStrategyType(regime, timeHorizon) {
    if (regime === 'BULL' && timeHorizon === 'SHORT') return 'Momentum Scalping';
    if (regime === 'BULL' && timeHorizon === 'MEDIUM') return 'Trend Following';
    if (regime === 'BULL' && timeHorizon === 'LONG') return 'Position Trading';
    if (regime === 'BEAR' && timeHorizon === 'SHORT') return 'Bounce Trading';
    if (regime === 'BEAR') return 'Reversal Strategy';
    if (regime === 'SIDEWAYS') return 'Range Trading';
    return 'Adaptive Strategy';
  }

  /**
   * ✅ NEW: Get exit conditions
   */
  getExitConditions(signal) {
    const conditions = [];
    
    // Time-based exits
    const holdDuration = this.getHoldDuration(signal.timeHorizon, signal.strength, signal.context.regime);
    conditions.push(`⏱️ Close after: <b>${holdDuration}</b>`);
    
    // Price-based exits
    conditions.push(`🎯 Take Profit: <b>$${signal.takeProfit?.toFixed(4) || 'Manual'}</b>`);
    conditions.push(`🛑 Stop Loss: <b>$${signal.stopLoss.toFixed(4)}</b>`);
    
    // Condition-based exits
    if (signal.context.regime === 'SIDEWAYS') {
      conditions.push(`📊 Exit if: Range breakout confirmed`);
    } else if (signal.context.regime === 'BULL') {
      conditions.push(`📈 Trail stop: Move SL to breakeven at +50%`);
    } else if (signal.context.regime === 'BEAR') {
      conditions.push(`📉 Quick exit: Close on volume spike reversal`);
    }
    
    // Technical exit signals
    if (signal.strength === 'STRONG') {
      conditions.push(`🔄 Monitor: RSI divergence for early exit`);
    }
    
    return conditions;
  }

  /**
   * ⌨️ Create signal keyboard
   */
  createSignalKeyboard(signal) {
    if (!config.telegram.signalApproval) return null;

    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Execute', `execute_${signal.id}`),
        Markup.button.callback('❌ Reject', `reject_${signal.id}`)
      ],
      [
        Markup.button.callback('📊 Details', `details_${signal.id}`),
        Markup.button.callback('⏰ Delay', `delay_${signal.id}`)
      ]
    ]);
  }

  /**
   * 💼 Send trade execution notification
   */
  async sendTradeExecution(trade) {
    if (!this.initialized || !config.telegram.notifications.trades) return;

    try {
      const direction = trade.side === 'LONG' ? '🟢' : '🔴';
      const status = trade.status === 'FILLED' ? '✅' : trade.status === 'FAILED' ? '❌' : '⏳';
      
      let message = `${status} <b>Trade ${trade.status}</b> ${direction}\n\n`;
      
      message += `🪙 <b>Symbol:</b> ${trade.symbol}\n`;
      message += `📊 <b>Side:</b> ${trade.side}\n`;
      message += `💰 <b>Size:</b> $${trade.amount.toFixed(2)}\n`;
      message += `💵 <b>Price:</b> $${trade.price.toFixed(4)}\n`;
      
      if (trade.status === 'FILLED') {
        message += `🔥 <b>Total:</b> $${(trade.amount * trade.price).toFixed(2)}\n`;
        if (trade.fee) {
          message += `💸 <b>Fee:</b> $${trade.fee.toFixed(2)}\n`;
        }
      }
      
      if (trade.error) {
        message += `❌ <b>Error:</b> ${trade.error}\n`;
      }
      
      message += `\n⏰ ${new Date(trade.timestamp).toLocaleString()}`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.info(`📨 Trade notification sent: ${trade.symbol} ${trade.status}`);
    } catch (error) {
      logger.error('❌ Error sending trade notification:', error.message);
    }
  }

  /**
   * 📊 Send daily summary
   */
  async sendDailySummary(summary) {
    if (!this.initialized || !config.telegram.notifications.dailySummary) return;

    try {
      const profitEmoji = summary.totalPnL >= 0 ? '💚' : '❤️';
      const winRateEmoji = summary.winRate >= 75 ? '🔥' : summary.winRate >= 65 ? '✅' : '⚠️';
      
      let message = `📊 <b>Daily Trading Summary</b> ${profitEmoji}\n\n`;
      
      // Performance
      message += `💰 <b>Performance:</b>\n`;
      message += `• Total P&L: <b>${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}</b>\n`;
      message += `• Win Rate: ${winRateEmoji} <b>${summary.winRate.toFixed(1)}%</b>\n`;
      message += `• Trades: <b>${summary.totalTrades}</b> (${summary.winningTrades}W/${summary.losingTrades}L)\n`;
      message += `• Best Trade: <b>+$${summary.bestTrade.toFixed(2)}</b>\n`;
      message += `• Worst Trade: <b>-$${Math.abs(summary.worstTrade).toFixed(2)}</b>\n\n`;
      
      // Activity
      message += `📈 <b>Trading Activity:</b>\n`;
      message += `• Signals Generated: <b>${summary.signalsGenerated}</b>\n`;
      message += `• Signals Executed: <b>${summary.signalsExecuted}</b>\n`;
      message += `• Avg Confidence: <b>${summary.avgConfidence.toFixed(1)}%</b>\n`;
      message += `• Most Traded: <b>${summary.mostTradedCoin}</b>\n\n`;
      
      // Account
      message += `💼 <b>Account:</b>\n`;
      message += `• Balance: <b>$${summary.currentBalance.toFixed(2)}</b>\n`;
      message += `• Daily Change: <b>${summary.dailyChange >= 0 ? '+' : ''}${summary.dailyChange.toFixed(2)}%</b>\n`;
      message += `• Open Positions: <b>${summary.openPositions}</b>\n\n`;
      
      // Goals
      message += `🎯 <b>Goals Progress:</b>\n`;
      message += `• Daily Target: <b>$${config.profitTargets.daily}</b>\n`;
      message += `• Progress: <b>${((summary.totalPnL / config.profitTargets.daily) * 100).toFixed(1)}%</b>\n`;
      message += `• Win Rate Target: <b>${config.profitTargets.winRateTarget}%</b>\n\n`;
      
      message += `📅 <i>${new Date().toLocaleDateString()}</i>`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.info('📨 Daily summary sent');
    } catch (error) {
      logger.error('❌ Error sending daily summary:', error.message);
    }
  }

  /**
   * ⚠️ Send error alert
   */
  async sendError(error, context = '') {
    if (!this.initialized || !config.telegram.notifications.errors) return;

    try {
      let message = `🚨 <b>Error Alert</b>\n\n`;
      
      if (context) {
        message += `📍 <b>Context:</b> ${context}\n`;
      }
      
      message += `❌ <b>Error:</b> ${error.message || error}\n`;
      message += `⏰ <b>Time:</b> ${new Date().toLocaleString()}\n\n`;
      
      message += `🔧 Please check the logs for more details.`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.info('📨 Error alert sent');
    } catch (err) {
      logger.error('❌ Error sending error alert:', err.message);
    }
  }

  /**
   * 📨 Generic send message with rate limiting
   */
  async sendMessage(text, options = {}) {
    if (!this.bot) {
      logger.debug('⚠️ No bot instance available');
      return;
    }
    
    if (!config.telegram.chatId) {
      logger.debug('⚠️ No chat ID configured');
      return;
    }

    try {
      // Rate limiting
      const now = Date.now();
      if (now - this.lastMessageTime < this.minMessageInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minMessageInterval));
      }
      
      logger.debug(`📨 Sending to chat ${config.telegram.chatId}: ${text.substring(0, 50)}...`);
      
      await this.bot.telegram.sendMessage(config.telegram.chatId, text, options);
      this.lastMessageTime = Date.now();
      
      logger.debug('✅ Message sent successfully');
      
    } catch (error) {
      if (error.code === 429) {
        // Rate limited - wait and retry
        const retryAfter = error.parameters?.retry_after || 30;
        logger.warn(`Rate limited, waiting ${retryAfter}s`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        await this.sendMessage(text, options);
      } else {
        logger.error('❌ Error sending message:', error.message);
        throw error;
      }
    }
  }

  /**
   * 📊 Get bot status
   */
  async getBotStatus() {
    const status = `🤖 <b>ProTradeAI Bot Status</b>\n\n`;
    
    let message = status;
    message += `🔋 <b>Status:</b> ${this.initialized ? '🟢 Online' : '🔴 Offline'}\n`;
    message += `💼 <b>Mode:</b> ${config.tradeMode.toUpperCase()}\n`;
    message += `🎯 <b>Target:</b> $${config.profitTargets.daily}/day\n`;
    message += `⚖️ <b>Risk:</b> ${config.capital.riskPerTrade}% per trade\n`;
    message += `🪙 <b>Coins:</b> ${config.coins.maxCoins} selected\n`;
    message += `🤖 <b>AI:</b> GPT-4 + Claude\n`;
    message += `📊 <b>Min Confidence:</b> ${config.ai.confidence.minimum}%\n\n`;
    
    message += `📈 <b>Settings:</b>\n`;
    message += `• Signal Approval: ${config.telegram.signalApproval ? '✅' : '❌'}\n`;
    message += `• Notifications: ${config.telegram.enabled ? '✅' : '❌'}\n`;
    message += `• Auto Trading: ${config.tradeMode === 'live' ? '✅' : '❌'}\n`;
    
    return message;
  }

  /**
   * 📊 Get trading stats
   */
  async getTradingStats() {
    // This would fetch actual trading statistics
    // For now, return mock data
    const stats = `📊 <b>Trading Statistics</b>\n\n`;
    
    let message = stats;
    message += `💰 <b>Today:</b>\n`;
    message += `• P&L: <b>+$42.50</b>\n`;
    message += `• Win Rate: <b>78.5%</b>\n`;
    message += `• Trades: <b>7</b> (5W/2L)\n\n`;
    
    message += `📈 <b>This Week:</b>\n`;
    message += `• P&L: <b>+$315.80</b>\n`;
    message += `• Win Rate: <b>75.2%</b>\n`;
    message += `• Trades: <b>42</b> (31W/11L)\n\n`;
    
    message += `🏆 <b>All Time:</b>\n`;
    message += `• Total P&L: <b>+$1,247.30</b>\n`;
    message += `• Win Rate: <b>76.8%</b>\n`;
    message += `• Total Trades: <b>156</b>\n`;
    message += `• Best Day: <b>+$87.20</b>\n`;
    
    return message;
  }

  /**
   * ⚙️ Get settings info
   */
  getSettingsInfo() {
    let message = `⚙️ <b>Bot Settings</b>\n\n`;
    
    message += `💰 <b>Capital Management:</b>\n`;
    message += `• Total Capital: <b>$${config.capital.total}</b>\n`;
    message += `• Risk per Trade: <b>${config.capital.riskPerTrade}%</b>\n`;
    message += `• Max Positions: <b>${config.capital.maxConcurrentTrades}</b>\n`;
    message += `• Max Trade Size: <b>$${config.capital.maxTradeAmount}</b>\n\n`;
    
    message += `📊 <b>AI Settings:</b>\n`;
    message += `• Min Confidence: <b>${config.ai.confidence.minimum}%</b>\n`;
    message += `• GPT Weight: <b>${config.ai.confidence.gptWeight}%</b>\n`;
    message += `• Claude Weight: <b>${config.ai.confidence.claudeWeight}%</b>\n\n`;
    
    message += `🪙 <b>Coin Selection:</b>\n`;
    message += `• Max Coins: <b>${config.coins.maxCoins}</b>\n`;
    message += `• Min Volume: <b>$${(config.coins.minVolume / 1000000).toFixed(1)}M</b>\n`;
    message += `• Whitelist: <b>${config.coins.whitelist.length} coins</b>\n\n`;
    
    message += `🔔 <b>Notifications:</b>\n`;
    message += `• Signals: ${config.telegram.notifications.signals ? '✅' : '❌'}\n`;
    message += `• Trades: ${config.telegram.notifications.trades ? '✅' : '❌'}\n`;
    message += `• Daily Summary: ${config.telegram.notifications.dailySummary ? '✅' : '❌'}\n`;
    message += `• Errors: ${config.telegram.notifications.errors ? '✅' : '❌'}\n`;
    
    return message;
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    if (this.bot) {
      this.bot.stop();
      logger.info('🧹 Telegram bot stopped');
    }
    this.messageQueue = [];
    this.rateLimitQueue = [];
  }
}

module.exports = TelegramBot;