#!/usr/bin/env node

/**
 * 🚀 ProTradeAI Dashboard Server (Live/Mock Data Mode)
 * 
 * Enhanced server with live data integration and mock data fallback
 * Automatically detects and connects to running ProTradeAI bot instances
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const config = require('./config');

// ============================================================================
// 🔗 LIVE DATA INTEGRATION CLASS
// ============================================================================

class LiveDataIntegration {
  constructor() {
    this.dataPath = path.join(__dirname, 'data');
    this.signalsFile = path.join(this.dataPath, 'signals.json');
    this.tradesFile = path.join(this.dataPath, 'trades.json');
    this.statsFile = path.join(this.dataPath, 'stats.json');
    
    this.liveBot = null; // Reference to running bot instance
    this.lastDataFetch = 0;
    this.cachedData = null;
    this.cacheTimeout = 5000; // 5 second cache
  }

  /**
   * 🔌 Connect to running bot instance
   */
  connectToBot(botInstance) {
    this.liveBot = botInstance;
    console.log('🔗 Connected to live bot instance');
  }

  /**
   * 📊 Get live dashboard data with intelligent fallback
   */
  async getLiveData() {
    const now = Date.now();
    
    // Return cached data if fresh
    if (this.cachedData && (now - this.lastDataFetch) < this.cacheTimeout) {
      return this.cachedData;
    }

    try {
      let data;
      
      // Try to get live data from bot first
      if (this.liveBot && this.liveBot.running) {
        data = await this.getDataFromBot();
        console.log('📊 Using live bot data');
      } else {
        // Fallback to file-based data
        data = await this.getDataFromFiles();
        console.log('📁 Using file-based data');
      }
      
      // Cache the result
      this.cachedData = data;
      this.lastDataFetch = now;
      
      return data;
    } catch (error) {
      console.error('❌ Error getting live data:', error.message);
      // Final fallback to mock data
      return this.generateMockData();
    }
  }

  /**
   * 🤖 Get data directly from running bot instance
   */
  async getDataFromBot() {
    const bot = this.liveBot;
    const modules = bot.modules;
    
    // Get account/balance data
    const account = {
      balance: modules.tradeExecutor ? {
        available: modules.tradeExecutor.balance.available,
        inTrades: modules.tradeExecutor.balance.inTrades,
        total: modules.tradeExecutor.balance.total
      } : { available: 1000, inTrades: 0, total: 1000 },
      
      positions: this.getActivePositions(modules.tradeExecutor),
      dailyStats: this.getDailyStats(modules.tradeExecutor, modules.accuracyLogger)
    };

    // Get recent signals
    const signals = await this.getRecentSignals(modules.signalEngine);
    
    // Get recent trades
    const trades = await this.getRecentTrades(modules.tradeExecutor);
    
    // Get performance metrics
    const performance = await this.getPerformanceMetrics(modules.accuracyLogger);

    return {
      account,
      signals,
      trades,
      performance,
      lastUpdate: Date.now(),
      source: 'LIVE_BOT'
    };
  }
  /**
   * 📁 Get data from JSON files
   */
  async getDataFromFiles() {
    const signals = await this.readJSONFile(this.signalsFile, []);
    const trades = await this.readJSONFile(this.tradesFile, []);
    const stats = await this.readJSONFile(this.statsFile, {});
    
    // Analyze execution performance
    const executionAnalysis = this.analyzeExecutionRate(signals, trades);
    
    // Process signals for dashboard with execution status
    const recentSignals = signals
      .slice(-20) // Last 20 signals for better analysis
      .map(signal => ({
        id: signal.id,
        symbol: signal.symbol,
        type: signal.type,
        confidence: signal.finalConfidence || signal.confidence,
        finalConfidence: signal.finalConfidence || signal.confidence,
        entryPrice: signal.entryPrice,
        currentPrice: signal.currentPrice || signal.entryPrice,
        timestamp: signal.timestamp,
        status: signal.status || 'GENERATED',
        executed: this.isSignalExecuted(signal.id, trades),
        pnl: this.calculateSignalPnL(signal),
        theoreticalPnL: this.calculateTheoreticalPnL(signal),
        accuracy: signal.outcome ? (signal.outcome === 'WIN' ? 100 : 0) : null,
        duplicateOf: this.findDuplicateSignal(signal, signals)
      }));

    // Process trades for dashboard
    const recentTrades = trades
      .slice(-10)
      .map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        type: trade.side || trade.type,
        amount: trade.amount,
        entryPrice: trade.price || trade.entryPrice,
        exitPrice: trade.exitPrice,
        pnl: trade.pnl || 0,
        status: trade.status,
        timestamp: trade.timestamp
      }));

    // Calculate account info from trades/stats
    const account = this.calculateAccountFromFiles(trades, stats);
    
    // Calculate performance metrics with execution analysis
    const performance = this.calculatePerformanceFromFiles(trades, signals);
    performance.executionAnalysis = executionAnalysis;

    return {
      account,
      signals: recentSignals,
      trades: recentTrades,
      performance,
      executionAnalysis,
      lastUpdate: Date.now(),
      source: 'FILES'
    };
  }

  /**
   * 💼 Get active positions from trade executor
   */
  getActivePositions(tradeExecutor) {
    if (!tradeExecutor || !tradeExecutor.positions) return [];
    
    return Array.from(tradeExecutor.positions.values()).map(position => ({
      symbol: position.symbol,
      side: position.side,
      size: position.amount,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice || position.entryPrice,
      pnl: position.unrealizedPnL || 0,
      pnlPercent: position.unrealizedPnLPercent || 0
    }));
  }

  /**
   * 📈 Get daily stats
   */
  getDailyStats(tradeExecutor, accuracyLogger) {
    const defaultStats = { trades: 0, wins: 0, losses: 0, profit: 0, winRate: 0 };
    
    if (tradeExecutor && tradeExecutor.dailyStats) {
      const stats = tradeExecutor.dailyStats;
      return {
        trades: stats.trades || 0,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        profit: stats.profit || 0,
        winRate: stats.trades > 0 ? ((stats.wins / stats.trades) * 100) : 0
      };
    }
    
    return defaultStats;
  }

  /**
   * 🎯 Get recent signals from signal engine
   */
  async getRecentSignals(signalEngine) {
    if (!signalEngine || !signalEngine.signalHistory) return [];
    
    return signalEngine.signalHistory
      .slice(-10)
      .map(signal => ({
        id: signal.id,
        symbol: signal.symbol,
        type: signal.type,
        confidence: signal.finalConfidence || signal.confidence,
        finalConfidence: signal.finalConfidence || signal.confidence,
        entryPrice: signal.entryPrice,
        currentPrice: signal.currentPrice || signal.entryPrice,
        timestamp: signal.timestamp,
        status: signal.status,
        pnl: signal.pnl || 0,
        accuracy: signal.outcome ? (signal.outcome === 'WIN' ? 100 : 0) : null
      }));
  }

  /**
   * 💰 Get recent trades
   */
  async getRecentTrades(tradeExecutor) {
    if (!tradeExecutor) return [];
    
    // This would need to be implemented in the trade executor
    // For now, return empty array as trade history isn't centrally stored in memory
    return [];
  }

  /**
   * 📊 Get performance metrics
   */
  async getPerformanceMetrics(accuracyLogger) {
    if (!accuracyLogger) {
      return { winRate: 0, totalProfit: 0, totalTrades: 0, avgProfit: 0 };
    }
    
    // This would use the accuracy logger's data
    // Implementation depends on the accuracy logger's structure
    return { winRate: 0, totalProfit: 0, totalTrades: 0, avgProfit: 0 };
  }

  /**
   * 🔢 Calculate signal P&L
   */
  calculateSignalPnL(signal) {
    if (!signal.currentPrice || !signal.entryPrice) return 0;
    
    const priceChange = signal.currentPrice - signal.entryPrice;
    const direction = signal.type === 'LONG' ? 1 : -1;
    return (priceChange * direction) / signal.entryPrice * 100; // Percentage
  }

  /**
   * 💼 Calculate account info from files
   */
  calculateAccountFromFiles(trades, stats) {
    const activeTrades = trades.filter(t => t.status === 'ACTIVE' || t.status === 'OPEN');
    const inTrades = activeTrades.reduce((sum, trade) => sum + (trade.amount || 0), 0);
    
    return {
      balance: {
        total: stats.totalBalance || 1000,
        available: (stats.totalBalance || 1000) - inTrades,
        inTrades: inTrades
      },
      positions: activeTrades.map(trade => ({
        symbol: trade.symbol,
        side: trade.side || trade.type,
        size: trade.amount,
        entryPrice: trade.entryPrice || trade.price,
        currentPrice: trade.currentPrice || trade.entryPrice || trade.price,
        pnl: trade.pnl || 0,
        pnlPercent: trade.pnlPercent || 0
      })),
      dailyStats: {
        trades: stats.dailyTrades || 0,
        wins: stats.dailyWins || 0,
        losses: stats.dailyLosses || 0,
        profit: stats.dailyProfit || 0,
        winRate: stats.dailyTrades > 0 ? ((stats.dailyWins / stats.dailyTrades) * 100) : 0
      }
    };
  }

  /**
   * 📈 Calculate performance from files
   */
  calculatePerformanceFromFiles(trades, signals) {
    const completedTrades = trades.filter(t => t.status === 'COMPLETED' || t.status === 'CLOSED');
    const winningTrades = completedTrades.filter(t => (t.pnl || 0) > 0);
    
    return {
      winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length * 100) : 0,
      totalProfit: completedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0),
      totalTrades: completedTrades.length,
      avgProfit: completedTrades.length > 0 ? 
        completedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) / completedTrades.length : 0
    };
  }

  /**
   * 🔍 Analyze execution rate and performance
   */
  analyzeExecutionRate(signals, trades) {
    const totalSignals = signals.length;
    const executedSignals = signals.filter(signal => 
      trades.some(trade => trade.signalId === signal.id)
    ).length;
    
    const executionRate = totalSignals > 0 ? (executedSignals / totalSignals) * 100 : 0;
    
    // Analyze duplicates
    const duplicates = this.findDuplicateSignals(signals);
    
    // Calculate theoretical performance (if all signals were executed)
    const theoreticalPerformance = this.calculateTheoreticalPerformance(signals);
    
    // Analyze timing issues
    const timingIssues = this.analyzeSignalTiming(signals);
    
    return {
      totalSignals,
      executedSignals,
      executionRate,
      duplicates: duplicates.length,
      duplicateSymbols: duplicates.map(d => d.symbol),
      theoreticalPerformance,
      timingIssues,
      recommendations: this.generateExecutionRecommendations(executionRate, duplicates, theoreticalPerformance)
    };
  }

  /**
   * 🔍 Check if signal was executed
   */
  isSignalExecuted(signalId, trades) {
    return trades.some(trade => trade.signalId === signalId);
  }

  /**
   * 🔍 Find duplicate signals
   */
  findDuplicateSignals(signals) {
    const duplicates = [];
    const symbolTimeMap = new Map();
    
    signals.forEach(signal => {
      const key = `${signal.symbol}_${signal.type}`;
      const timeWindow = 30 * 60 * 1000; // 30 minutes
      
      if (symbolTimeMap.has(key)) {
        const existingSignal = symbolTimeMap.get(key);
        if (Math.abs(signal.timestamp - existingSignal.timestamp) < timeWindow) {
          duplicates.push({
            symbol: signal.symbol,
            type: signal.type,
            original: existingSignal.id,
            duplicate: signal.id,
            timeDiff: Math.abs(signal.timestamp - existingSignal.timestamp) / 1000 / 60 // minutes
          });
        }
      }
      symbolTimeMap.set(key, signal);
    });
    
    return duplicates;
  }

  /**
   * 🔍 Find if signal is duplicate of another
   */
  findDuplicateSignal(signal, allSignals) {
    const timeWindow = 30 * 60 * 1000; // 30 minutes
    
    for (let other of allSignals) {
      if (other.id !== signal.id && 
          other.symbol === signal.symbol && 
          other.type === signal.type &&
          Math.abs(signal.timestamp - other.timestamp) < timeWindow &&
          other.timestamp < signal.timestamp) {
        return other.id;
      }
    }
    return null;
  }

  /**
   * 💰 Calculate theoretical P&L if signal was executed
   */
  calculateTheoreticalPnL(signal) {
    if (!signal.currentPrice || !signal.entryPrice) return 0;
    
    const priceChange = signal.currentPrice - signal.entryPrice;
    const direction = signal.type === 'LONG' ? 1 : -1;
    const pnlPercent = (priceChange * direction) / signal.entryPrice * 100;
    const positionValue = signal.positionSize || 130; // Default position size
    
    return (pnlPercent / 100) * positionValue;
  }

  /**
   * 📈 Calculate theoretical performance
   */
  calculateTheoreticalPerformance(signals) {
    const validSignals = signals.filter(s => s.currentPrice && s.entryPrice);
    
    if (validSignals.length === 0) {
      return { totalPnL: 0, winRate: 0, bestTrade: 0, worstTrade: 0, avgTrade: 0 };
    }
    
    const theoreticalTrades = validSignals.map(signal => {
      const pnl = this.calculateTheoreticalPnL(signal);
      return {
        symbol: signal.symbol,
        type: signal.type,
        pnl,
        confidence: signal.confidence,
        timestamp: signal.timestamp
      };
    });
    
    const totalPnL = theoreticalTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const winningTrades = theoreticalTrades.filter(t => t.pnl > 0);
    const winRate = theoreticalTrades.length > 0 ? (winningTrades.length / theoreticalTrades.length) * 100 : 0;
    const bestTrade = Math.max(...theoreticalTrades.map(t => t.pnl));
    const worstTrade = Math.min(...theoreticalTrades.map(t => t.pnl));
    const avgTrade = totalPnL / theoreticalTrades.length;
    
    return {
      totalPnL,
      winRate,
      bestTrade,
      worstTrade,
      avgTrade,
      totalTrades: theoreticalTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: theoreticalTrades.length - winningTrades.length
    };
  }

  /**
   * ⏰ Analyze signal timing issues
   */
  analyzeSignalTiming(signals) {
    const issues = [];
    const symbolGroups = {};
    
    // Group signals by symbol
    signals.forEach(signal => {
      if (!symbolGroups[signal.symbol]) {
        symbolGroups[signal.symbol] = [];
      }
      symbolGroups[signal.symbol].push(signal);
    });
    
    // Find timing issues
    Object.entries(symbolGroups).forEach(([symbol, symbolSignals]) => {
      if (symbolSignals.length > 1) {
        symbolSignals.sort((a, b) => a.timestamp - b.timestamp);
        
        for (let i = 1; i < symbolSignals.length; i++) {
          const timeDiff = symbolSignals[i].timestamp - symbolSignals[i-1].timestamp;
          const minutesDiff = timeDiff / (1000 * 60);
          
          if (minutesDiff < 30) { // Less than 30 minutes apart
            issues.push({
              symbol,
              type: 'RAPID_SIGNALS',
              signal1: symbolSignals[i-1].id,
              signal2: symbolSignals[i].id,
              minutesApart: minutesDiff.toFixed(1)
            });
          }
        }
      }
    });
    
    return issues;
  }

  /**
   * 💡 Generate execution recommendations
   */
  generateExecutionRecommendations(executionRate, duplicates, theoreticalPerformance) {
    const recommendations = [];
    
    if (executionRate === 0) {
      recommendations.push({
        priority: 'CRITICAL',
        issue: 'NO_EXECUTION',
        message: 'All signals are notifications only - no trades executed',
        action: 'Enable trade execution in tradeExecutor module'
      });
    } else if (executionRate < 20) {
      recommendations.push({
        priority: 'HIGH',
        issue: 'LOW_EXECUTION',
        message: `Only ${executionRate.toFixed(1)}% of signals executed`,
        action: 'Check trade execution logic and capital availability'
      });
    }
    
    if (duplicates.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        issue: 'DUPLICATE_SIGNALS',
        message: `${duplicates.length} duplicate signals detected`,
        action: 'Improve signal deduplication system'
      });
    }
    
    if (theoreticalPerformance.totalPnL > 0) {
      recommendations.push({
        priority: 'INFO',
        issue: 'MISSED_OPPORTUNITY',
        message: `Theoretical profit: $${theoreticalPerformance.totalPnL.toFixed(2)}`,
        action: 'Enable execution to capture profitable signals'
      });
    }
    
    return recommendations;
  }
}

