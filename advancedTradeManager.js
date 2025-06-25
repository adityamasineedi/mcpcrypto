/**
 * 🎯 Advanced Trade Manager - Multiple Take Profit & Trailing Stop
 * 
 * Features:
 * - TP1: 40% at 2.5% profit
 * - TP2: 35% at 4.5% profit  
 * - TP3: 25% at 7.0% profit
 * - Trailing stop loss
 * - Risk management
 * - Position scaling
 */

const config = require('./config');
const logger = require('./utils/logger');
const MarketFetcher = require('./marketFetcher');
const DynamicTPCalculator = require('./dynamicTPCalculator');

class AdvancedTradeManager {  constructor() {
    this.marketFetcher = new MarketFetcher();
    this.dynamicTPCalculator = new DynamicTPCalculator();
    this.activeTrades = new Map();
    this.initialized = false;
  }

  /**
   * 🚀 Initialize Trade Manager
   */  async init() {
    try {
      await Promise.all([
        this.marketFetcher.init(),
        this.dynamicTPCalculator.init()
      ]);
      this.initialized = true;
      logger.info('✅ Advanced Trade Manager initialized');
    } catch (error) {
      logger.error('❌ Trade Manager initialization failed:', error.message);
      throw error;
    }
  }  /**
   * 📈 Create new trade with multiple TP levels
   */
  createTrade(signal) {
    const baseQuantity = this.calculateQuantity(signal);
    const entryPrice = signal.entryPrice || signal.currentPrice || signal.price;
    
    // 🚀 Use dynamic TPs if available, otherwise fallback to static
    let tp1Price, tp2Price, tp3Price;
    let tpMethod = 'static';
    
    if (signal.dynamicTPs) {
      // Use dynamic TP calculation
      tp1Price = signal.dynamicTPs.tp1.price;
      tp2Price = signal.dynamicTPs.tp2.price;
      tp3Price = signal.dynamicTPs.tp3.price;
      tpMethod = signal.dynamicTPs.method || 'dynamic';
      
      logger.info(`🎯 Using dynamic TPs for ${signal.symbol}: ${tpMethod} method`);
    } else {
      // Fallback to static percentage-based TPs
      tp1Price = this.calculateTPPrice(entryPrice, signal.type, config.trading.takeProfit1Percent);
      tp2Price = this.calculateTPPrice(entryPrice, signal.type, config.trading.takeProfit2Percent);
      tp3Price = this.calculateTPPrice(entryPrice, signal.type, config.trading.takeProfit3Percent);
      
      logger.info(`⚠️ Using static TPs for ${signal.symbol}: Dynamic TPs not available`);
    }
    
    const trade = {
      id: this.generateTradeId(),
      symbol: signal.symbol,
      type: signal.type,
      entryPrice: entryPrice,
      quantity: baseQuantity,
      confidence: signal.finalConfidence,
      timestamp: Date.now(),
      
      // Multiple Take Profit Levels (Dynamic or Static)
      takeProfits: {
        tp1: {
          price: tp1Price,
          quantity: Math.floor(baseQuantity * (config.trading.tp1PositionPercent / 100)),
          executed: false
        },
        tp2: {
          price: tp2Price,
          quantity: Math.floor(baseQuantity * (config.trading.tp2PositionPercent / 100)),
          executed: false
        },
        tp3: {
          price: tp3Price,
          quantity: Math.floor(baseQuantity * (config.trading.tp3PositionPercent / 100)),
          executed: false
        }
      },
      
      // TP Calculation Metadata
      tpCalculation: {
        method: tpMethod,
        dynamicData: signal.dynamicTPs ? {
          confidence: signal.dynamicTPs.confidence,
          calculations: signal.dynamicTPs.calculations,
          primaryMethod: signal.dynamicTPs.method
        } : null
      },
        // Stop Loss & Trailing
      stopLoss: {
        price: this.calculateSLPrice(entryPrice, signal.type, config.capital.stopLossPercent),
        trailing: config.trading.enableTrailingStop,
        trailingPercent: config.trading.trailingStopPercent,
        highestPrice: signal.type === 'LONG' ? entryPrice : entryPrice,
        lowestPrice: signal.type === 'SHORT' ? entryPrice : entryPrice
      },
        // Position Status
      status: 'ACTIVE',
      remainingQuantity: baseQuantity,
      realizedPnL: 0,
      unrealizedPnL: 0,
      
      // Risk Management
      riskAmount: this.calculateRiskAmount(signal),
      maxRisk: config.capital.maxDailyLoss
    };

    this.activeTrades.set(trade.id, trade);
    logger.info(`🎯 Created trade ${trade.id}: ${trade.symbol} ${trade.type} with 3 TP levels`);
    
    return trade;
  }

