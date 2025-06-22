const axios = require('axios');
const crypto = require('crypto');
const EventEmitter = require('events');
const config = require('./config');
const logger = require('./utils/logger');

class TradeExecutor extends EventEmitter {
  constructor() {
    super();
    this.positions = new Map();
    this.orders = new Map();
    this.balance = {
      total: config.capital.total,
      available: config.capital.total,
      inTrades: 0
    };
    this.dailyStats = {
      trades: 0,
      profit: 0,
      fees: 0,
      lastReset: new Date().toDateString()
    };
    this.initialized = false;
    this.paperMode = config.tradeMode === 'paper';
  }

  /**
   * 🚀 Initialize Trade Executor
   */
  async init() {
    try {
      // Reset daily stats if new day
      this.checkDailyReset();

      if (this.paperMode) {
        logger.info('📄 Trade Executor initialized in PAPER MODE');
      } else {
        // Test exchange connection
        await this.testConnection();
        logger.info('✅ Trade Executor initialized for LIVE TRADING');
      }

      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      logger.error('❌ Trade Executor initialization failed:', error.message);
      // Fall back to paper mode
      this.paperMode = true;
      this.initialized = true;
      logger.warn('🔄 Falling back to paper trading mode');
    }
  }

  /**
   * 🔌 Test exchange connection
   */
  async testConnection() {
    if (this.paperMode) return true;

    try {
      const response = await this.makeRequest('GET', '/openApi/user/balance');
      logger.info('✅ Exchange connection successful');
      
      // Update actual balance
      if (response.data && response.data.balance) {
        const usdtBalance = response.data.balance.find(b => b.asset === 'USDT');
        if (usdtBalance) {
          this.balance.total = parseFloat(usdtBalance.balance);
          this.balance.available = parseFloat(usdtBalance.balance);
        }
      }

      return true;
    } catch (error) {
      logger.error('❌ Exchange connection failed:', error.message);
      throw error;
    }
  }

  /**
   * 💼 Execute trade signal
   */
  async executeTrade(signal, approval) {
    try {
      logger.info(`🎯 Executing trade: ${signal.symbol} ${signal.type}`);

      // Pre-trade validation
      const validation = this.validateTrade(signal);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // Create trade object
      const trade = this.createTradeFromSignal(signal, approval);

      // Execute the trade
      const result = this.paperMode ? 
        await this.executePaperTrade(trade) : 
        await this.executeLiveTrade(trade);

      // Update balances and positions
      this.updateBalances(result);
      this.updatePositions(result);

      // Update daily stats
      this.updateDailyStats(result);

      // Emit trade event
      this.emit('tradeExecuted', result);

      logger.info(`✅ Trade executed: ${result.symbol} ${result.side} - ${result.status}`);
      return result;

    } catch (error) {
      logger.error(`❌ Trade execution failed: ${error.message}`);
      
      const failedTrade = {
        ...signal,
        status: 'FAILED',
        error: error.message,
        timestamp: Date.now()
      };

      this.emit('tradeError', failedTrade, error);
      return failedTrade;
    }
  }

  /**
   * ✅ Validate trade before execution
   */
  validateTrade(signal) {
    // Check if trading is enabled
    if (!this.initialized) {
      return { valid: false, reason: 'Trade executor not initialized' };
    }

    // Check available balance
    if (signal.positionSize > this.balance.available) {
      return { valid: false, reason: 'Insufficient balance' };
    }

    // Check concurrent trades limit
    if (this.positions.size >= config.capital.maxConcurrentTrades) {
      return { valid: false, reason: 'Maximum concurrent trades reached' };
    }

    // Check daily loss limits
    if (this.dailyStats.profit < -config.profitTargets.maxDailyLoss) {
      return { valid: false, reason: 'Daily loss limit reached' };
    }

    // Check position size limits
    if (signal.positionSize < config.capital.minTradeAmount || 
        signal.positionSize > config.capital.maxTradeAmount) {
      return { valid: false, reason: 'Position size outside limits' };
    }

    // Check for existing position in same symbol
    if (this.positions.has(signal.symbol)) {
      return { valid: false, reason: 'Position already exists for this symbol' };
    }

    return { valid: true };
  }

