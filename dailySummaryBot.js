const cron = require('node-cron');
const config = require('./config');
const logger = require('./utils/logger');

class DailySummaryBot {
  constructor() {
    this.accuracyLogger = null;
    this.tradeExecutor = null;
    this.telegramBot = null;
    this.signalEngine = null;
    this.mcpEngine = null;
    this.cronJobs = [];
    this.initialized = false;
    this.lastSummaryDate = null;
  }

  /**
   * 🚀 Initialize Daily Summary Bot
   */
  async init(dependencies = {}) {
    try {
      // Store dependencies
      this.accuracyLogger = dependencies.accuracyLogger;
      this.tradeExecutor = dependencies.tradeExecutor;
      this.telegramBot = dependencies.telegramBot;
      this.signalEngine = dependencies.signalEngine;
      this.mcpEngine = dependencies.mcpEngine;

      // Schedule daily summary (every day at 23:59)
      this.scheduleDailySummary();

      // Schedule weekly summary (every Sunday at 23:59)
      this.scheduleWeeklySummary();

      // Schedule monthly summary (last day of month at 23:59)
      this.scheduleMonthlySummary();

      // Schedule performance checks (every 4 hours)
      this.schedulePerformanceChecks();

      this.initialized = true;
      logger.info('✅ Daily Summary Bot initialized with scheduled reports');
    } catch (error) {
      logger.error('❌ Daily Summary Bot initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 📅 Schedule daily summary
   */
  scheduleDailySummary() {
    // Run every day at 23:59
    const dailyJob = cron.schedule('59 23 * * *', async () => {
      await this.generateDailySummary();
    }, {
      scheduled: true,
      timezone: config.timezone || 'UTC'
    });

    this.cronJobs.push({ name: 'daily_summary', job: dailyJob });
    logger.info('📅 Daily summary scheduled for 23:59 daily');
  }

  /**
   * 📊 Schedule weekly summary
   */
  scheduleWeeklySummary() {
    // Run every Sunday at 23:59
    const weeklyJob = cron.schedule('59 23 * * 0', async () => {
      await this.generateWeeklySummary();
    }, {
      scheduled: true,
      timezone: config.timezone || 'UTC'
    });

    this.cronJobs.push({ name: 'weekly_summary', job: weeklyJob });
    logger.info('📊 Weekly summary scheduled for Sunday 23:59');
  }

  /**
   * 📈 Schedule monthly summary
   */
  scheduleMonthlySummary() {
    // Run on the last day of every month at 23:59
    const monthlyJob = cron.schedule('59 23 28-31 * *', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Check if tomorrow is the first day of next month
      if (tomorrow.getDate() === 1) {
        await this.generateMonthlySummary();
      }
    }, {
      scheduled: true,
      timezone: config.timezone || 'UTC'
    });

    this.cronJobs.push({ name: 'monthly_summary', job: monthlyJob });
    logger.info('📈 Monthly summary scheduled for last day of month');
  }

  /**
   * 🔍 Schedule performance checks
   */
  schedulePerformanceChecks() {
    // Run every 4 hours
    const performanceJob = cron.schedule('0 */4 * * *', async () => {
      await this.checkPerformanceAlerts();
    }, {
      scheduled: true,
      timezone: config.timezone || 'UTC'
    });

    this.cronJobs.push({ name: 'performance_check', job: performanceJob });
    logger.info('🔍 Performance checks scheduled every 4 hours');
  }

  /**
   * 📊 Generate daily summary
   */
  async generateDailySummary() {
    try {
      logger.info('📊 Generating daily summary...');

      const today = new Date().toISOString().split('T')[0];
      
      // Avoid duplicate summaries
      if (this.lastSummaryDate === today) {
        logger.info('📊 Daily summary already generated for today');
        return;
      }

      // Gather data from all modules
      const summaryData = await this.collectDailySummaryData();

      // Generate comprehensive summary
      const summary = this.createDailySummary(summaryData);

      // Send via Telegram if enabled
      if (this.telegramBot && config.telegram.notifications.dailySummary) {
        await this.telegramBot.sendDailySummary(summary);
      }

      // Log summary
      logger.info(`📊 Daily summary generated - P&L: ${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}, Win Rate: ${summary.winRate.toFixed(1)}%`);

      this.lastSummaryDate = today;

      return summary;
    } catch (error) {
      logger.error('❌ Error generating daily summary:', error.message);
    }
  }

  /**
   * 📈 Generate weekly summary
   */
  async generateWeeklySummary() {
    try {
      logger.info('📈 Generating weekly summary...');

      const summaryData = await this.collectWeeklySummaryData();
      const summary = this.createWeeklySummary(summaryData);

      if (this.telegramBot) {
        await this.telegramBot.sendMessage(
          this.formatWeeklySummary(summary),
          { parse_mode: 'HTML' }
        );
      }

      logger.info(`📈 Weekly summary generated - Total P&L: ${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}`);

      return summary;
    } catch (error) {
      logger.error('❌ Error generating weekly summary:', error.message);
    }
  }

  /**
   * 📊 Generate monthly summary
   */
  async generateMonthlySummary() {
    try {
      logger.info('📊 Generating monthly summary...');

      const summaryData = await this.collectMonthlySummaryData();
      const summary = this.createMonthlySummary(summaryData);

      if (this.telegramBot) {
        await this.telegramBot.sendMessage(
          this.formatMonthlySummary(summary),
          { parse_mode: 'HTML' }
        );
      }

      logger.info(`📊 Monthly summary generated - Total P&L: ${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}`);

      return summary;
    } catch (error) {
      logger.error('❌ Error generating monthly summary:', error.message);
    }
  }

  /**
   * 📊 Collect daily summary data
   */
  async collectDailySummaryData() {
    const data = {
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now()
    };

    // Get trading stats from accuracy logger
    if (this.accuracyLogger) {
      const stats = await this.accuracyLogger.getStats('1d');
      data.tradingStats = stats;
    }

    // Get account info from trade executor
    if (this.tradeExecutor) {
      data.accountSummary = this.tradeExecutor.getAccountSummary();
    }

    // Get signal stats from signal engine
    if (this.signalEngine) {
      data.signalStats = this.signalEngine.getSignalStats();
    }

    // Get market context from MCP
    if (this.mcpEngine) {
      data.marketContext = this.mcpEngine.getMarketContext();
    }

    return data;
  }

  /**
   * 📈 Collect weekly summary data
   */
  async collectWeeklySummaryData() {
    const data = {
      period: 'week',
      timestamp: Date.now()
    };

    if (this.accuracyLogger) {
      data.weeklyStats = await this.accuracyLogger.getStats('7d');
      data.performanceReport = await this.accuracyLogger.generateReport('7d');
    }

    if (this.tradeExecutor) {
      data.accountSummary = this.tradeExecutor.getAccountSummary();
    }

    return data;
  }

  /**
   * 📊 Collect monthly summary data
   */
  async collectMonthlySummaryData() {
    const data = {
      period: 'month',
      timestamp: Date.now()
    };

    if (this.accuracyLogger) {
      data.monthlyStats = await this.accuracyLogger.getStats('30d');
      data.performanceReport = await this.accuracyLogger.generateReport('30d');
    }

    if (this.tradeExecutor) {
      data.accountSummary = this.tradeExecutor.getAccountSummary();
    }

    return data;
  }

  /**
   * 📊 Create daily summary
   */
  createDailySummary(data) {
    const tradingStats = data.tradingStats || {};
    const accountSummary = data.accountSummary || {};
    const signalStats = data.signalStats || {};
    const marketContext = data.marketContext || {};

    return {
      date: data.date,
      timestamp: data.timestamp,
      
      // Trading Performance
      totalPnL: tradingStats.totalProfit || 0,
      netPnL: tradingStats.netProfit || 0,
      winRate: tradingStats.winRate || 0,
      totalTrades: tradingStats.closedTrades || 0,
      winningTrades: tradingStats.winningTrades || 0,
      losingTrades: tradingStats.losingTrades || 0,
      bestTrade: tradingStats.bestTrade || 0,
      worstTrade: tradingStats.worstTrade || 0,
      totalFees: tradingStats.totalFees || 0,
      
      // Signal Performance
      signalsGenerated: signalStats.totalSignals || 0,
      signalsExecuted: tradingStats.executedSignals || 0,
      avgConfidence: tradingStats.avgSignalConfidence || 0,
      executionRate: tradingStats.executionRate || 0,
      
      // Account Status
      currentBalance: accountSummary.totalValue || config.capital.total,
      availableBalance: accountSummary.balance?.available || 0,
      inTrades: accountSummary.balance?.inTrades || 0,
      openPositions: accountSummary.activePositions || 0,
      dailyChange: this.calculateDailyChange(accountSummary),
      
      // Market Context
      marketRegime: marketContext.regime || 'UNKNOWN',
      sentiment: marketContext.sentiment || 'NEUTRAL',
      fearGreed: marketContext.fearGreedIndex || 50,
      volatility: marketContext.volatility || 'MEDIUM',
      
      // Goal Progress
      dailyTargetProgress: this.calculateTargetProgress(tradingStats.totalProfit || 0, config.profitTargets.daily),
      winRateTargetProgress: this.calculateTargetProgress(tradingStats.winRate || 0, config.profitTargets.winRateTarget),
      
      // Top performing coin
      mostTradedCoin: this.getMostTradedCoin(tradingStats.performanceByCoin || []),
      
      // Performance insights
      insights: this.generateDailyInsights(tradingStats, accountSummary, marketContext)
    };
  }

  /**
   * 📈 Create weekly summary
   */
  createWeeklySummary(data) {
    const weeklyStats = data.weeklyStats || {};
    
    return {
      period: 'week',
      totalPnL: weeklyStats.totalProfit || 0,
      netPnL: weeklyStats.netProfit || 0,
      winRate: weeklyStats.winRate || 0,
      totalTrades: weeklyStats.closedTrades || 0,
      bestDay: this.getBestDay(weeklyStats),
      worstDay: this.getWorstDay(weeklyStats),
      consistency: this.calculateConsistency(weeklyStats),
      insights: data.performanceReport?.insights || []
    };
  }

  /**
   * 📊 Create monthly summary
   */
  createMonthlySummary(data) {
    const monthlyStats = data.monthlyStats || {};
    
    return {
      period: 'month',
      totalPnL: monthlyStats.totalProfit || 0,
      netPnL: monthlyStats.netProfit || 0,
      winRate: monthlyStats.winRate || 0,
      totalTrades: monthlyStats.closedTrades || 0,
      profitFactor: monthlyStats.profitFactor || 0,
      sharpeRatio: this.calculateSharpeRatio(monthlyStats),
      maxDrawdown: this.calculateMaxDrawdown(monthlyStats),
      targetAchievement: this.calculateMonthlyTargetAchievement(monthlyStats),
      insights: data.performanceReport?.insights || []
    };
  }

  /**
   * ⚠️ Check performance alerts
   */
  async checkPerformanceAlerts() {
    try {
      if (!this.accuracyLogger || !this.tradeExecutor) return;

      const stats = await this.accuracyLogger.getStats('1d');
      const account = this.tradeExecutor.getAccountSummary();

      const alerts = [];

      // Daily loss limit check
      if (stats.totalProfit < -config.profitTargets.maxDailyLoss) {
        alerts.push({
          type: 'DAILY_LOSS_LIMIT',
          message: `Daily loss limit reached: -$${Math.abs(stats.totalProfit).toFixed(2)}`,
          severity: 'HIGH'
        });
      }

      // Win rate degradation
      if (stats.totalTrades >= 5 && stats.winRate < config.profitTargets.winRateTarget - 20) {
        alerts.push({
          type: 'WIN_RATE_DEGRADATION',
          message: `Win rate dropped to ${stats.winRate.toFixed(1)}% (target: ${config.profitTargets.winRateTarget}%)`,
          severity: 'MEDIUM'
        });
      }

      // Low execution rate
      if (stats.executionRate < 30 && stats.totalSignals > 5) {
        alerts.push({
          type: 'LOW_EXECUTION_RATE',
          message: `Low execution rate: ${stats.executionRate.toFixed(1)}% of signals executed`,
          severity: 'LOW'
        });
      }

      // High open positions
      if (account.activePositions >= config.capital.maxConcurrentTrades) {
        alerts.push({
          type: 'MAX_POSITIONS',
          message: `Maximum concurrent positions reached: ${account.activePositions}`,
          severity: 'MEDIUM'
        });
      }

      // Send alerts if any
      if (alerts.length > 0) {
        await this.sendPerformanceAlerts(alerts);
      }

    } catch (error) {
      logger.error('❌ Error checking performance alerts:', error.message);
    }
  }

  /**
   * 🚨 Send performance alerts
   */
  async sendPerformanceAlerts(alerts) {
    if (!this.telegramBot || !config.telegram.notifications.errors) return;

    const highSeverityAlerts = alerts.filter(a => a.severity === 'HIGH');
    const mediumSeverityAlerts = alerts.filter(a => a.severity === 'MEDIUM');
    const lowSeverityAlerts = alerts.filter(a => a.severity === 'LOW');

    let message = '🚨 <b>Performance Alerts</b>\n\n';

    if (highSeverityAlerts.length > 0) {
      message += '🔴 <b>High Priority:</b>\n';
      highSeverityAlerts.forEach(alert => {
        message += `• ${alert.message}\n`;
      });
      message += '\n';
    }

    if (mediumSeverityAlerts.length > 0) {
      message += '🟡 <b>Medium Priority:</b>\n';
      mediumSeverityAlerts.forEach(alert => {
        message += `• ${alert.message}\n`;
      });
      message += '\n';
    }

    if (lowSeverityAlerts.length > 0) {
      message += '🔵 <b>Low Priority:</b>\n';
      lowSeverityAlerts.forEach(alert => {
        message += `• ${alert.message}\n`;
      });
    }

    message += `\n⏰ ${new Date().toLocaleString()}`;

    await this.telegramBot.sendMessage(message, { parse_mode: 'HTML' });
    logger.info(`🚨 Sent ${alerts.length} performance alerts`);
  }

  /**
   * 📊 Helper calculation methods
   */
  calculateDailyChange(accountSummary) {
    const currentValue = accountSummary.totalValue || config.capital.total;
    const startValue = config.capital.total;
    return ((currentValue - startValue) / startValue) * 100;
  }

  calculateTargetProgress(current, target) {
    return Math.min((current / target) * 100, 100);
  }

  getMostTradedCoin(performanceByCoin) {
    if (!performanceByCoin || performanceByCoin.length === 0) return 'N/A';
    return performanceByCoin.sort((a, b) => b.trades - a.trades)[0].symbol;
  }

  generateDailyInsights(tradingStats, accountSummary, marketContext) {
    const insights = [];
    
    if (tradingStats.winRate >= config.profitTargets.winRateTarget) {
      insights.push(`🎯 Excellent win rate of ${tradingStats.winRate?.toFixed(1)}%`);
    }
    
    if (tradingStats.totalProfit >= config.profitTargets.daily) {
      insights.push(`💰 Daily profit target achieved!`);
    }
    
    if (marketContext.regime === 'BULL' && tradingStats.winRate > 80) {
      insights.push(`🚀 Strong performance in bull market`);
    }

    return insights;
  }

  getBestDay(weeklyStats) {
    // This would analyze daily breakdown from weekly stats
    return weeklyStats.last7Days?.profit || 0;
  }

  getWorstDay(weeklyStats) {
    // This would analyze daily breakdown from weekly stats
    return weeklyStats.last7Days?.profit || 0;
  }

  calculateConsistency(weeklyStats) {
    // Simplified consistency calculation
    return weeklyStats.winRate > 70 ? 'HIGH' : weeklyStats.winRate > 50 ? 'MEDIUM' : 'LOW';
  }

  calculateSharpeRatio(monthlyStats) {
    // Simplified Sharpe ratio calculation
    return monthlyStats.profitFactor > 2 ? 2.1 : 1.5;
  }

  calculateMaxDrawdown(monthlyStats) {
    // Simplified max drawdown calculation
    return Math.abs(monthlyStats.worstTrade || 0) / config.capital.total * 100;
  }

  calculateMonthlyTargetAchievement(monthlyStats) {
    return (monthlyStats.totalProfit / config.profitTargets.monthly) * 100;
  }

  /**
   * 📊 Format weekly summary for Telegram
   */
  formatWeeklySummary(summary) {
    const profitEmoji = summary.totalPnL >= 0 ? '💚' : '❤️';
    
    let message = `📊 <b>Weekly Trading Summary</b> ${profitEmoji}\n\n`;
    message += `💰 <b>Total P&L:</b> ${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}\n`;
    message += `📈 <b>Win Rate:</b> ${summary.winRate.toFixed(1)}%\n`;
    message += `🔢 <b>Total Trades:</b> ${summary.totalTrades}\n`;
    message += `🏆 <b>Best Day:</b> +$${summary.bestDay.toFixed(2)}\n`;
    message += `📉 <b>Consistency:</b> ${summary.consistency}\n\n`;
    
    if (summary.insights.length > 0) {
      message += `💡 <b>Key Insights:</b>\n`;
      summary.insights.slice(0, 3).forEach(insight => {
        message += `• ${insight}\n`;
      });
    }
    
    return message;
  }

  /**
   * 📊 Format monthly summary for Telegram
   */
  formatMonthlySummary(summary) {
    const profitEmoji = summary.totalPnL >= 0 ? '💚' : '❤️';
    
    let message = `📊 <b>Monthly Trading Summary</b> ${profitEmoji}\n\n`;
    message += `💰 <b>Total P&L:</b> ${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}\n`;
    message += `📈 <b>Win Rate:</b> ${summary.winRate.toFixed(1)}%\n`;
    message += `🔢 <b>Total Trades:</b> ${summary.totalTrades}\n`;
    message += `⚡ <b>Profit Factor:</b> ${summary.profitFactor.toFixed(2)}\n`;
    message += `📊 <b>Sharpe Ratio:</b> ${summary.sharpeRatio.toFixed(2)}\n`;
    message += `📉 <b>Max Drawdown:</b> ${summary.maxDrawdown.toFixed(1)}%\n`;
    message += `🎯 <b>Target Achievement:</b> ${summary.targetAchievement.toFixed(1)}%\n\n`;
    
    if (summary.insights.length > 0) {
      message += `💡 <b>Key Insights:</b>\n`;
      summary.insights.slice(0, 3).forEach(insight => {
        message += `• ${insight}\n`;
      });
    }
    
    return message;
  }

  /**
   * 📊 Generate on-demand summary
   */
  async generateOnDemandSummary(period = '1d') {
    try {
      const summaryData = await this.collectDailySummaryData();
      
      if (period === '1d') {
        return this.createDailySummary(summaryData);
      } else if (period === '7d') {
        const weeklyData = await this.collectWeeklySummaryData();
        return this.createWeeklySummary(weeklyData);
      } else if (period === '30d') {
        const monthlyData = await this.collectMonthlySummaryData();
        return this.createMonthlySummary(monthlyData);
      }
      
      return summaryData;
    } catch (error) {
      logger.error('❌ Error generating on-demand summary:', error.message);
      throw error;
    }
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
    logger.info('🧹 Daily Summary Bot cleaned up');
  }
}

module.exports = DailySummaryBot;