/**
 * 🚀 ProTradeAI Dashboard Server (Live/Mock Data Mode)
 * 
 * Enhanced server with live data integration and mock data fallback
 * Automatically detects and connects to running ProTradeAI bot instances */

// ============================================================================
// 🎯 REAL-TIME SIGNAL TRACKER CLASS  
// ============================================================================

class RealTimeSignalTracker {
  constructor(dependencies) {
    this.telegramBot = dependencies.telegramBot;
    this.tradeExecutor = dependencies.tradeExecutor;
    this.marketFetcher = dependencies.marketFetcher;
    this.signalEngine = dependencies.signalEngine;
    
    this.activeSignalUpdates = new Map(); // Track signals needing updates
    this.updateInterval = null;
    this.lastUpdateTimes = new Map();
    this.isLiveMode = !!(dependencies.telegramBot && dependencies.tradeExecutor);
  }

  /**
   * 🚀 Start real-time tracking for a signal
   */
  async startTracking(signal) {
    const trackingData = {
      signal,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      updateCount: 0,
      position: null,
      priceHistory: [],
      statusHistory: ['SIGNAL_SENT']
    };

    this.activeSignalUpdates.set(signal.id, trackingData);
    
    // Send initial confirmation (only if live mode)
    if (this.isLiveMode) {
      await this.sendSignalUpdate(signal.id, 'TRACKING_STARTED');
    }
    
    // Start periodic updates if not already running
    if (!this.updateInterval) {
      this.startUpdateLoop();
    }
  }