  /**
   * 🔄 Monitor and update all active trades
   */
  async monitorTrades() {
    if (!this.initialized || this.activeTrades.size === 0) {
      return;
    }

    logger.debug(`🔍 Monitoring ${this.activeTrades.size} active trades`);

    for (const [tradeId, trade] of this.activeTrades) {
      try {
        await this.updateTrade(trade);
      } catch (error) {
        logger.error(`❌ Error monitoring trade ${tradeId}:`, error.message);
      }
    }
  }

  /**
   * 📊 Update individual trade
   */
  async updateTrade(trade) {
    // Get current market price
    const ticker = await this.marketFetcher.get24hTicker(trade.symbol);
    const currentPrice = parseFloat(ticker.price);
    
    // Update unrealized PnL
    trade.unrealizedPnL = this.calculateUnrealizedPnL(trade, currentPrice);
    
    // Update trailing stop if enabled
    if (trade.stopLoss.trailing) {
      this.updateTrailingStop(trade, currentPrice);
    }
    
    // Check take profit levels
    await this.checkTakeProfitLevels(trade, currentPrice);
    
    // Check stop loss
    await this.checkStopLoss(trade, currentPrice);
    
    // Update trade status
    this.updateTradeStatus(trade);
  }

  /**
   * 🎯 Check and execute take profit levels
   */
  async checkTakeProfitLevels(trade, currentPrice) {
    const { tp1, tp2, tp3 } = trade.takeProfits;
    
    // Check TP1
    if (!tp1.executed && this.shouldExecuteTP(trade, currentPrice, tp1.price)) {
      await this.executeTakeProfit(trade, 'TP1', tp1);
    }
    
    // Check TP2
    if (!tp2.executed && this.shouldExecuteTP(trade, currentPrice, tp2.price)) {
      await this.executeTakeProfit(trade, 'TP2', tp2);
    }
    
    // Check TP3
    if (!tp3.executed && this.shouldExecuteTP(trade, currentPrice, tp3.price)) {
      await this.executeTakeProfit(trade, 'TP3', tp3);
    }
  }

  /**
   * ✅ Execute take profit
   */
  async executeTakeProfit(trade, level, tpData) {
    try {
      logger.info(`🎯 Executing ${level} for ${trade.symbol}: ${tpData.quantity} at ${tpData.price}`);
      
      // Mark as executed
      tpData.executed = true;
      
      // Update remaining quantity
      trade.remainingQuantity -= tpData.quantity;
      
      // Calculate profit
      const profit = this.calculateProfit(trade, tpData.price, tpData.quantity);
      trade.realizedPnL += profit;
      
      // Log execution
      logger.info(`✅ ${level} executed: ${trade.symbol} +$${profit.toFixed(2)} (Remaining: ${trade.remainingQuantity})`);
      
      // Send notification
      await this.sendTPNotification(trade, level, profit);
      
    } catch (error) {
      logger.error(`❌ Failed to execute ${level} for ${trade.symbol}:`, error.message);
    }
  }

  /**
   * 🛡️ Update trailing stop loss
   */
  updateTrailingStop(trade, currentPrice) {
    const { stopLoss } = trade;
    
    if (trade.type === 'LONG') {
      // Update highest price
      if (currentPrice > stopLoss.highestPrice) {
        stopLoss.highestPrice = currentPrice;
        
        // Calculate new trailing stop
        const newStopPrice = currentPrice * (1 - stopLoss.trailingPercent / 100);
        
        // Only move stop loss up
        if (newStopPrice > stopLoss.price) {
          const oldStop = stopLoss.price;
          stopLoss.price = newStopPrice;
          logger.debug(`📈 Trailing stop updated for ${trade.symbol}: ${oldStop.toFixed(4)} → ${newStopPrice.toFixed(4)}`);
        }
      }
    } else { // SHORT
      // Update lowest price
      if (currentPrice < stopLoss.lowestPrice) {
        stopLoss.lowestPrice = currentPrice;
        
        // Calculate new trailing stop
        const newStopPrice = currentPrice * (1 + stopLoss.trailingPercent / 100);
        
        // Only move stop loss down
        if (newStopPrice < stopLoss.price) {
          const oldStop = stopLoss.price;
          stopLoss.price = newStopPrice;
          logger.debug(`📉 Trailing stop updated for ${trade.symbol}: ${oldStop.toFixed(4)} → ${newStopPrice.toFixed(4)}`);
        }
      }
    }
  }

