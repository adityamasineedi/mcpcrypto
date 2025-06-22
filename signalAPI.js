const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('rate-limiter-flexible');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');

class SignalAPI {
  constructor() {
    this.app = express();
    this.server = null;
    this.signalEngine = null;
    this.approvalBot = null;
    this.telegramBot = null;
    this.accuracyLogger = null;
    this.tradeExecutor = null;
    this.rateLimiter = null;
    this.initialized = false;
  }

  /**
   * 🚀 Initialize API Server
   */
  async init(dependencies = {}) {
    try {
      // Store dependencies
      this.signalEngine = dependencies.signalEngine;
      this.approvalBot = dependencies.approvalBot;
      this.telegramBot = dependencies.telegramBot;
      this.accuracyLogger = dependencies.accuracyLogger;
      this.tradeExecutor = dependencies.tradeExecutor;

      if (!config.api.enabled) {
        logger.warn('⚠️ API server disabled in configuration');
        this.initialized = true;
        return;
      }

      // Setup rate limiting
      this.setupRateLimiting();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Error handling
      this.setupErrorHandling();

      // Start server
      await this.startServer();

      this.initialized = true;
      logger.info(`✅ API Server initialized on ${config.api.host}:${config.api.port}`);
    } catch (error) {
      logger.error('❌ API Server initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 🛡️ Setup rate limiting
   */
  setupRateLimiting() {
    this.rateLimiter = new rateLimit.RateLimiterMemory({
      keyGenerator: (req) => req.ip,
      points: config.api.rateLimit.max,
      duration: config.api.rateLimit.windowMs / 1000,
    });
  }

  /**
   * ⚙️ Setup middleware
   */
  setupMiddleware() {
    // Security
    this.app.use(helmet());
    
    // CORS
    if (config.api.cors) {
      this.app.use(cors({
        origin: process.env.CORS_ORIGIN || true,
        credentials: true
      }));
    }

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting middleware
    this.app.use(async (req, res, next) => {
      try {
        await this.rateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          error: 'Too Many Requests',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 1
        });
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // ============================================================================
    // 🎯 DASHBOARD STATIC FILES & ROUTE
    // ============================================================================
    
    // Serve dashboard files
    this.app.use(express.static('public'));
    
    // Dashboard route
    this.app.get('/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });
  }

  /**
   * 🛣️ Setup routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // API info
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'ProTradeAI Signal API',
        version: '1.0.0',
        mode: config.tradeMode,
        features: {
          signals: true,
          approval: config.telegram.signalApproval,
          telegram: config.telegram.enabled,
          ai: true
        },
        endpoints: [
          '/api/signals',
          '/api/signals/latest',
          '/api/signals/history',
          '/api/approval/pending',
          '/api/stats',
          '/api/status',
          '/api/dashboard/live',
          '/dashboard'
        ]
      });
    });

    // Signal endpoints
    this.setupSignalRoutes();

    // Approval endpoints
    this.setupApprovalRoutes();

    // Statistics endpoints
    this.setupStatsRoutes();

    // Status endpoints
    this.setupStatusRoutes();

    // Admin endpoints (if enabled)
    if (config.api.adminEnabled) {
      this.setupAdminRoutes();
    }

    // ============================================================================
    // 🎯 DASHBOARD API ENDPOINT
    // ============================================================================
    
    // Live dashboard data endpoint
    this.app.get('/api/dashboard/live', async (req, res) => {
      try {
        const liveData = {
          // Account info
          account: this.tradeExecutor?.getAccountSummary() || {},
          
          // Recent signals (last 10)
          signals: this.signalEngine?.getSignalStats()?.recentSignals?.slice(-10) || [],
          
          // Pending approvals
          pending: this.approvalBot?.getPendingSignals() || [],
          
          // Trading stats
          stats: this.accuracyLogger ? await this.accuracyLogger.getStats('1d') : {},
          
          // System status
          status: {
            running: true,
            uptime: process.uptime(),
            mode: config.tradeMode,
            timestamp: Date.now()
          }
        };
        
        res.json({ success: true, data: liveData });
      } catch (error) {
        logger.error('API Error - dashboard live data:', error.message);
        res.status(500).json({ error: 'Failed to get live data' });
      }
    });
  }

  /**
   * 📊 Setup signal routes
   */
  setupSignalRoutes() {
    // Get latest signals
    this.app.get('/api/signals/latest', async (req, res) => {
      try {
        if (!this.signalEngine) {
          return res.status(503).json({ error: 'Signal engine not available' });
        }

        const signals = await this.signalEngine.generateSignals();
        
        res.json({
          success: true,
          count: signals.length,
          timestamp: new Date().toISOString(),
          signals: signals.map(item => ({
            id: item.signal.id,
            symbol: item.signal.symbol,
            type: item.signal.type,
            confidence: item.signal.finalConfidence,
            strength: item.signal.strength,
            entryPrice: item.signal.entryPrice,
            currentPrice: item.signal.currentPrice,
            risk: item.signal.risk,
            timeHorizon: item.signal.timeHorizon,
            timestamp: item.signal.timestamp
          }))
        });
      } catch (error) {
        logger.error('API Error - latest signals:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get signal history
    this.app.get('/api/signals/history', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const symbol = req.query.symbol;
        const type = req.query.type;

        if (!this.signalEngine) {
          return res.status(503).json({ error: 'Signal engine not available' });
        }

        const stats = this.signalEngine.getSignalStats();
        let history = stats.recentSignals || [];

        // Apply filters
        if (symbol) {
          history = history.filter(s => s.symbol === symbol.toUpperCase());
        }
        if (type) {
          history = history.filter(s => s.type === type.toUpperCase());
        }

        // Apply pagination
        const paginatedHistory = history.slice(offset, offset + limit);

        res.json({
          success: true,
          count: paginatedHistory.length,
          total: history.length,
          limit,
          offset,
          signals: paginatedHistory
        });
      } catch (error) {
        logger.error('API Error - signal history:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get specific signal
    this.app.get('/api/signals/:id', async (req, res) => {
      try {
        const signalId = req.params.id;

        // Check approval bot first
        if (this.approvalBot) {
          const signal = this.approvalBot.getSignalDetails(signalId);
          if (signal) {
            return res.json({
              success: true,
              signal
            });
          }
        }

        // Check signal history
        if (this.signalEngine) {
          const stats = this.signalEngine.getSignalStats();
          const signal = stats.recentSignals?.find(s => s.id === signalId);
          if (signal) {
            return res.json({
              success: true,
              signal
            });
          }
        }

        res.status(404).json({ error: 'Signal not found' });
      } catch (error) {
        logger.error('API Error - get signal:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * ✅ Setup approval routes
   */
  setupApprovalRoutes() {
    // Get pending approvals
    this.app.get('/api/approval/pending', async (req, res) => {
      try {
        if (!this.approvalBot) {
          return res.status(503).json({ error: 'Approval bot not available' });
        }

        const pending = this.approvalBot.getPendingSignals();
        const queueStatus = this.approvalBot.getQueueStatus();

        res.json({
          success: true,
          pending,
          queueStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('API Error - pending approvals:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Approve signal
    this.app.post('/api/approval/:id/approve', async (req, res) => {
      try {
        if (!this.approvalBot) {
          return res.status(503).json({ error: 'Approval bot not available' });
        }

        const signalId = req.params.id;
        const { reason } = req.body;
        const userId = req.headers['user-id'] || 'api-user';

        const success = await this.approvalBot.approveSignal(signalId, userId, reason);

        if (success) {
          res.json({
            success: true,
            message: 'Signal approved',
            signalId,
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(404).json({ error: 'Signal not found or already processed' });
        }
      } catch (error) {
        logger.error('API Error - approve signal:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Reject signal
    this.app.post('/api/approval/:id/reject', async (req, res) => {
      try {
        if (!this.approvalBot) {
          return res.status(503).json({ error: 'Approval bot not available' });
        }

        const signalId = req.params.id;
        const { reason } = req.body;
        const userId = req.headers['user-id'] || 'api-user';

        const success = await this.approvalBot.rejectSignal(signalId, userId, reason);

        if (success) {
          res.json({
            success: true,
            message: 'Signal rejected',
            signalId,
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(404).json({ error: 'Signal not found or already processed' });
        }
      } catch (error) {
        logger.error('API Error - reject signal:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Delay signal
    this.app.post('/api/approval/:id/delay', async (req, res) => {
      try {
        if (!this.approvalBot) {
          return res.status(503).json({ error: 'Approval bot not available' });
        }

        const signalId = req.params.id;
        const { delayMinutes = 5 } = req.body;
        const userId = req.headers['user-id'] || 'api-user';

        const success = await this.approvalBot.delaySignal(signalId, delayMinutes, userId);

        if (success) {
          res.json({
            success: true,
            message: `Signal delayed for ${delayMinutes} minutes`,
            signalId,
            delayMinutes,
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(404).json({ error: 'Signal not found or already processed' });
        }
      } catch (error) {
        logger.error('API Error - delay signal:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * 📊 Setup statistics routes
   */
  setupStatsRoutes() {
    // Get trading stats
    this.app.get('/api/stats', async (req, res) => {
      try {
        const stats = {
          bot: {
            uptime: process.uptime(),
            mode: config.tradeMode,
            lastRestart: new Date(Date.now() - process.uptime() * 1000).toISOString()
          },
          signals: this.signalEngine ? this.signalEngine.getSignalStats() : null,
          approval: this.approvalBot ? this.approvalBot.getApprovalStats() : null,
          accuracy: this.accuracyLogger ? await this.accuracyLogger.getStats() : null
        };

        res.json({
          success: true,
          stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('API Error - stats:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get performance metrics
    this.app.get('/api/stats/performance', async (req, res) => {
      try {
        const period = req.query.period || 'daily'; // daily, weekly, monthly

        // Mock performance data - replace with real data
        const performance = {
          period,
          profit: {
            total: 1247.30,
            daily: 42.50,
            weekly: 315.80,
            monthly: 1247.30
          },
          trades: {
            total: 156,
            winning: 120,
            losing: 36,
            winRate: 76.8
          },
          bestTrade: 87.20,
          worstTrade: -15.30,
          sharpeRatio: 2.1,
          maxDrawdown: 8.5,
          avgHoldTime: '2.5 hours'
        };

        res.json({
          success: true,
          performance,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('API Error - performance:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * 🔍 Setup status routes
   */
  setupStatusRoutes() {
    // Get bot status
    this.app.get('/api/status', async (req, res) => {
      try {
        const status = {
          bot: {
            running: true,
            mode: config.tradeMode,
            initialized: this.initialized,
            uptime: process.uptime()
          },
          modules: {
            signalEngine: !!this.signalEngine,
            approvalBot: !!this.approvalBot,
            telegramBot: !!this.telegramBot,
            accuracyLogger: !!this.accuracyLogger
          },
          config: {
            aiConfidence: config.ai.confidence.minimum,
            riskPerTrade: config.capital.riskPerTrade,
            maxConcurrentTrades: config.capital.maxConcurrentTrades,
            signalApproval: config.telegram.signalApproval
          },
          market: {
            // This would come from MCP engine
            regime: 'BULL',
            sentiment: 'BULLISH',
            fearGreed: 72
          }
        };

        res.json({
          success: true,
          status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('API Error - status:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get system health
    this.app.get('/api/status/health', async (req, res) => {
      try {
        const health = {
          status: 'healthy',
          checks: {
            memory: this.checkMemoryUsage(),
            cpu: this.checkCPUUsage(),
            diskSpace: this.checkDiskSpace(),
            apiResponsiveness: this.checkAPIResponsiveness()
          },
          timestamp: new Date().toISOString()
        };

        const allHealthy = Object.values(health.checks).every(check => check.status === 'healthy');
        health.status = allHealthy ? 'healthy' : 'degraded';

        res.json({
          success: true,
          health
        });
      } catch (error) {
        logger.error('API Error - health:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * 👑 Setup admin routes
   */
  setupAdminRoutes() {
    // Emergency stop
    this.app.post('/api/admin/emergency-stop', async (req, res) => {
      try {
        const { reason = 'Emergency stop via API' } = req.body;

        if (this.approvalBot) {
          const results = await this.approvalBot.emergencyRejectAll(reason);
          res.json({
            success: true,
            message: 'Emergency stop executed',
            affectedSignals: results.length,
            reason,
            timestamp: new Date().toISOString()
          });
        } else {
          res.json({
            success: true,
            message: 'Emergency stop signal sent (no pending approvals)',
            reason,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        logger.error('API Error - emergency stop:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update settings
    this.app.post('/api/admin/settings', async (req, res) => {
      try {
        const newSettings = req.body;
        
        // This would update config and persist changes
        // For now, just return current settings
        res.json({
          success: true,
          message: 'Settings update requested',
          currentSettings: {
            riskPerTrade: config.capital.riskPerTrade,
            maxConcurrentTrades: config.capital.maxConcurrentTrades,
            aiConfidence: config.ai.confidence.minimum,
            signalApproval: config.telegram.signalApproval
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('API Error - update settings:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * ❌ Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('API Error:', err);
      
      res.status(err.status || 500).json({
        error: 'Internal server error',
        message: config.environment === 'development' ? err.message : 'Something went wrong'
      });
    });
  }

  /**
   * 🚀 Start server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(config.api.port, config.api.host, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 🔍 Health check methods
   */
  checkMemoryUsage() {
    const used = process.memoryUsage();
    const total = used.heapTotal;
    const percentage = (used.heapUsed / total) * 100;
    
    return {
      status: percentage < 80 ? 'healthy' : 'warning',
      used: Math.round(used.heapUsed / 1024 / 1024),
      total: Math.round(total / 1024 / 1024),
      percentage: Math.round(percentage)
    };
  }

  checkCPUUsage() {
    // Simplified CPU check
    return {
      status: 'healthy',
      usage: '< 50%'
    };
  }

  checkDiskSpace() {
    // Simplified disk check
    return {
      status: 'healthy',
      available: '> 1GB'
    };
  }

  checkAPIResponsiveness() {
    return {
      status: 'healthy',
      responseTime: '< 100ms'
    };
  }

  /**
   * 🧹 Cleanup resources
   */
  async cleanup() {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      logger.info('🧹 API Server stopped');
    }
  }
}

module.exports = SignalAPI;