  /**
   * 🔄 Main update loop - runs every 30 seconds
   */
  startUpdateLoop() {
    this.updateInterval = setInterval(async () => {
      const promises = Array.from(this.activeSignalUpdates.keys()).map(signalId => 
        this.updateSignalStatus(signalId)
      );
      
      await Promise.allSettled(promises);
    }, 30000); // 30 second intervals
  }

  /**
   * 📊 Update individual signal status
   */
  async updateSignalStatus(signalId) {
    try {
      const tracking = this.activeSignalUpdates.get(signalId);
      if (!tracking) return;

      const { signal } = tracking;
      const now = Date.now();
      const elapsed = now - tracking.startTime;
      
      // Get current market data (live if available, mock otherwise)
      const currentPrice = this.isLiveMode ? 
        await this.getLiveCurrentPrice(signal.symbol, signal.entryPrice) :
        this.getMockCurrentPrice(signal.symbol, signal.entryPrice);
        
      tracking.priceHistory.push({ price: currentPrice, timestamp: now });
      
      // Keep only last 20 price points
      if (tracking.priceHistory.length > 20) {
        tracking.priceHistory = tracking.priceHistory.slice(-20);
      }

      // Check if position exists (live if available, mock otherwise)
      const position = this.isLiveMode ?
        await this.getLivePosition(signal) :
        this.getMockPosition(signal);
      tracking.position = position;

      // Calculate metrics
      const metrics = this.calculateSignalMetrics(tracking, currentPrice);
      
      // Determine if update is needed
      const shouldUpdate = this.shouldSendUpdate(tracking, metrics, elapsed);
      
      if (shouldUpdate && this.isLiveMode) {
        await this.sendSignalUpdate(signalId, 'POSITION_UPDATE', metrics);
        tracking.lastUpdate = now;
        tracking.updateCount++;
      }

      // Check for completion conditions
      if (this.isSignalComplete(tracking, metrics, elapsed)) {
        await this.completeSignalTracking(signalId, metrics);
      }

    } catch (error) {
      console.error(`❌ Error updating signal ${signalId}:`, error.message);
    }
  }

