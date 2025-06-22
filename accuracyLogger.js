const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');

class AccuracyLogger {
  constructor() {
    this.trades = [];
    this.signals = [];
    this.dailyStats = new Map();
    this.monthlyStats = new Map();
    this.dataDir = config.database.json.directory;
    this.tradesFile = path.join(this.dataDir, 'trades.json');
    this.signalsFile = path.join(this.dataDir, 'signals.json');
    this.statsFile = path.join(this.dataDir, 'stats.json');
    this.initialized = false;
  }

  /**
   * 🚀 Initialize Accuracy Logger
   */
  async init() {
    try {
      // Create data directory if it doesn't exist
      await this.ensureDataDirectory();

      // Load existing data
      await this.loadData();

      this.initialized = true;
      logger.info('✅ Accuracy Logger initialized');
      
      // Log current stats
      const stats = await this.getStats();
      logger.info(`📊 Loaded: ${stats.totalTrades} trades, ${stats.totalSignals} signals, ${stats.winRate.toFixed(1)}% win rate`);
    } catch (error) {
      logger.error('❌ Accuracy Logger initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 📂 Ensure data directory exists
   */
  async ensureDataDirectory() {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
      logger.info(`📂 Created data directory: ${this.dataDir}`);
    }
  }

  /**
   * 📥 Load existing data
   */
  async loadData() {
    try {
      // Load trades
      try {
        const tradesData = await fs.readFile(this.tradesFile, 'utf8');
        this.trades = JSON.parse(tradesData);
      } catch {
        this.trades = [];
      }

      // Load signals
      try {
        const signalsData = await fs.readFile(this.signalsFile, 'utf8');
        this.signals = JSON.parse(signalsData);
      } catch {
        this.signals = [];
      }

      // Rebuild stats from existing data
      await this.rebuildStats();

    } catch (error) {
      logger.error('❌ Error loading data:', error.message);
      // Initialize with empty data
      this.trades = [];
      this.signals = [];
    }
  }

  /**
   * 💾 Save data to files
   */
  async saveData() {
    try {
      // Save trades
      await fs.writeFile(this.tradesFile, JSON.stringify(this.trades, null, 2));
      
      // Save signals
      await fs.writeFile(this.signalsFile, JSON.stringify(this.signals, null, 2));
      
      // Save stats
      const statsData = {
        daily: Object.fromEntries(this.dailyStats),
        monthly: Object.fromEntries(this.monthlyStats),
        lastUpdate: Date.now()
      };
      await fs.writeFile(this.statsFile, JSON.stringify(statsData, null, 2));

    } catch (error) {
      logger.error('❌ Error saving data:', error.message);
    }
  }

  /**
   * 📊 Log signal generation
   */
  async logSignal(signal) {
    try {
      const signalLog = {
        id: signal.id,
        symbol: signal.symbol,
        type: signal.type,
        strength: signal.strength,
        confidence: signal.finalConfidence,
        entryPrice: signal.entryPrice,
        currentPrice: signal.currentPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        risk: signal.risk,
        timeHorizon: signal.timeHorizon,
        positionSize: signal.positionSize,
        marketRegime: signal.context.regime,
        sentiment: signal.context.sentiment,
        fearGreed: signal.context.fearGreed,
        aiSources: signal.ai.sources,
        technicalScore: signal.technical.confidence,
        timestamp: signal.timestamp,
        status: 'GENERATED',
        outcome: null // Will be updated when trade completes
      };

      this.signals.push(signalLog);
      
      // Update daily stats
      this.updateDailySignalStats(signalLog);

      // Auto-save if enabled
      if (config.database.json.autoSave) {
        await this.saveData();
      }

      logger.debug(`📊 Signal logged: ${signal.symbol} ${signal.type} - ${signal.finalConfidence}% confidence`);
    } catch (error) {
      logger.error('❌ Error logging signal:', error.message);
    }
  }

  /**
   * 💼 Log trade execution
   */
  async logTrade(trade, position = null) {
    try {
      const tradeLog = {
        id: trade.id,
        signalId: trade.signalId,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        entryPrice: trade.executionPrice || trade.price,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        leverage: trade.leverage,
        fee: trade.fee,
        slippage: trade.slippage || 0,
        status: trade.status,
        timestamp: trade.fillTime || trade.timestamp,
        approval: trade.approval,
        
        // Position details (if closed)
        exitPrice: position?.exitPrice || null,
        exitTime: position?.exitTime || null,
        pnl: position?.pnl || null,
        pnlPercent: position?.pnlPercent || null,
        holdTime: position?.exitTime ? position.exitTime - trade.timestamp : null,
        outcome: position ? this.determineOutcome(position) : 'OPEN'
      };

      // Find and update existing trade or add new
      const existingIndex = this.trades.findIndex(t => t.id === trade.id);
      if (existingIndex >= 0) {
        this.trades[existingIndex] = tradeLog;
      } else {
        this.trades.push(tradeLog);
      }

      // Update corresponding signal outcome
      this.updateSignalOutcome(trade.signalId, tradeLog);

      // Update daily stats
      this.updateDailyTradeStats(tradeLog);

      // Auto-save if enabled
      if (config.database.json.autoSave) {
        await this.saveData();
      }

      logger.debug(`💼 Trade logged: ${trade.symbol} ${trade.side} - ${tradeLog.outcome}`);
    } catch (error) {
      logger.error('❌ Error logging trade:', error.message);
    }
  }

  /**
   * 🎯 Determine trade outcome
   */
  determineOutcome(position) {
    if (position.status !== 'CLOSED') return 'OPEN';
    
    if (position.pnl > 0) return 'WIN';
    if (position.pnl < 0) return 'LOSS';
    return 'BREAKEVEN';
  }

  /**
   * 🔄 Update signal outcome
   */
  updateSignalOutcome(signalId, tradeLog) {
    const signal = this.signals.find(s => s.id === signalId);
    if (signal) {
      signal.outcome = tradeLog.outcome;
      signal.actualEntryPrice = tradeLog.entryPrice;
      signal.actualExitPrice = tradeLog.exitPrice;
      signal.actualPnL = tradeLog.pnl;
      signal.actualPnLPercent = tradeLog.pnlPercent;
      signal.holdTime = tradeLog.holdTime;
      signal.executionDelay = tradeLog.timestamp - signal.timestamp;
      signal.status = tradeLog.status === 'FILLED' ? 'EXECUTED' : tradeLog.status;
    }
  }

  /**
   * 📊 Update daily signal stats
   */
  updateDailySignalStats(signal) {
    const dateKey = new Date(signal.timestamp).toISOString().split('T')[0];
    
    if (!this.dailyStats.has(dateKey)) {
      this.dailyStats.set(dateKey, {
        date: dateKey,
        signalsGenerated: 0,
        signalsExecuted: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        profit: 0,
        fees: 0,
        winRate: 0,
        avgConfidence: 0,
        avgHoldTime: 0,
        bestTrade: 0,
        worstTrade: 0,
        coins: new Set()
      });
    }

    const dayStats = this.dailyStats.get(dateKey);
    dayStats.signalsGenerated++;
    dayStats.coins.add(signal.symbol);
    
    // Update average confidence
    const totalSignals = dayStats.signalsGenerated;
    dayStats.avgConfidence = ((dayStats.avgConfidence * (totalSignals - 1)) + signal.confidence) / totalSignals;
  }

  /**
   * 💼 Update daily trade stats
   */
  updateDailyTradeStats(trade) {
    const dateKey = new Date(trade.timestamp).toISOString().split('T')[0];
    
    if (!this.dailyStats.has(dateKey)) {
      this.updateDailySignalStats({ timestamp: trade.timestamp, symbol: trade.symbol, confidence: 0 });
    }

    const dayStats = this.dailyStats.get(dateKey);
    
    if (trade.outcome !== 'OPEN') {
      dayStats.trades++;
      dayStats.fees += trade.fee || 0;
      
      if (trade.outcome === 'WIN') {
        dayStats.wins++;
        dayStats.profit += trade.pnl || 0;
        dayStats.bestTrade = Math.max(dayStats.bestTrade, trade.pnl || 0);
      } else if (trade.outcome === 'LOSS') {
        dayStats.losses++;
        dayStats.profit += trade.pnl || 0; // pnl is negative for losses
        dayStats.worstTrade = Math.min(dayStats.worstTrade, trade.pnl || 0);
      }
      
      // Update win rate
      dayStats.winRate = dayStats.trades > 0 ? (dayStats.wins / dayStats.trades) * 100 : 0;
      
      // Update average hold time
      if (trade.holdTime) {
        const totalTrades = dayStats.trades;
        dayStats.avgHoldTime = ((dayStats.avgHoldTime * (totalTrades - 1)) + trade.holdTime) / totalTrades;
      }
    }
    
    if (trade.status === 'FILLED') {
      dayStats.signalsExecuted++;
    }
  }

  /**
   * 📈 Get comprehensive statistics
   */
  async getStats(period = 'all') {
    const now = Date.now();
    let filteredTrades = this.trades;
    let filteredSignals = this.signals;

    // Filter by period
    if (period !== 'all') {
      const periodMs = this.getPeriodMs(period);
      const cutoff = now - periodMs;
      
      filteredTrades = this.trades.filter(t => t.timestamp >= cutoff);
      filteredSignals = this.signals.filter(s => s.timestamp >= cutoff);
    }

    // Calculate basic stats
    const totalTrades = filteredTrades.length;
    const closedTrades = filteredTrades.filter(t => t.outcome !== 'OPEN');
    const winningTrades = closedTrades.filter(t => t.outcome === 'WIN');
    const losingTrades = closedTrades.filter(t => t.outcome === 'LOSS');
    
    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalFees = filteredTrades.reduce((sum, t) => sum + (t.fee || 0), 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

    // Calculate advanced stats
    const avgWin = winningTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? 
      Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;
    
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
    const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.pnl || 0)) : 0;
    const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnl || 0)) : 0;