  /**
   * 📝 Create trade object from signal
   */
  createTradeFromSignal(signal, approval) {
    return {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      signalId: signal.id,
      symbol: signal.symbol,
      side: signal.type, // LONG or SHORT
      amount: signal.positionSize,
      price: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      leverage: config.capital.leverageMultiplier,
      type: 'MARKET', // MARKET or LIMIT
      status: 'PENDING',
      timestamp: Date.now(),
      approval: {
        approved: approval.approved,
        method: approval.method,
        userId: approval.userId,
        timestamp: approval.timestamp
      },
      fees: {
        estimated: signal.positionSize * config.exchange.fees.taker,
        actual: 0
      }
    };
  }

  /**
   * 📄 Execute paper trade
   */
  async executePaperTrade(trade) {
    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    // Simulate small slippage
    const slippagePercent = (Math.random() - 0.5) * 0.002; // ±0.1%
    const executionPrice = trade.price * (1 + slippagePercent);

    // Calculate fees
    const fee = trade.amount * config.exchange.fees.taker;

    const result = {
      ...trade,
      status: 'FILLED',
      executionPrice,
      actualAmount: trade.amount,
      fee,
      orderId: `paper_${Date.now()}`,
      fillTime: Date.now(),
      slippage: slippagePercent * 100
    };

    logger.info(`📄 Paper trade filled: ${result.symbol} ${result.side} @ $${executionPrice.toFixed(4)}`);
    return result;
  }

  /**
   * 🔴 Execute live trade
   */
  async executeLiveTrade(trade) {
    try {
      // Place order on exchange
      const orderParams = {
        symbol: `${trade.symbol}-USDT`,
        side: trade.side === 'LONG' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: this.calculateQuantity(trade.amount, trade.price),
        leverage: trade.leverage
      };

      const response = await this.makeRequest('POST', '/openApi/swap/v2/trade/order', orderParams);

      if (response.data && response.data.orderId) {
        // Order placed successfully
        const orderId = response.data.orderId;
        
        // Wait for fill confirmation
        const fillResult = await this.waitForOrderFill(orderId, trade.symbol);
        
        return {
          ...trade,
          status: fillResult.status,
          orderId,
          executionPrice: fillResult.price,
          actualAmount: fillResult.amount,
          fee: fillResult.fee,
          fillTime: fillResult.timestamp,
          slippage: ((fillResult.price - trade.price) / trade.price) * 100
        };
      } else {
        throw new Error('Order placement failed - no order ID returned');
      }

    } catch (error) {
      logger.error(`❌ Live trade execution error: ${error.message}`);
      throw error;
    }
  }

  /**
   * ⏳ Wait for order fill confirmation
   */
  async waitForOrderFill(orderId, symbol, maxWaitTime = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const orderStatus = await this.getOrderStatus(orderId, symbol);
        
        if (orderStatus.status === 'FILLED') {
          return {
            status: 'FILLED',
            price: orderStatus.price,
            amount: orderStatus.executedQty,
            fee: orderStatus.fee,
            timestamp: orderStatus.updateTime
          };
        } else if (orderStatus.status === 'CANCELED' || orderStatus.status === 'REJECTED') {
          throw new Error(`Order ${orderStatus.status.toLowerCase()}: ${orderStatus.message || 'Unknown reason'}`);
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        logger.error(`❌ Error checking order status: ${error.message}`);
        throw error;
      }
    }
    