  /**
   * 🎲 Get mock current price for dashboard demo
   */
  getMockCurrentPrice(symbol, entryPrice) {
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    return entryPrice * (1 + variation);
  }

  /**
   * 🎲 Get mock position for dashboard demo
   */
  getMockPosition(signal) {
    return {
      symbol: signal.symbol,
      side: signal.type,
      amount: signal.positionSize,
      entryPrice: signal.entryPrice,
      status: 'OPEN'
    };
  }

  /**
   * 💰 Get live current price from market fetcher
   */
  async getLiveCurrentPrice(symbol, fallbackPrice) {
    try {
      if (this.marketFetcher && typeof this.marketFetcher.getCurrentPrice === 'function') {
        return await this.marketFetcher.getCurrentPrice(symbol);
      }
      // Fallback to mock if market fetcher not available
      return this.getMockCurrentPrice(symbol, fallbackPrice);
    } catch (error) {
      console.warn(`⚠️ Failed to get live price for ${symbol}, using mock:`, error.message);
      return this.getMockCurrentPrice(symbol, fallbackPrice);
    }
  }

  /**
   * 🏦 Get live position from trade executor
   */
  async getLivePosition(signal) {
    try {
      if (this.tradeExecutor && this.tradeExecutor.positions) {
        const position = this.tradeExecutor.positions.get(signal.symbol);
        if (position) {
          return {
            symbol: position.symbol,
            side: position.side,
            amount: position.amount,
            entryPrice: position.entryPrice,
            status: position.status || 'OPEN'
          };
        }
      }
      // Return null if no position found
      return null;
    } catch (error) {
      console.warn(`⚠️ Failed to get live position for ${signal.symbol}:`, error.message);
      return this.getMockPosition(signal);
    }
  }

  /**
   * 📈 Calculate signal metrics
   */
  calculateSignalMetrics(tracking, currentPrice) {
    const { signal, position, priceHistory } = tracking;
    
    // Basic price movement
    const entryPrice = signal.entryPrice;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = (priceChange / entryPrice) * 100;
    
    // Unrealized P&L calculation
    let unrealizedPnL = 0;
    let unrealizedPnLPercent = 0;
    
    if (position) {
      const positionValue = position.amount;
      if (signal.type === 'LONG') {
        unrealizedPnL = (currentPrice - position.entryPrice) / position.entryPrice * positionValue;
      } else if (signal.type === 'SHORT') {
        unrealizedPnL = (position.entryPrice - currentPrice) / position.entryPrice * positionValue;
      }
      unrealizedPnLPercent = (unrealizedPnL / positionValue) * 100;
    }

    // Time analysis
    const elapsed = Date.now() - tracking.startTime;
    const elapsedMinutes = Math.floor(elapsed / (60 * 1000));
    
    // Volatility calculation
    const volatility = this.calculateRecentVolatility(priceHistory);
    
    // Distance to targets (fallback for missing values)
    const stopLoss = signal.stopLoss || entryPrice * (signal.type === 'LONG' ? 0.95 : 1.05);
    const stopLossDistance = signal.type === 'LONG' ? 
      ((currentPrice - stopLoss) / stopLoss * 100) :
      ((stopLoss - currentPrice) / stopLoss * 100);
      
    const takeProfitDistance = signal.takeProfit ? (
      signal.type === 'LONG' ?
        ((signal.takeProfit - currentPrice) / currentPrice * 100) :
        ((currentPrice - signal.takeProfit) / currentPrice * 100)
    ) : null;

    // Signal strength assessment
    const signalStrength = this.assessCurrentSignalStrength(tracking, currentPrice);
    
    return {
      currentPrice,
      priceChange,
      priceChangePercent,
      unrealizedPnL,
      unrealizedPnLPercent,
      elapsedMinutes,
      volatility,
      stopLossDistance,
      takeProfitDistance,
      signalStrength,
      hasPosition: !!position,
      positionStatus: position?.status || 'NO_POSITION'
    };
  }