    // Signal accuracy
    const totalSignals = filteredSignals.length;
    const executedSignals = filteredSignals.filter(s => s.status === 'EXECUTED');
    const executionRate = totalSignals > 0 ? (executedSignals.length / totalSignals) * 100 : 0;
    
    const avgSignalConfidence = totalSignals > 0 ? 
      filteredSignals.reduce((sum, s) => sum + s.confidence, 0) / totalSignals : 0;

    // Performance by timeframes
    const performanceByTimeframe = this.calculatePerformanceByTimeframe(closedTrades);
    const performanceByCoin = this.calculatePerformanceByCoin(closedTrades);
    const performanceByRisk = this.calculatePerformanceByRisk(closedTrades);

    return {
      period,
      timestamp: now,
      
      // Basic metrics
      totalSignals,
      executedSignals: executedSignals.length,
      executionRate,
      totalTrades,
      closedTrades: closedTrades.length,
      openTrades: totalTrades - closedTrades.length,
      
      // Performance metrics
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalProfit,
      totalFees,
      netProfit: totalProfit - totalFees,
      
      // Advanced metrics
      avgWin,
      avgLoss,
      profitFactor,
      bestTrade,
      worstTrade,
      avgSignalConfidence,
      
      // Breakdown analysis
      performanceByTimeframe,
      performanceByCoin,
      performanceByRisk,
      
      // Recent performance
      last7Days: await this.getRecentPerformance(7),
      last30Days: await this.getRecentPerformance(30),
      
      // Monthly breakdown
      monthlyBreakdown: this.getMonthlyBreakdown(),
      
      // Goals progress
      goalsProgress: this.calculateGoalsProgress(totalProfit, winRate)
    };
  }

  /**
   * 📅 Get recent performance
   */
  async getRecentPerformance(days) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentTrades = this.trades.filter(t => t.timestamp >= cutoff && t.outcome !== 'OPEN');
    
    if (recentTrades.length === 0) {
      return { trades: 0, profit: 0, winRate: 0 };
    }

    const profit = recentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const wins = recentTrades.filter(t => t.outcome === 'WIN').length;
    const winRate = (wins / recentTrades.length) * 100;

    return {
      trades: recentTrades.length,
      profit,
      winRate,
      avgProfit: profit / recentTrades.length
    };
  }

  /**
   * 📊 Calculate performance by timeframe
   */
  calculatePerformanceByTimeframe(trades) {
    const timeframes = { SHORT: [], MEDIUM: [], LONG: [] };
    
    trades.forEach(trade => {
      const signal = this.signals.find(s => s.id === trade.signalId);
      if (signal && signal.timeHorizon) {
        timeframes[signal.timeHorizon].push(trade);
      }
    });

    const result = {};
    for (const [timeframe, tfTrades] of Object.entries(timeframes)) {
      if (tfTrades.length > 0) {
        const wins = tfTrades.filter(t => t.outcome === 'WIN').length;
        const profit = tfTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        
        result[timeframe] = {
          trades: tfTrades.length,
          winRate: (wins / tfTrades.length) * 100,
          profit,
          avgProfit: profit / tfTrades.length
        };
      }
    }

    return result;
  }

  /**
   * 🪙 Calculate performance by coin
   */
  calculatePerformanceByCoin(trades) {
    const coinPerformance = {};
    
    trades.forEach(trade => {
      if (!coinPerformance[trade.symbol]) {
        coinPerformance[trade.symbol] = {
          trades: 0,
          wins: 0,
          profit: 0
        };
      }
      
      const perf = coinPerformance[trade.symbol];
      perf.trades++;
      if (trade.outcome === 'WIN') perf.wins++;
      perf.profit += trade.pnl || 0;
    });

    // Convert to array and add calculated fields
    return Object.entries(coinPerformance)
      .map(([symbol, data]) => ({
        symbol,
        trades: data.trades,
        winRate: (data.wins / data.trades) * 100,
        profit: data.profit,
        avgProfit: data.profit / data.trades
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  /**
   * ⚠️ Calculate performance by risk level
   */
  calculatePerformanceByRisk(trades) {
    const riskPerformance = { LOW: [], MEDIUM: [], HIGH: [] };
    
    trades.forEach(trade => {
      const signal = this.signals.find(s => s.id === trade.signalId);
      if (signal && signal.risk) {
        riskPerformance[signal.risk].push(trade);
      }
    });

    const result = {};
    for (const [risk, riskTrades] of Object.entries(riskPerformance)) {
      if (riskTrades.length > 0) {
        const wins = riskTrades.filter(t => t.outcome === 'WIN').length;
        const profit = riskTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        
        result[risk] = {
          trades: riskTrades.length,
          winRate: (wins / riskTrades.length) * 100,
          profit,
          avgProfit: profit / riskTrades.length
        };
      }
    }

    return result;
  }

  /**
   * 📅 Get monthly breakdown
   */
  getMonthlyBreakdown() {
    const monthlyData = {};
    
    this.trades.forEach(trade => {
      if (trade.outcome === 'OPEN') return;
      
      const monthKey = new Date(trade.timestamp).toISOString().substr(0, 7); // YYYY-MM
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          trades: 0,
          wins: 0,
          profit: 0,
          fees: 0
        };
      }
      
      const month = monthlyData[monthKey];
      month.trades++;
      if (trade.outcome === 'WIN') month.wins++;
      month.profit += trade.pnl || 0;
      month.fees += trade.fee || 0;
    });

    // Add calculated fields and sort
    return Object.values(monthlyData)
      .map(month => ({
        ...month,
        winRate: month.trades > 0 ? (month.wins / month.trades) * 100 : 0,
        netProfit: month.profit - month.fees
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  /**
   * 🎯 Calculate goals progress
   */
  calculateGoalsProgress(totalProfit, winRate) {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    
    const dailyProgress = totalProfit / config.profitTargets.daily * 100;
    const monthlyProjected = (totalProfit / dayOfMonth) * daysInMonth;
    const monthlyProgress = monthlyProjected / config.profitTargets.monthly * 100;
    const winRateProgress = winRate / config.profitTargets.winRateTarget * 100;

    return {
      daily: {
        target: config.profitTargets.daily,
        current: totalProfit,
        progress: Math.min(dailyProgress, 100),
        status: dailyProgress >= 100 ? 'achieved' : 'in_progress'
      },
      monthly: {
        target: config.profitTargets.monthly,
        projected: monthlyProjected,
        progress: Math.min(monthlyProgress, 100),
        status: monthlyProgress >= 100 ? 'on_track' : 'behind'
      },
      winRate: {
        target: config.profitTargets.winRateTarget,
        current: winRate,
        progress: Math.min(winRateProgress, 100),
        status: winRateProgress >= 100 ? 'achieved' : 'below_target'
      }
    };
  }

  /**
   * 🔄 Rebuild stats from existing data
   */
  async rebuildStats() {
    this.dailyStats.clear();
    this.monthlyStats.clear();

    // Process all signals
    this.signals.forEach(signal => {
      this.updateDailySignalStats(signal);
    });

    // Process all trades
    this.trades.forEach(trade => {
      this.updateDailyTradeStats(trade);
    });

    logger.debug('📊 Stats rebuilt from existing data');
  }

  /**
   * ⏰ Get period in milliseconds
   */
  getPeriodMs(period) {
    const periods = {
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    
    return periods[period] || periods['30d'];
  }

  /**
   * 🔍 Generate detailed report
   */
  async generateReport(period = '30d') {
    const stats = await this.getStats(period);
    
    const report = {
      title: `Trading Performance Report - ${period.toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      period,
      
      summary: {
        totalProfit: stats.totalProfit,
        netProfit: stats.netProfit,
        winRate: stats.winRate,
        totalTrades: stats.totalTrades,
        executionRate: stats.executionRate
      },
      
      performance: {
        profitFactor: stats.profitFactor,
        bestTrade: stats.bestTrade,
        worstTrade: stats.worstTrade,
        avgWin: stats.avgWin,
        avgLoss: stats.avgLoss
      },
      
      breakdown: {
        byTimeframe: stats.performanceByTimeframe,
        byCoin: stats.performanceByCoin.slice(0, 10), // Top 10
        byRisk: stats.performanceByRisk
      },
      
      goals: stats.goalsProgress,
      
      insights: this.generateInsights(stats)
    };

    return report;
  }

  /**
   * 💡 Generate insights from stats
   */
  generateInsights(stats) {
    const insights = [];
    
    // Win rate insights
    if (stats.winRate >= config.profitTargets.winRateTarget) {
      insights.push(`🎯 Excellent win rate of ${stats.winRate.toFixed(1)}% (target: ${config.profitTargets.winRateTarget}%)`);
    } else {
      insights.push(`⚠️ Win rate of ${stats.winRate.toFixed(1)}% below target of ${config.profitTargets.winRateTarget}%`);
    }
    
    // Profit factor insights
    if (stats.profitFactor > 2) {
      insights.push(`💪 Strong profit factor of ${stats.profitFactor.toFixed(2)} indicates good risk management`);
    } else if (stats.profitFactor < 1) {
      insights.push(`🔴 Profit factor of ${stats.profitFactor.toFixed(2)} indicates losses exceed wins`);
    }
    
    // Best performing assets
    if (stats.performanceByCoin.length > 0) {
      const bestCoin = stats.performanceByCoin[0];
      insights.push(`🏆 Best performing asset: ${bestCoin.symbol} (+$${bestCoin.profit.toFixed(2)})`);
    }
    
    // Execution rate insights
    if (stats.executionRate < 50) {
      insights.push(`⚠️ Low execution rate (${stats.executionRate.toFixed(1)}%) - consider reviewing approval settings`);
    }

    return insights;
  }

  /**
   * 🧹 Cleanup old data
   */
  async cleanupOldData(daysToKeep = 90) {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    const originalTradesCount = this.trades.length;
    const originalSignalsCount = this.signals.length;
    
    this.trades = this.trades.filter(t => t.timestamp >= cutoff);
    this.signals = this.signals.filter(s => s.timestamp >= cutoff);
    
    const removedTrades = originalTradesCount - this.trades.length;
    const removedSignals = originalSignalsCount - this.signals.length;
    
    if (removedTrades > 0 || removedSignals > 0) {
      await this.saveData();
      logger.info(`🧹 Cleaned up ${removedTrades} old trades and ${removedSignals} old signals`);
    }
  }

  /**
   * 🧹 Cleanup resources
   */
  async cleanup() {
    // Save final data
    if (config.database.json.autoSave) {
      await this.saveData();
    }
    
    // Cleanup old data
    await this.cleanupOldData();
    
    logger.info('🧹 Accuracy Logger cleaned up');
  }
}

module.exports = AccuracyLogger;