  /**
   * 🛑 Check stop loss
   */
  async checkStopLoss(trade, currentPrice) {
    const shouldStop = (trade.type === 'LONG' && currentPrice <= trade.stopLoss.price) ||
                      (trade.type === 'SHORT' && currentPrice >= trade.stopLoss.price);
    
    if (shouldStop && trade.remainingQuantity > 0) {
      await this.executeStopLoss(trade, currentPrice);
    }
  }

  /**
   * 🛑 Execute stop loss
   */
  async executeStopLoss(trade, currentPrice) {
    try {
      logger.warn(`🛑 Stop loss triggered for ${trade.symbol} at ${currentPrice}`);
      
      // Calculate loss
      const loss = this.calculateProfit(trade, currentPrice, trade.remainingQuantity);
      trade.realizedPnL += loss;
      
      // Close remaining position
      trade.remainingQuantity = 0;
      trade.status = 'STOPPED';
      
      logger.warn(`❌ Stop loss executed: ${trade.symbol} ${loss.toFixed(2)} (Total PnL: $${trade.realizedPnL.toFixed(2)})`);
      
      // Send notification
      await this.sendStopLossNotification(trade, loss);
      
    } catch (error) {
      logger.error(`❌ Failed to execute stop loss for ${trade.symbol}:`, error.message);
    }
  }

  /**
   * 💰 Calculate profit for partial close
   */
  calculateProfit(trade, exitPrice, quantity) {
    const priceDiff = trade.type === 'LONG' ? 
      (exitPrice - trade.entryPrice) : 
      (trade.entryPrice - exitPrice);
    
    return priceDiff * quantity * (1 - config.exchange.takerFee);
  }

  /**
   * 📊 Calculate unrealized PnL
   */
  calculateUnrealizedPnL(trade, currentPrice) {
    return this.calculateProfit(trade, currentPrice, trade.remainingQuantity);
  }

  /**
   * 🎯 Check if TP should be executed
   */
  shouldExecuteTP(trade, currentPrice, tpPrice) {
    return (trade.type === 'LONG' && currentPrice >= tpPrice) ||
           (trade.type === 'SHORT' && currentPrice <= tpPrice);
  }

  /**
   * 🧮 Calculate take profit price
   */
  calculateTPPrice(entryPrice, type, percent) {
    const multiplier = type === 'LONG' ? (1 + percent / 100) : (1 - percent / 100);
    return entryPrice * multiplier;
  }

  /**
   * 🛡️ Calculate stop loss price
   */
  calculateSLPrice(entryPrice, type, percent) {
    const multiplier = type === 'LONG' ? (1 - percent / 100) : (1 + percent / 100);
    return entryPrice * multiplier;
  }
  /**
   * 📏 Calculate position quantity
   */
  calculateQuantity(signal) {
    const entryPrice = signal.entryPrice || signal.currentPrice || signal.price;
    const riskAmount = config.capital.total * (config.capital.riskPerTrade / 100);
    const stopDistance = Math.abs(entryPrice - this.calculateSLPrice(entryPrice, signal.type, config.capital.stopLossPercent));
    
    const quantity = Math.floor(riskAmount / stopDistance);
    
    // Ensure minimum quantity
    return Math.max(quantity, 1);
  }

  /**
   * 💸 Calculate risk amount
   */
  calculateRiskAmount(signal) {
    return config.capital.total * (config.capital.riskPerTrade / 100);
  }