  /**
   * 🎯 Assess current signal strength
   */
  assessCurrentSignalStrength(tracking, currentPrice) {
    const { signal } = tracking;
    
    // Simple momentum-based assessment
    const recentPrices = tracking.priceHistory.slice(-6); // Last 3 minutes
    if (recentPrices.length < 3) return 'ANALYZING';
    
    const trend = recentPrices[recentPrices.length - 1].price - recentPrices[0].price;
    const expectedDirection = signal.type === 'LONG' ? 1 : -1;
    
    if (trend * expectedDirection > 0) {
      return Math.abs(trend / recentPrices[0].price * 100) > 0.5 ? 'STRENGTHENING' : 'STABLE';
    } else {
      return Math.abs(trend / recentPrices[0].price * 100) > 0.5 ? 'WEAKENING' : 'STABLE';
    }
  }

  /**
   * 📊 Calculate recent volatility
   */
  calculateRecentVolatility(priceHistory) {
    if (priceHistory.length < 5) return 'LOW';
    
    const recent = priceHistory.slice(-10);
    const returns = [];
    
    for (let i = 1; i < recent.length; i++) {
      returns.push((recent[i].price - recent[i-1].price) / recent[i-1].price);
    }
    
    const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;
    
    if (volatility > 2) return 'HIGH';
    if (volatility > 0.8) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * ⚡ Determine if update should be sent
   */
  shouldSendUpdate(tracking, metrics, elapsed) {
    const timeSinceLastUpdate = Date.now() - tracking.lastUpdate;
    
    // Always update every 15 minutes
    if (timeSinceLastUpdate > 15 * 60 * 1000) return true;
    
    // Update on significant price movements
    if (Math.abs(metrics.priceChangePercent) > 2) return true;
    
    // Update on P&L milestones
    if (metrics.hasPosition && Math.abs(metrics.unrealizedPnLPercent) > 3) return true;
    
    // Update on signal strength changes
    if (metrics.signalStrength === 'STRENGTHENING' || metrics.signalStrength === 'WEAKENING') {
      // Only if we haven't updated recently for this reason
      return timeSinceLastUpdate > 5 * 60 * 1000; // 5 minutes
    }
    
    // Update when approaching targets
    if (metrics.stopLossDistance < 1 || (metrics.takeProfitDistance && metrics.takeProfitDistance < 1)) {
      return timeSinceLastUpdate > 2 * 60 * 1000; // 2 minutes when near targets
    }
    
    return false;
  }

  /**
   * 📱 Send signal update via Telegram (mock for dashboard)
   */
  async sendSignalUpdate(signalId, updateType, metrics = null) {
    const tracking = this.activeSignalUpdates.get(signalId);
    if (!tracking) return;

    const { signal } = tracking;
    let message = '';

    switch (updateType) {
      case 'TRACKING_STARTED':
        message = this.formatTrackingStartedMessage(signal);
        break;
      case 'POSITION_UPDATE':
        message = this.formatPositionUpdateMessage(signal, metrics, tracking);
        break;
      case 'SIGNAL_COMPLETED':
        message = this.formatCompletionMessage(signal, metrics, tracking);
        break;
    }

    if (message) {
      console.log(`📱 Telegram Update: ${updateType} for ${signal.symbol}`);
      console.log(message);
    }
  }

  /**
   * 📝 Format tracking started message
   */
  formatTrackingStartedMessage(signal) {
    return `🎯 <b>Signal Tracking Started</b>

📊 <b>${signal.symbol} ${signal.type}</b>
💰 Entry: <b>$${signal.entryPrice.toFixed(4)}</b>
📈 Confidence: <b>${signal.finalConfidence}%</b>

🔔 You'll receive updates every 15-30 minutes with:
• Real-time P&L
• Price movement analysis  
• Signal strength changes
• Target proximity alerts

⏱️ <i>Tracking active...</i>`;
  }

  /**
   * 📊 Format position update message
   */
  formatPositionUpdateMessage(signal, metrics, tracking) {
    const direction = signal.type === 'LONG' ? '📈' : '📉';
    const pnlEmoji = metrics.unrealizedPnL >= 0 ? '💚' : '❤️';
    const strengthEmoji = {
      'STRENGTHENING': '🚀',
      'STABLE': '➡️',
      'WEAKENING': '⚠️',
      'ANALYZING': '🔍'
    }[metrics.signalStrength] || '📊';

    const timeRemaining = this.estimateTimeRemaining(signal, metrics);

    let message = `${direction} <b>${signal.symbol} Update</b> ${pnlEmoji}\n\n`;
    
    message += `💰 <b>Current Price:</b> $${metrics.currentPrice.toFixed(4)}\n`;
    message += `📊 <b>Price Change:</b> ${metrics.priceChangePercent >= 0 ? '+' : ''}${metrics.priceChangePercent.toFixed(2)}%\n\n`;
    
    if (metrics.hasPosition) {
      message += `🏦 <b>Position P&L:</b> ${metrics.unrealizedPnL >= 0 ? '+' : ''}$${metrics.unrealizedPnL.toFixed(2)} (${metrics.unrealizedPnLPercent >= 0 ? '+' : ''}${metrics.unrealizedPnLPercent.toFixed(2)}%)\n`;
    }
    
    message += `${strengthEmoji} <b>Signal:</b> ${metrics.signalStrength}\n`;
    message += `⏱️ <b>Elapsed:</b> ${metrics.elapsedMinutes} min\n`;
    message += `🌊 <b>Volatility:</b> ${metrics.volatility}\n\n`;
    
    // Target proximity
    message += `🎯 <b>Targets:</b>\n`;
    message += `• Stop Loss: ${metrics.stopLossDistance.toFixed(1)}% away\n`;
    if (metrics.takeProfitDistance) {
      message += `• Take Profit: ${metrics.takeProfitDistance.toFixed(1)}% away\n`;
    }
    
    if (timeRemaining) {
      message += `\n⏳ <b>Est. Time:</b> ${timeRemaining}\n`;
    }
    
    // Recommendation
    const recommendation = this.generateRecommendation(signal, metrics);
    message += `\n💡 <b>Action:</b> ${recommendation}`;
    
    return message;
  }

  /**
   * ⏰ Estimate time remaining
   */
  estimateTimeRemaining(signal, metrics) {
    // Simple estimation based on volatility and distance to targets
    if (!metrics.takeProfitDistance) return null;
    
    const avgDistance = (Math.abs(metrics.stopLossDistance) + metrics.takeProfitDistance) / 2;
    
    if (avgDistance < 2) return "10-30 min";
    if (avgDistance < 5) return "30-90 min";
    return "1-3 hours";
  }

  /**
   * 💡 Generate recommendation
   */
  generateRecommendation(signal, metrics) {
    if (metrics.signalStrength === 'STRENGTHENING') {
      return `Hold - ${signal.type.toLowerCase()} signal strengthening ✅`;
    }
    
    if (metrics.signalStrength === 'WEAKENING') {
      return `Monitor closely - signal weakening ⚠️`;
    }
    
    if (metrics.hasPosition && metrics.unrealizedPnLPercent > 3) {
      return `Consider partial profit taking 💰`;
    }
    
    if (metrics.stopLossDistance < 1) {
      return `Near stop loss - stay alert 🚨`;
    }
    
    return `Hold position - tracking continues 📊`;
  }

  /**
   * ✅ Check if signal is complete
   */
  isSignalComplete(tracking, metrics, elapsed) {
    // Position closed
    if (tracking.position && tracking.position.status === 'CLOSED') return true;
    
    // Signal expired (4 hours max)
    if (elapsed > 4 * 60 * 60 * 1000) return true;
    
    // Stop loss or take profit hit
    if (metrics.stopLossDistance < 0.1 || (metrics.takeProfitDistance && metrics.takeProfitDistance < 0.1)) {
      return true;
    }
    
    return false;
  }

  /**
   * 🏁 Complete signal tracking
   */
  async completeSignalTracking(signalId, metrics) {
    await this.sendSignalUpdate(signalId, 'SIGNAL_COMPLETED', metrics);
    this.activeSignalUpdates.delete(signalId);
    
    // Stop update loop if no more active signals
    if (this.activeSignalUpdates.size === 0 && this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 📝 Format completion message
   */
  formatCompletionMessage(signal, metrics, tracking) {
    const outcome = this.determineOutcome(tracking, metrics);
    const outcomeEmoji = outcome.status === 'WIN' ? '🎉' : outcome.status === 'LOSS' ? '😔' : '🔚';
    
    let message = `${outcomeEmoji} <b>${signal.symbol} Signal Complete</b>\n\n`;
    
    message += `📊 <b>Final Result:</b> ${outcome.status}\n`;
    message += `💰 <b>Final P&L:</b> ${outcome.pnl >= 0 ? '+' : ''}$${outcome.pnl.toFixed(2)} (${outcome.pnlPercent >= 0 ? '+' : ''}${outcome.pnlPercent.toFixed(2)}%)\n`;
    message += `⏱️ <b>Duration:</b> ${Math.floor((Date.now() - tracking.startTime) / (60 * 1000))} minutes\n`;
    message += `🔔 <b>Updates Sent:</b> ${tracking.updateCount}\n\n`;
    
    message += `📈 <b>Summary:</b>\n`;
    message += `• Entry: $${signal.entryPrice.toFixed(4)}\n`;
    message += `• Exit: $${metrics.currentPrice.toFixed(4)}\n`;
    message += `• Max Gain: $${outcome.maxGain.toFixed(2)}\n`;
    message += `• Max Loss: $${outcome.maxLoss.toFixed(2)}\n\n`;
    
    message += `✅ Signal tracking complete`;
    
    return message;
  }

  /**
   * 🎯 Determine final outcome
   */
  determineOutcome(tracking, metrics) {
    if (metrics.unrealizedPnL > 0) {
      return {
        status: 'WIN',
        pnl: metrics.unrealizedPnL,
        pnlPercent: metrics.unrealizedPnLPercent,
        maxGain: Math.max(...tracking.priceHistory.map(p => 
          tracking.signal.type === 'LONG' ? p.price - tracking.signal.entryPrice : tracking.signal.entryPrice - p.price
        )),
        maxLoss: Math.min(...tracking.priceHistory.map(p => 
          tracking.signal.type === 'LONG' ? p.price - tracking.signal.entryPrice : tracking.signal.entryPrice - p.price
        ))
      };
    } else if (metrics.unrealizedPnL < 0) {
      return {
        status: 'LOSS',
        pnl: metrics.unrealizedPnL,
        pnlPercent: metrics.unrealizedPnLPercent,
        maxGain: 0,
        maxLoss: metrics.unrealizedPnL
      };
    } else {
      return {
        status: 'BREAKEVEN',
        pnl: 0,
        pnlPercent: 0,
        maxGain: 0,
        maxLoss: 0
      };
    }
  }

  /**
   * 🧹 Cleanup
   */
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.activeSignalUpdates.clear();
  }
}

const app = express();
const PORT = config.api.port || 3000;

// Initialize Live Data Integration
const liveDataIntegration = new LiveDataIntegration();

// Initialize Real-Time Signal Tracker with mock dependencies (will be replaced if live bot connects)
let mockDependencies = {
  telegramBot: null, // Will be null for mock mode
  tradeExecutor: null,
  marketFetcher: null,
  signalEngine: null
};

let signalTracker = new RealTimeSignalTracker(mockDependencies);

// ============================================================================
// 🔌 BOT CONNECTION HANDLER
// ============================================================================

/**
 * Connect dashboard to live bot instance
 */
function connectLiveBot(botInstance) {
  console.log('� Connecting dashboard to live bot...');
  
  // Connect live data integration
  liveDataIntegration.connectToBot(botInstance);
  
  // Update signal tracker with live dependencies
  const liveDependencies = {
    telegramBot: botInstance.modules.telegramBot,
    tradeExecutor: botInstance.modules.tradeExecutor,
    marketFetcher: botInstance.modules.marketFetcher,
    signalEngine: botInstance.modules.signalEngine
  };
  
  // Cleanup old tracker and create new one with live dependencies
  if (signalTracker) {
    signalTracker.cleanup();
  }
  signalTracker = new RealTimeSignalTracker(liveDependencies);
  
  console.log('✅ Dashboard connected to live bot successfully');
}

// Export connection function for use by main bot
module.exports.connectLiveBot = connectLiveBot;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock data generator (fallback only)
function generateMockData() {
  console.log('⚠️ Using fallback mock data - no live data available');
  return liveDataIntegration.generateMockData();
}

// ============================================================================
// 🎯 DASHBOARD ROUTES
// ============================================================================

// Serve dashboard HTML
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve enhanced dashboard with React components
app.get('/enhanced', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'enhanced-dashboard.html'));
});