    throw new Error('Order fill timeout');
  }

  /**
   * 📊 Get order status
   */
  async getOrderStatus(orderId, symbol) {
    const response = await this.makeRequest('GET', '/openApi/swap/v2/trade/order', {
      symbol: `${symbol}-USDT`,
      orderId
    });
    
    return response.data;
  }

  /**
   * 🔢 Calculate quantity from USDT amount
   */
  calculateQuantity(usdtAmount, price) {
    return (usdtAmount / price).toFixed(8);
  }

  /**
   * 💰 Update balances after trade
   */
  updateBalances(trade) {
    if (trade.status === 'FILLED') {
      // Deduct trade amount and fees
      const totalCost = trade.amount + trade.fee;
      this.balance.available -= totalCost;
      this.balance.inTrades += trade.amount;

      logger.debug(`💰 Balance updated: Available: $${this.balance.available.toFixed(2)}, In Trades: $${this.balance.inTrades.toFixed(2)}`);
    }
  }

  /**
   * 📈 Update positions after trade
   */
  updatePositions(trade) {
    if (trade.status === 'FILLED') {
      const position = {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        entryPrice: trade.executionPrice,
        currentPrice: trade.executionPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        pnl: 0,
        pnlPercent: 0,
        entryTime: trade.fillTime,
        status: 'OPEN'
      };

      this.positions.set(trade.symbol, position);
      this.orders.set(trade.id, trade);

      logger.info(`📈 Position opened: ${position.symbol} ${position.side} - $${position.amount.toFixed(2)}`);
    }
  }

  /**
   * 📊 Update daily stats
   */
  updateDailyStats(trade) {
    this.checkDailyReset();

    if (trade.status === 'FILLED') {
      this.dailyStats.trades++;
      this.dailyStats.fees += trade.fee;

      // Profit will be calculated when position is closed
      logger.debug(`📊 Daily stats: ${this.dailyStats.trades} trades, $${this.dailyStats.fees.toFixed(2)} fees`);
    }
  }

  /**
   * 🔄 Check and reset daily stats
   */
  checkDailyReset() {
    const today = new Date().toDateString();
    if (this.dailyStats.lastReset !== today) {
      this.dailyStats = {
        trades: 0,
        profit: 0,
        fees: 0,
        lastReset: today
      };
      logger.info('📅 Daily stats reset for new day');
    }
  }

  /**
   * 🏁 Close position
   */
  async closePosition(symbol, reason = 'manual') {
    try {
      const position = this.positions.get(symbol);
      if (!position) {
        throw new Error(`No position found for ${symbol}`);
      }

      logger.info(`🏁 Closing position: ${symbol} (${reason})`);

      // Create close trade
      const closeTrade = {
        id: `close_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        positionId: position.id,
        symbol,
        side: position.side === 'LONG' ? 'SHORT' : 'LONG', // Opposite side
        amount: position.amount,
        price: position.currentPrice,
        type: 'MARKET',
        reason,
        timestamp: Date.now()
      };

      // Execute close trade
      const result = this.paperMode ? 
        await this.executePaperTrade(closeTrade) : 
        await this.executeLiveTrade(closeTrade);

      if (result.status === 'FILLED') {
        // Calculate P&L
        const pnl = this.calculatePnL(position, result.executionPrice);
        
        // Update position
        position.status = 'CLOSED';
        position.exitPrice = result.executionPrice;
        position.exitTime = result.fillTime;
        position.pnl = pnl.profit;
        position.pnlPercent = pnl.percentage;
        position.totalFees = position.fees?.estimated + result.fee;

        // Update balances
        this.balance.inTrades -= position.amount;
        this.balance.available += position.amount + pnl.profit - result.fee;

        // Update daily stats
        this.dailyStats.profit += pnl.profit;

        // Remove from active positions
        this.positions.delete(symbol);

        // Emit close event
        this.emit('positionClosed', position, result);

        logger.info(`🏁 Position closed: ${symbol} - P&L: ${pnl.profit >= 0 ? '+' : ''}$${pnl.profit.toFixed(2)} (${pnl.percentage.toFixed(2)}%)`);
        
        return { position, closeTrade: result };
      }

      throw new Error('Failed to close position');

    } catch (error) {
      logger.error(`❌ Error closing position ${symbol}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 💰 Calculate P&L for position
   */
  calculatePnL(position, exitPrice) {
    const entryValue = position.amount;
    let profit = 0;

    if (position.side === 'LONG') {
      // Long position: profit when price goes up
      profit = (exitPrice - position.entryPrice) / position.entryPrice * entryValue;
    } else {
      // Short position: profit when price goes down
      profit = (position.entryPrice - exitPrice) / position.entryPrice * entryValue;
    }

    const percentage = (profit / entryValue) * 100;

    return { profit, percentage };
  }

  /**
   * 🎯 Check stop loss and take profit
   */
  async checkStopLossAndTakeProfit() {
    for (const [symbol, position] of this.positions) {
      try {
        // Get current price (mock for paper trading)
        const currentPrice = this.paperMode ? 
          await this.getMockCurrentPrice(symbol) :
          await this.getCurrentPrice(symbol);

        position.currentPrice = currentPrice;

        // Calculate current P&L
        const pnl = this.calculatePnL(position, currentPrice);
        position.pnl = pnl.profit;
        position.pnlPercent = pnl.percentage;

        // Check stop loss
        if (this.shouldTriggerStopLoss(position, currentPrice)) {
          await this.closePosition(symbol, 'stop_loss');
          continue;
        }

        // Check take profit
        if (this.shouldTriggerTakeProfit(position, currentPrice)) {
          await this.closePosition(symbol, 'take_profit');
          continue;
        }

      } catch (error) {
        logger.error(`❌ Error checking ${symbol} position: ${error.message}`);
      }
    }
  }

  /**
   * 🛑 Check if stop loss should trigger
   */
  shouldTriggerStopLoss(position, currentPrice) {
    if (!position.stopLoss) return false;

    if (position.side === 'LONG') {
      return currentPrice <= position.stopLoss;
    } else {
      return currentPrice >= position.stopLoss;
    }
  }

  /**
   * 🎯 Check if take profit should trigger
   */
  shouldTriggerTakeProfit(position, currentPrice) {
    if (!position.takeProfit) return false;

    if (position.side === 'LONG') {
      return currentPrice >= position.takeProfit;
    } else {
      return currentPrice <= position.takeProfit;
    }
  }

  /**
   * 📈 Get current price
   */
  async getCurrentPrice(symbol) {
    if (this.paperMode) {
      return this.getMockCurrentPrice(symbol);
    }

    const response = await this.makeRequest('GET', '/openApi/swap/v2/quote/price', {
      symbol: `${symbol}-USDT`
    });

    return parseFloat(response.data.price);
  }

  /**
   * 🎲 Get mock current price (for paper trading)
   */
  async getMockCurrentPrice(symbol) {
    const position = this.positions.get(symbol);
    if (!position) return 0;

    // Simulate price movement (±2% max change)
    const change = (Math.random() - 0.5) * 0.04;
    return position.entryPrice * (1 + change);
  }

  /**
   * 🌐 Make authenticated API request
   */
  async makeRequest(method, endpoint, params = {}) {
    const timestamp = Date.now();
    const queryString = new URLSearchParams(params).toString();
    
    let url = `${config.exchange.baseURL}${endpoint}`;
    if (method === 'GET' && queryString) {
      url += `?${queryString}`;
    }

    const headers = {
      'X-BX-APIKEY': config.exchange.apiKey,
      'Content-Type': 'application/json'
    };

    // Add signature
    const signaturePayload = `${timestamp}${method}${endpoint.split('/openApi')[1]}${queryString}`;
    const signature = crypto.createHmac('sha256', config.exchange.secret).update(signaturePayload).digest('hex');
    
    headers['X-BX-TIMESTAMP'] = timestamp;
    headers['X-BX-SIGNATURE'] = signature;

    const requestConfig = {
      method,
      url,
      headers,
      timeout: 10000
    };

    if (method === 'POST') {
      requestConfig.data = params;
    }

    const response = await axios(requestConfig);

    if (response.data.code && response.data.code !== 0) {
      throw new Error(`API Error: ${response.data.msg || 'Unknown error'}`);
    }

    return response;
  }

  /**
   * 📊 Get account summary
   */
  getAccountSummary() {
    return {
      balance: { ...this.balance },
      positions: Array.from(this.positions.values()),
      dailyStats: { ...this.dailyStats },
      activePositions: this.positions.size,
      totalValue: this.balance.available + this.balance.inTrades
    };
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    // Close all positions in paper mode
    if (this.paperMode) {
      for (const symbol of this.positions.keys()) {
        this.closePosition(symbol, 'cleanup').catch(err => 
          logger.error(`Error closing position ${symbol} during cleanup:`, err.message)
        );
      }
    }

    this.positions.clear();
    this.orders.clear();
    this.removeAllListeners();
    
    logger.info('🧹 Trade Executor cleaned up');
  }
}

module.exports = TradeExecutor;