  /**
   * 🔢 Generate unique trade ID
   */
  generateTradeId() {
    return `TRADE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  /**
   * 📱 Send take profit notification
   */
  async sendTPNotification(trade, level, profit) {
    // Get telegram bot from main bot instance if available
    if (global.proTradeAI && global.proTradeAI.modules && global.proTradeAI.modules.telegramBot) {
      await global.proTradeAI.modules.telegramBot.sendTPNotification(trade, level, profit);
    } else {
      logger.info(`📲 TP notification: ${trade.symbol} ${level} +$${profit.toFixed(2)}`);
    }
  }

  /**
   * 📱 Send stop loss notification
   */
  async sendStopLossNotification(trade, loss) {
    // Get telegram bot from main bot instance if available
    if (global.proTradeAI && global.proTradeAI.modules && global.proTradeAI.modules.telegramBot) {
      await global.proTradeAI.modules.telegramBot.sendStopLossNotification(trade, loss);
    } else {
      logger.warn(`📲 SL notification: ${trade.symbol} ${loss.toFixed(2)}`);
    }
  }

  /**
   * 🔄 Update trade status
   */
  updateTradeStatus(trade) {
    const { tp1, tp2, tp3 } = trade.takeProfits;
    
    if (trade.remainingQuantity === 0) {
      trade.status = tp1.executed && tp2.executed && tp3.executed ? 'COMPLETED' : 'STOPPED';
    } else if (tp1.executed || tp2.executed || tp3.executed) {
      trade.status = 'PARTIAL';
    }
  }

  /**
   * 📊 Get trade statistics
   */
  getTradeStats() {
    const trades = Array.from(this.activeTrades.values());
    const completedTrades = trades.filter(t => t.status === 'COMPLETED' || t.status === 'STOPPED');
    
    return {
      activeTrades: trades.filter(t => t.status === 'ACTIVE' || t.status === 'PARTIAL').length,
      completedTrades: completedTrades.length,
      totalPnL: completedTrades.reduce((sum, t) => sum + t.realizedPnL, 0),
      winRate: completedTrades.length > 0 ? 
        (completedTrades.filter(t => t.realizedPnL > 0).length / completedTrades.length * 100) : 0
    };
  }
  /**
   * 🚀 Execute Signal (Paper Trading)
   */
  async executeSignal(signal) {
    try {
      logger.info(`🎯 Executing signal: ${signal.symbol} ${signal.type} at ${signal.entryPrice || signal.currentPrice}`);
      
      // Create the trade
      const trade = this.createTrade(signal);
      
      // Log trade creation
      this.logTradeResult(trade, 'CREATED');
      
      return trade;
    } catch (error) {
      logger.error(`❌ Failed to execute signal for ${signal.symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * 🎯 Check TP Levels (alias for checkTakeProfitLevels)
   */
  async checkTPLevels(trade, currentPrice) {
    return await this.checkTakeProfitLevels(trade, currentPrice);
  }

  /**
   * ⏰ Check Hold Duration
   */
  checkHoldDuration(trade) {
    const holdTime = Date.now() - trade.timestamp;
    const maxHoldTime = config.trading.maxHoldTime || (24 * 60 * 60 * 1000); // 24 hours default
    
    if (holdTime > maxHoldTime) {
      logger.warn(`⏰ Trade ${trade.id} exceeded max hold time: ${(holdTime / (60 * 60 * 1000)).toFixed(1)} hours`);
      return { exceeded: true, holdTime };
    }
    
    return { exceeded: false, holdTime };
  }
  /**
   * 📝 Log Trade Result
   */
  logTradeResult(trade, event = 'RESULT', details = {}) {
    const duration = trade.endTime && trade.startTime ? 
      `${Math.round((trade.endTime - trade.startTime) / (60 * 1000))}m` :
      trade.timestamp ? `${Math.round((Date.now() - trade.timestamp) / (60 * 1000))}m` : 'Unknown';
    
    const logData = {
      timestamp: new Date().toISOString(),
      tradeId: trade.id,
      TradeID: trade.id, // For test compatibility
      symbol: trade.symbol,
      type: trade.type,
      event,
      Result: event, // For test compatibility
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice || details.exitPrice,
      ExitPrice: trade.exitPrice || details.exitPrice, // For test compatibility
      currentPnL: trade.realizedPnL || 0,
      'P&L': trade.realizedPnL || 0, // For test compatibility
      status: trade.status,
      exitReason: trade.exitReason || details.exitReason,
      ExitReason: trade.exitReason || details.exitReason, // For test compatibility
      Duration: duration, // For test compatibility
      ...details
    };
    
    logger.info(`📝 Trade ${event}: ${JSON.stringify(logData)}`);
    
    // Save to trades data file
    try {
      const fs = require('fs');
      const path = require('path');
      const tradesFile = path.join(__dirname, 'data', 'trades.json');
      
      let trades = [];
      if (fs.existsSync(tradesFile)) {
        trades = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
      }
      
      trades.push(logData);
      fs.writeFileSync(tradesFile, JSON.stringify(trades, null, 2));
    } catch (error) {
      logger.error('❌ Failed to save trade log:', error.message);
    }
    
    // Return log data for testing
    return logData;
  }
}

module.exports = AdvancedTradeManager;