// Default route redirects to enhanced dashboard
app.get('/', (req, res) => {
  res.redirect('/enhanced');
});

// Live dashboard data endpoint
app.get('/api/dashboard/live', async (req, res) => {
  try {
    const liveData = await liveDataIntegration.getLiveData();
    
    // Add real-time tracking info
    liveData.signalTracking = {
      activeSignals: signalTracker.activeSignalUpdates.size,
      trackedSignals: Array.from(signalTracker.activeSignalUpdates.entries()).map(([id, tracking]) => ({
        signalId: id,
        symbol: tracking.signal.symbol,
        type: tracking.signal.type,
        elapsed: Date.now() - tracking.startTime,
        updateCount: tracking.updateCount,
        status: tracking.position?.status || 'TRACKING'
      })),
      isLiveMode: signalTracker.isLiveMode
    };
    
    res.json({ success: true, data: liveData });
  } catch (error) {
    console.error('API Error - dashboard live data:', error.message);
    res.status(500).json({ error: 'Failed to get live data' });
  }
});

// Start tracking a signal (for demo purposes)
app.post('/api/signals/track', async (req, res) => {
  try {
    const mockSignal = {
      id: `DEMO_${Date.now()}`,
      symbol: req.body.symbol || 'BTC',
      type: req.body.type || 'LONG',
      entryPrice: req.body.entryPrice || 43000,
      stopLoss: req.body.stopLoss || 42000,
      takeProfit: req.body.takeProfit || 45000,
      finalConfidence: req.body.confidence || 75,
      positionSize: req.body.positionSize || 100,
      timestamp: Date.now()
    };

    await signalTracker.startTracking(mockSignal);
    
    res.json({ 
      success: true, 
      message: 'Signal tracking started',
      signalId: mockSignal.id 
    });
  } catch (error) {
    console.error('API Error - start tracking:', error.message);
    res.status(500).json({ error: 'Failed to start tracking' });
  }
});

