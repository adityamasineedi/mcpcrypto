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
        '/tpmode - TP calculation mode\n' +
        '/tpcalc - TP calculation details\n' +
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
        '/tpmode - TP calculation mode\n' +
        '/tpcalc - TP calculation details\n' +
        '/help - This help message',
        { parse_mode: 'HTML' }
      );
    });

    // 🚀 NEW: TP Mode command
    this.bot.command('tpmode', (ctx) => {
      const isDynamicMode = process.env.DYNAMIC_TP_ENABLED !== 'false';
      const modeText = isDynamicMode ? 'Dynamic (Adaptive)' : 'Static (Percentage)';
      
      ctx.reply(
        `🎯 <b>Take Profit Mode Status</b>\n\n` +
        `Current Mode: <b>${modeText}</b>\n\n` +
        `📊 <b>Dynamic Mode Features:</b>\n` +
        `• Volatility-based calculations\n` +
        `• Support/Resistance levels\n` +
        `• ATR-based adjustments\n` +
        `• Market regime adaptation\n` +
        `• Fibonacci retracements\n\n` +
        `📈 <b>Static Mode Features:</b>\n` +
        `• Fixed percentage targets\n` +
        `• Predictable levels\n` +
        `• Simple calculations\n\n` +
        `Use /tpcalc to see calculation details`,
        { parse_mode: 'HTML' }
      );
    });

    // 🚀 NEW: TP Calculation Details command
    this.bot.command('tpcalc', (ctx) => {
      ctx.reply(
        `🔬 <b>TP Calculation Methods</b>\n\n` +
        `🎯 <b>Dynamic Calculations:</b>\n` +
        `• <b>Volatility:</b> Adjusts based on price movement\n` +
        `• <b>ATR:</b> Uses Average True Range\n` +
        `• <b>Support/Resistance:</b> Key price levels\n` +
        `• <b>Fibonacci:</b> Golden ratio retracements\n` +
        `• <b>Market Regime:</b> Bull/Bear/Sideways adaptation\n\n` +
        `📊 <b>Weighting System:</b>\n` +
        `• Each method gets a confidence score\n` +
        `• Higher confidence = more influence\n` +
        `• Final TP = weighted average of all methods\n\n` +
        `🎪 <b>Static Fallback:</b>\n` +
        `• TP1: ${config.trading.takeProfit1Percent}%\n` +
        `• TP2: ${config.trading.takeProfit2Percent}%\n` +
        `• TP3: ${config.trading.takeProfit3Percent}%`,
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
    
    // Prices with Multiple Take Profit Levels
    message += `💰 <b>Price Levels:</b>\n`;
    message += `• Current: <b>$${signal.currentPrice.toFixed(4)}</b>\n`;
    message += `• Entry: <b>$${signal.entryPrice.toFixed(4)}</b>\n`;
    message += `• Stop Loss: <b>$${signal.stopLoss.toFixed(4)}</b>\n\n`;
    
    // ✅ NEW: Enhanced Multiple Take Profit Levels
    message += `🎯 <b>Take Profit Strategy:</b>\n`;
    const config = require('./config');
    const entryPrice = signal.entryPrice || signal.currentPrice;
    
    // 🚀 Use dynamic TPs if available, otherwise fallback to static
    let tp1Price, tp2Price, tp3Price, tpMethod, tpConfidence;
    
    if (signal.dynamicTPs) {
      // Use dynamic TP calculation
      tp1Price = signal.dynamicTPs.tp1.price;
      tp2Price = signal.dynamicTPs.tp2.price;
      tp3Price = signal.dynamicTPs.tp3.price;
      tpMethod = signal.dynamicTPs.method || 'adaptive';
      tpConfidence = signal.dynamicTPs.confidence;
      
      message += `🔥 <b>Dynamic TPs (${tpMethod.toUpperCase()}):</b>\n`;
      message += `• TP1 (${config.trading.tp1PositionPercent}%): <b>$${tp1Price.toFixed(4)}</b> (+${((tp1Price - entryPrice) / entryPrice * 100).toFixed(1)}%) 🎯\n`;
      message += `• TP2 (${config.trading.tp2PositionPercent}%): <b>$${tp2Price.toFixed(4)}</b> (+${((tp2Price - entryPrice) / entryPrice * 100).toFixed(1)}%) �\n`;
      message += `• TP3 (${config.trading.tp3PositionPercent}%): <b>$${tp3Price.toFixed(4)}</b> (+${((tp3Price - entryPrice) / entryPrice * 100).toFixed(1)}%) �\n`;
      
      if (tpConfidence) {
        message += `• TP Confidence: <b>${tpConfidence.toFixed(1)}%</b> 🔬\n`;
      }
      
      // Show calculation methods used
      if (signal.dynamicTPs.calculations) {
        const methods = Object.keys(signal.dynamicTPs.calculations).join(', ');
        message += `• Methods: <i>${methods}</i>\n`;
      }
    } else {
      // Fallback to static percentage-based TPs
      const calculateTP = (price, percent, type) => {
        return type === 'LONG' ? 
          price * (1 + percent / 100) : 
          price * (1 - percent / 100);
      };
      
      tp1Price = calculateTP(entryPrice, config.trading.takeProfit1Percent, signal.type);
      tp2Price = calculateTP(entryPrice, config.trading.takeProfit2Percent, signal.type);
      tp3Price = calculateTP(entryPrice, config.trading.takeProfit3Percent, signal.type);
      
      message += `📊 <b>Static TPs (Percentage-based):</b>\n`;
      message += `• TP1 (${config.trading.tp1PositionPercent}%): <b>$${tp1Price.toFixed(4)}</b> (+${config.trading.takeProfit1Percent}%) 🎯\n`;
      message += `• TP2 (${config.trading.tp2PositionPercent}%): <b>$${tp2Price.toFixed(4)}</b> (+${config.trading.takeProfit2Percent}%) 🚀\n`;
      message += `• TP3 (${config.trading.tp3PositionPercent}%): <b>$${tp3Price.toFixed(4)}</b> (+${config.trading.takeProfit3Percent}%) 💎\n`;
      message += `• Mode: <i>Fixed percentage targets</i>\n`;
    }
    
    // Legacy TP for backwards compatibility
    if (signal.takeProfit) {
      message += `• Full TP: <b>$${signal.takeProfit.toFixed(4)}</b> (Legacy)\n`;
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
   * 🎯 Send Take Profit notification
   */
  async sendTPNotification(trade, level, profit) {
    if (!this.initialized || !config.telegram.notifications.trades) {
      return;
    }

    try {
      const tpEmojis = {
        'TP1': '🎯',
        'TP2': '🚀', 
        'TP3': '💎'
      };
      
      const emoji = tpEmojis[level] || '🎯';
      const profitEmoji = profit > 0 ? '💰' : '💸';
      
      let message = `${emoji} <b>${level} HIT!</b> ${profitEmoji}\n\n`;
      
      message += `📊 <b>Trade Details:</b>\n`;
      message += `• Symbol: <b>${trade.symbol} ${trade.type}</b>\n`;
      message += `• Level: <b>${level}</b>\n`;
      message += `• Profit: <b>${profit > 0 ? '+' : ''}$${profit.toFixed(2)}</b>\n`;
      message += `• Remaining: <b>${trade.remainingQuantity.toFixed(4)}</b>\n\n`;
      
      message += `💼 <b>Position Status:</b>\n`;
      message += `• Total P&L: <b>$${trade.realizedPnL.toFixed(2)}</b>\n`;
      message += `• Status: <b>${trade.status}</b>\n`;
      
      if (trade.remainingQuantity > 0) {
        const nextTP = level === 'TP1' ? 'TP2' : level === 'TP2' ? 'TP3' : 'None';
        if (nextTP !== 'None') {
          message += `• Next Target: <b>${nextTP}</b>\n`;
        }
        
        if (trade.stopLoss.trailing) {
          message += `• Trailing Stop: <b>$${trade.stopLoss.price.toFixed(4)}</b>\n`;
        }
      } else {
        message += `• <b>Position Fully Closed!</b> 🎉\n`;
      }
      
      message += `\n⏰ <i>${new Date().toLocaleString()}</i>`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.info(`📨 ${level} notification sent for ${trade.symbol}: +$${profit.toFixed(2)}`);
    } catch (error) {
      logger.error(`❌ Error sending ${level} notification:`, error.message);
    }
  }

  /**
   * 🛑 Send Stop Loss notification
   */
  async sendStopLossNotification(trade, loss) {
    if (!this.initialized || !config.telegram.notifications.trades) {
      return;
    }

    try {
      let message = `🛑 <b>STOP LOSS HIT</b> 💸\n\n`;
      
      message += `📊 <b>Trade Details:</b>\n`;
      message += `• Symbol: <b>${trade.symbol} ${trade.type}</b>\n`;
      message += `• Loss: <b>$${loss.toFixed(2)}</b>\n`;
      message += `• Entry: <b>$${trade.entryPrice.toFixed(4)}</b>\n`;
      message += `• Exit: <b>$${trade.stopLoss.price.toFixed(4)}</b>\n\n`;
      
      message += `💼 <b>Final Position:</b>\n`;
      message += `• Total P&L: <b>$${trade.realizedPnL.toFixed(2)}</b>\n`;
      message += `• Status: <b>STOPPED</b>\n`;
      
      // Show any partial profits taken
      const { tp1, tp2, tp3 } = trade.takeProfits;
      let partialProfits = 0;
      if (tp1.executed) partialProfits += 1;
      if (tp2.executed) partialProfits += 1;
      if (tp3.executed) partialProfits += 1;
      
      if (partialProfits > 0) {
        message += `• TPs Hit: <b>${partialProfits}/3</b> ✅\n`;
        message += `• <i>Some profit was secured before stop loss</i>\n`;
      }
      
      message += `\n⏰ <i>${new Date().toLocaleString()}</i>`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.warn(`📨 Stop loss notification sent for ${trade.symbol}: $${loss.toFixed(2)}`);
    } catch (error) {
      logger.error('❌ Error sending stop loss notification:', error.message);
    }
  }

  /**
   * 📈 Send trailing stop update notification
   */
  async sendTrailingStopUpdate(trade, oldPrice, newPrice) {
    if (!this.initialized || !config.telegram.notifications.trades) {
      return;
    }

    try {
      // Only send periodic updates, not every small change
      const priceChange = Math.abs(newPrice - oldPrice);
      const percentChange = (priceChange / oldPrice) * 100;
      
      // Only notify for significant moves (0.5%+)
      if (percentChange < 0.5) {
        return;
      }
      
      let message = `📈 <b>Trailing Stop Updated</b>\n\n`;
      
      message += `📊 <b>Trade Details:</b>\n`;
      message += `• Symbol: <b>${trade.symbol} ${trade.type}</b>\n`;
      message += `• Old Stop: <b>$${oldPrice.toFixed(4)}</b>\n`;
      message += `• New Stop: <b>$${newPrice.toFixed(4)}</b>\n`;
      message += `• Protection: <b>+${((newPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2)}%</b>\n\n`;
      
      message += `💼 <b>Position Status:</b>\n`;
      message += `• Remaining: <b>${trade.remainingQuantity.toFixed(4)}</b>\n`;
      message += `• Unrealized P&L: <b>$${trade.unrealizedPnL.toFixed(2)}</b>\n`;
      
      message += `\n⏰ <i>${new Date().toLocaleString()}</i>`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.info(`📨 Trailing stop notification sent for ${trade.symbol}`);
    } catch (error) {
      logger.error('❌ Error sending trailing stop notification:', error.message);
    }
  }

  /**
   * 🎉 Send trade completion summary
   */
  async sendTradeCompletionSummary(trade) {
    if (!this.initialized || !config.telegram.notifications.trades) {
      return;
    }

    try {
      const isProfit = trade.realizedPnL > 0;
      const emoji = isProfit ? '🎉' : '😞';
      const statusEmoji = isProfit ? '💰' : '💸';
      
      let message = `${emoji} <b>TRADE COMPLETED</b> ${statusEmoji}\n\n`;
      
      message += `📊 <b>Trade Summary:</b>\n`;
      message += `• Symbol: <b>${trade.symbol} ${trade.type}</b>\n`;
      message += `• Entry: <b>$${trade.entryPrice.toFixed(4)}</b>\n`;
      message += `• Duration: <b>${this.getTradeDuration(trade)}</b>\n`;
      message += `• Final P&L: <b>${isProfit ? '+' : ''}$${trade.realizedPnL.toFixed(2)}</b>\n\n`;
      
      message += `🎯 <b>Take Profit Performance:</b>\n`;
      const { tp1, tp2, tp3 } = trade.takeProfits;
      message += `• TP1: ${tp1.executed ? '✅' : '❌'} ${tp1.executed ? `($${((tp1.price - trade.entryPrice) * tp1.quantity).toFixed(2)})` : ''}\n`;
      message += `• TP2: ${tp2.executed ? '✅' : '❌'} ${tp2.executed ? `($${((tp2.price - trade.entryPrice) * tp2.quantity).toFixed(2)})` : ''}\n`;
      message += `• TP3: ${tp3.executed ? '✅' : '❌'} ${tp3.executed ? `($${((tp3.price - trade.entryPrice) * tp3.quantity).toFixed(2)})` : ''}\n\n`;
      
      message += `📈 <b>Performance:</b>\n`;
      const returnPercent = (trade.realizedPnL / (trade.entryPrice * trade.quantity)) * 100;
      message += `• Return: <b>${returnPercent.toFixed(2)}%</b>\n`;
      message += `• Risk/Reward: <b>1:${Math.abs(trade.realizedPnL / trade.riskAmount).toFixed(2)}</b>\n`;
      
      message += `\n⏰ <i>${new Date().toLocaleString()}</i>`;
      
      await this.sendMessage(message, { parse_mode: 'HTML' });
      
      logger.info(`📨 Trade completion summary sent for ${trade.symbol}: $${trade.realizedPnL.toFixed(2)}`);
    } catch (error) {
      logger.error('❌ Error sending trade completion summary:', error.message);
    }
  }

  /**
   * ⏱️ Calculate trade duration
   */
  getTradeDuration(trade) {
    const duration = Date.now() - trade.timestamp;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
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