// Get signal tracking status
app.get('/api/signals/tracking', (req, res) => {
  try {
    const activeSignals = Array.from(signalTracker.activeSignalUpdates.entries()).map(([id, tracking]) => {
      const elapsed = Date.now() - tracking.startTime;
      return {
        signalId: id,
        symbol: tracking.signal.symbol,
        type: tracking.signal.type,
        entryPrice: tracking.signal.entryPrice,
        confidence: tracking.signal.finalConfidence,
        elapsed: Math.floor(elapsed / (60 * 1000)), // minutes
        updateCount: tracking.updateCount,
        priceHistoryLength: tracking.priceHistory.length,
        hasPosition: !!tracking.position
      };
    });

    res.json({ 
      success: true, 
      data: {
        activeCount: signalTracker.activeSignalUpdates.size,
        signals: activeSignals
      }
    });
  } catch (error) {
    console.error('API Error - tracking status:', error.message);
    res.status(500).json({ error: 'Failed to get tracking status' });
  }
});

// ============================================================================
// 🛡️ ADMIN ROUTES (Emergency Stop, etc.)
// ============================================================================

app.post('/api/admin/emergency-stop', (req, res) => {
  console.log('🛑 Emergency stop requested!');
  res.json({ success: true, message: 'Emergency stop activated (mock mode)' });
});

app.get('/api/admin/status', (req, res) => {
  res.json({
    success: true,
    mode: 'MOCK_DASHBOARD',
    message: 'Running dashboard with mock data for demonstration',
    timestamp: Date.now()
  });
});

// ============================================================================
// 🚀 START SERVER (Only when run directly)
// ============================================================================

// Function to start the dashboard server
function startDashboardServer() {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🎯 PROTRADE AI DASHBOARD SERVER 🎯              ║
║                                                              ║
║            📊 ENHANCED REACT + REAL-TIME TRACKING           ║
║                                                              ║
║  � Enhanced: http://localhost:${PORT}/enhanced               ║
║  �🌐 Dashboard: http://localhost:${PORT}/dashboard             ║
║  🔌 Live API: http://localhost:${PORT}/api/dashboard/live     ║
║  📡 Tracking API: http://localhost:${PORT}/api/signals/tracking ║
║                                                              ║
║  🎮 Features:                                               ║
║  • React-based real-time signal dashboard                  ║
║  • Tabbed interface (Overview/Signals/Positions)           ║
║  • Position updates every 30s                              ║
║  • P&L monitoring                                          ║
║  • Signal strength analysis                                ║
║  • Telegram-style notifications                            ║
║                                                              ║
║  🚀 Demo: POST /api/signals/track to start tracking        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

✅ Server running on port ${PORT}
� Visit: http://localhost:${PORT}/enhanced (NEW Enhanced Dashboard)
🎯 Also: http://localhost:${PORT}/dashboard (Original)
🔄 Real-time tracking system initialized
📊 Mock data updates with live signal tracking

💡 Test tracking with:
curl -X POST http://localhost:${PORT}/api/signals/track \\
  -H "Content-Type: application/json" \\
  -d '{"symbol":"BTC","type":"LONG","entryPrice":43000,"confidence":78}'
`);
  });
}

// Export the start function
module.exports.startDashboardServer = startDashboardServer;

// Only start the server if this file is run directly (not imported)
if (require.main === module) {
  startDashboardServer();
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down dashboard server...');
  signalTracker.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down dashboard server...');
  signalTracker.cleanup();
  process.exit(0);
});

/**
 * 📡 Real-Time Signal Tracker - Enhanced Position Updates
 * Integrates with existing ProTradeAI architecture
 */

// ============================================================================
// 🎲 MOCK DATA GENERATION
// ============================================================================

// Execution analysis endpoint
app.get('/api/dashboard/execution-analysis', async (req, res) => {
  try {
    const signals = await liveDataIntegration.readJSONFile(
      path.join(__dirname, 'data', 'signals.json'), []
    );
    const trades = await liveDataIntegration.readJSONFile(
      path.join(__dirname, 'data', 'trades.json'), []
    );
    
    const analysis = liveDataIntegration.analyzeExecutionRate(signals, trades);
    
    // Add detailed insights
    const insights = {
      criticalIssues: analysis.recommendations.filter(r => r.priority === 'CRITICAL'),
      opportunities: analysis.theoreticalPerformance,
      duplicateAnalysis: {
        total: analysis.duplicates,
        symbols: analysis.duplicateSymbols,
        impact: analysis.duplicates > 0 ? 'Signal quality degraded by duplicates' : 'No duplicates detected'
      },
      executionHealth: {
        status: analysis.executionRate === 0 ? 'CRITICAL' : 
                analysis.executionRate < 20 ? 'POOR' : 
                analysis.executionRate < 60 ? 'FAIR' : 'GOOD',
        message: analysis.executionRate === 0 ? 
          'No trades executed - signals only mode' :
          `${analysis.executionRate.toFixed(1)}% execution rate`
      }
    };
    
    res.json({ 
      success: true, 
      data: {
        ...analysis,
        insights,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('API Error - execution analysis:', error.message);
    res.status(500).json({ error: 'Failed to analyze execution' });
  }
});

// Performance insights endpoint
app.get('/api/dashboard/insights', async (req, res) => {
  try {
    const liveData = await liveDataIntegration.getLiveData();
    
    const insights = {
      execution: {
        critical: liveData.executionAnalysis?.recommendations.filter(r => r.priority === 'CRITICAL') || [],
        rate: liveData.executionAnalysis?.executionRate || 0,
        status: liveData.executionAnalysis?.executionRate === 0 ? 'SIGNALS_ONLY' : 'EXECUTING'
      },
      performance: {
        theoretical: liveData.executionAnalysis?.theoreticalPerformance || {},
        actual: liveData.performance || {},
        gap: (liveData.executionAnalysis?.theoreticalPerformance?.totalPnL || 0) - (liveData.performance?.totalProfit || 0)
      },
      signals: {
        total: liveData.signals?.length || 0,
        duplicates: liveData.executionAnalysis?.duplicates || 0,
        avgConfidence: liveData.signals?.length > 0 ? 
          liveData.signals.reduce((sum, s) => sum + (s.confidence || 0), 0) / liveData.signals.length : 0
      },
      recommendations: liveData.executionAnalysis?.recommendations || []
    };
    
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error('API Error - insights:', error.message);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

// Signal deduplication analysis
app.get('/api/dashboard/duplicates', async (req, res) => {
  try {
    const signals = await liveDataIntegration.readJSONFile(
      path.join(__dirname, 'data', 'signals.json'), []
    );
    
    const duplicates = liveDataIntegration.findDuplicateSignals(signals);
    const timingIssues = liveDataIntegration.analyzeSignalTiming(signals);
    
    // Group by symbol for analysis
    const symbolAnalysis = {};
    signals.forEach(signal => {
      if (!symbolAnalysis[signal.symbol]) {
        symbolAnalysis[signal.symbol] = {
          total: 0,
          duplicates: 0,
          avgTimeBetween: 0,
          signals: []
        };
      }
      symbolAnalysis[signal.symbol].total++;
      symbolAnalysis[signal.symbol].signals.push({
        id: signal.id,
        timestamp: signal.timestamp,
        type: signal.type,
        confidence: signal.confidence
      });
    });
    
    // Calculate time between signals for each symbol
    Object.values(symbolAnalysis).forEach(analysis => {
      if (analysis.signals.length > 1) {
        analysis.signals.sort((a, b) => a.timestamp - b.timestamp);
        const timeDiffs = [];
        for (let i = 1; i < analysis.signals.length; i++) {
          timeDiffs.push(analysis.signals[i].timestamp - analysis.signals[i-1].timestamp);
        }
        analysis.avgTimeBetween = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length / (1000 * 60); // minutes
      }
    });
    
    res.json({ 
      success: true, 
      data: {
        duplicates,
        timingIssues,
        symbolAnalysis,
        summary: {
          totalSignals: signals.length,
          duplicateCount: duplicates.length,
          duplicateRate: signals.length > 0 ? (duplicates.length / signals.length) * 100 : 0,
          mostDuplicatedSymbol: Object.entries(symbolAnalysis)
            .filter(([_, data]) => data.total > 1)
            .sort((a, b) => b[1].total - a[1].total)[0]?.[0] || 'None'
        }
      }
    });
  } catch (error) {
    console.error('API Error - duplicates analysis:', error.message);
    res.status(500).json({ error: 'Failed to analyze duplicates' });
  }
});

// Emergency execution enabler (for fixing the execution issue)
app.post('/api/admin/enable-execution', (req, res) => {
  try {
    console.log('🚨 EXECUTION ENABLER TRIGGERED');
    console.log('⚠️  This is a mock endpoint - actual execution needs to be enabled in tradeExecutor.js');
    console.log('📋 Steps to enable execution:');
    console.log('   1. Check tradeExecutor configuration');
    console.log('   2. Verify exchange API credentials');
    console.log('   3. Enable live trading mode');
    console.log('   4. Restart bot with execution enabled');
    
    res.json({ 
      success: true, 
      message: 'Execution enabler triggered - check console for instructions',
      action: 'mock_only',
      instructions: [
        'Check tradeExecutor.js configuration',
        'Verify exchange API credentials are set',
        'Enable live trading mode in config',
        'Restart bot with execution enabled'
      ]
    });
  } catch (error) {
    console.error('API Error - enable execution:', error.message);
    res.status(500).json({ error: 'Failed to trigger execution enabler' });
  }
});
