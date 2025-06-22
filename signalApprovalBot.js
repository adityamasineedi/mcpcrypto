const EventEmitter = require('events');
const config = require('./config');
const logger = require('./utils/logger');

class SignalApprovalBot extends EventEmitter {
  constructor() {
    super();
    this.pendingSignals = new Map();
    this.approvalTimeouts = new Map();
    this.userResponses = new Map();
    this.initialized = false;
  }

  /**
   * 🚀 Initialize Signal Approval Bot
   */
  async init() {
    try {
      this.initialized = true;
      logger.info('✅ Signal Approval Bot initialized');
      
      if (config.telegram.signalApproval) {
        logger.info('📝 Manual signal approval is ENABLED');
      } else {
        logger.info('🤖 Auto-approval is ENABLED (manual approval disabled)');
      }
    } catch (error) {
      logger.error('❌ Signal Approval Bot initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 📋 Request signal approval
   */
  async requestApproval(signal) {
    return new Promise((resolve) => {
      // If manual approval is disabled, auto-approve
      if (!config.telegram.signalApproval) {
        logger.info(`🤖 Auto-approving signal: ${signal.symbol} ${signal.type}`);
        resolve({
          approved: true,
          timestamp: Date.now(),
          method: 'auto',
          reason: 'Manual approval disabled'
        });
        return;
      }

      // Store pending signal
      this.pendingSignals.set(signal.id, {
        signal,
        resolve,
        timestamp: Date.now(),
        attempts: 0
      });

      // Set timeout for approval
      const timeout = setTimeout(() => {
        this.handleApprovalTimeout(signal.id);
      }, config.telegram.approvalTimeout);

      this.approvalTimeouts.set(signal.id, timeout);

      // Emit event for external handlers (like Telegram bot)
      this.emit('approvalRequested', signal);

      logger.info(`📝 Approval requested for ${signal.symbol} ${signal.type} (timeout: ${config.telegram.approvalTimeout / 1000}s)`);
    });
  }

  /**
   * ✅ Approve signal
   */
  async approveSignal(signalId, userId = null, reason = '') {
    const pending = this.pendingSignals.get(signalId);
    
    if (!pending) {
      logger.warn(`⚠️ Attempted to approve non-existent signal: ${signalId}`);
      return false;
    }

    // Clear timeout
    this.clearApprovalTimeout(signalId);

    // Remove from pending
    this.pendingSignals.delete(signalId);

    // Resolve with approval
    const approval = {
      approved: true,
      timestamp: Date.now(),
      method: 'manual',
      userId,
      reason: reason || 'Manually approved',
      processingTime: Date.now() - pending.timestamp
    };

    pending.resolve(approval);

    logger.info(`✅ Signal approved: ${pending.signal.symbol} ${pending.signal.type} by ${userId || 'system'}`);
    
    // Emit approval event
    this.emit('signalApproved', pending.signal, approval);

    return true;
  }

  /**
   * ❌ Reject signal
   */
  async rejectSignal(signalId, userId = null, reason = '') {
    const pending = this.pendingSignals.get(signalId);
    
    if (!pending) {
      logger.warn(`⚠️ Attempted to reject non-existent signal: ${signalId}`);
      return false;
    }

    // Clear timeout
    this.clearApprovalTimeout(signalId);

    // Remove from pending
    this.pendingSignals.delete(signalId);

    // Resolve with rejection
    const rejection = {
      approved: false,
      timestamp: Date.now(),
      method: 'manual',
      userId,
      reason: reason || 'Manually rejected',
      processingTime: Date.now() - pending.timestamp
    };

    pending.resolve(rejection);

    logger.info(`❌ Signal rejected: ${pending.signal.symbol} ${pending.signal.type} by ${userId || 'system'}`);
    
    // Emit rejection event
    this.emit('signalRejected', pending.signal, rejection);

    return true;
  }

  /**
   * ⏰ Delay signal approval
   */
  async delaySignal(signalId, delayMinutes = 5, userId = null) {
    const pending = this.pendingSignals.get(signalId);
    
    if (!pending) {
      logger.warn(`⚠️ Attempted to delay non-existent signal: ${signalId}`);
      return false;
    }

    // Clear existing timeout
    this.clearApprovalTimeout(signalId);

    // Set new timeout
    const newTimeout = setTimeout(() => {
      this.handleApprovalTimeout(signalId);
    }, delayMinutes * 60 * 1000);

    this.approvalTimeouts.set(signalId, newTimeout);

    logger.info(`⏰ Signal delayed: ${pending.signal.symbol} ${pending.signal.type} for ${delayMinutes} minutes by ${userId || 'system'}`);
    
    // Emit delay event
    this.emit('signalDelayed', pending.signal, { delayMinutes, userId });

    return true;
  }

  /**
   * ⏰ Handle approval timeout
   */
  handleApprovalTimeout(signalId) {
    const pending = this.pendingSignals.get(signalId);
    
    if (!pending) return;

    // Remove from pending
    this.pendingSignals.delete(signalId);
    this.approvalTimeouts.delete(signalId);

    // Resolve with timeout rejection
    const timeout = {
      approved: false,
      timestamp: Date.now(),
      method: 'timeout',
      reason: `Approval timeout after ${config.telegram.approvalTimeout / 1000} seconds`,
      processingTime: Date.now() - pending.timestamp
    };

    pending.resolve(timeout);

    logger.warn(`⏰ Signal approval timeout: ${pending.signal.symbol} ${pending.signal.type}`);
    
    // Emit timeout event
    this.emit('signalTimeout', pending.signal, timeout);
  }

  /**
   * 📊 Get signal details for approval
   */
  getSignalDetails(signalId) {
    const pending = this.pendingSignals.get(signalId);
    return pending ? pending.signal : null;
  }

  /**
   * 📋 Get all pending signals
   */
  getPendingSignals() {
    return Array.from(this.pendingSignals.values()).map(pending => ({
      id: pending.signal.id,
      symbol: pending.signal.symbol,
      type: pending.signal.type,
      confidence: pending.signal.finalConfidence,
      timestamp: pending.timestamp,
      timeRemaining: this.getTimeRemaining(pending.signal.id)
    }));
  }

  /**
   * ⏰ Get time remaining for approval
   */
  getTimeRemaining(signalId) {
    const pending = this.pendingSignals.get(signalId);
    if (!pending) return 0;

    const elapsed = Date.now() - pending.timestamp;
    const remaining = config.telegram.approvalTimeout - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * 🔍 Process user response (for callback queries)
   */
  async processUserResponse(callbackQuery) {
    try {
      const data = callbackQuery.data;
      const userId = callbackQuery.from.id;
      const [action, signalId] = data.split('_');

      logger.info(`📱 User response: ${action} for signal ${signalId} by user ${userId}`);

      switch (action) {
        case 'execute':
          return await this.approveSignal(signalId, userId, 'Approved via Telegram');
          
        case 'reject':
          return await this.rejectSignal(signalId, userId, 'Rejected via Telegram');
          
        case 'delay':
          return await this.delaySignal(signalId, 5, userId);
          
        case 'details':
          return this.getSignalDetails(signalId);
          
        default:
          logger.warn(`⚠️ Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      logger.error('❌ Error processing user response:', error.message);
      return false;
    }
  }

  /**
   * 🧹 Clear approval timeout
   */
  clearApprovalTimeout(signalId) {
    const timeout = this.approvalTimeouts.get(signalId);
    if (timeout) {
      clearTimeout(timeout);
      this.approvalTimeouts.delete(signalId);
    }
  }

  /**
   * 📊 Get approval statistics
   */
  getApprovalStats() {
    const stats = {
      pendingCount: this.pendingSignals.size,
      totalRequests: 0,
      approved: 0,
      rejected: 0,
      timeouts: 0,
      avgProcessingTime: 0
    };

    // These would be tracked over time in a real implementation
    // For now, return basic stats
    return stats;
  }

  /**
   * 🚨 Handle emergency situations
   */
  async emergencyRejectAll(reason = 'Emergency stop') {
    const pendingIds = Array.from(this.pendingSignals.keys());
    
    logger.warn(`🚨 Emergency rejection of ${pendingIds.length} pending signals: ${reason}`);
    
    const results = [];
    for (const signalId of pendingIds) {
      const result = await this.rejectSignal(signalId, 'system', reason);
      results.push({ signalId, success: result });
    }
    
    this.emit('emergencyStop', { reason, affectedSignals: results.length });
    
    return results;
  }

  /**
   * 🔄 Bulk approve signals (for testing)
   */
  async bulkApprove(criteria = {}) {
    const pendingIds = Array.from(this.pendingSignals.keys());
    const results = [];
    
    for (const signalId of pendingIds) {
      const signal = this.getSignalDetails(signalId);
      
      // Apply criteria filters
      let shouldApprove = true;
      
      if (criteria.minConfidence && signal.finalConfidence < criteria.minConfidence) {
        shouldApprove = false;
      }
      
      if (criteria.allowedTypes && !criteria.allowedTypes.includes(signal.type)) {
        shouldApprove = false;
      }
      
      if (criteria.allowedRisk && !criteria.allowedRisk.includes(signal.risk)) {
        shouldApprove = false;
      }
      
      if (shouldApprove) {
        const result = await this.approveSignal(signalId, 'bulk_system', 'Bulk approval');
        results.push({ signalId, signal: signal.symbol, approved: result });
      }
    }
    
    logger.info(`🔄 Bulk approval completed: ${results.length} signals processed`);
    return results;
  }

  /**
   * 📋 Get approval queue status
   */
  getQueueStatus() {
    const pending = this.getPendingSignals();
    
    return {
      totalPending: pending.length,
      byType: pending.reduce((acc, signal) => {
        acc[signal.type] = (acc[signal.type] || 0) + 1;
        return acc;
      }, {}),
      byRisk: pending.reduce((acc, signal) => {
        const details = this.getSignalDetails(signal.id);
        if (details) {
          acc[details.risk] = (acc[details.risk] || 0) + 1;
        }
        return acc;
      }, {}),
      avgConfidence: pending.length > 0 ? 
        pending.reduce((sum, signal) => sum + signal.confidence, 0) / pending.length : 0,
      oldestPending: pending.length > 0 ? 
        Math.min(...pending.map(s => s.timestamp)) : null
    };
  }

  /**
   * 🔧 Configure approval settings
   */
  updateSettings(newSettings) {
    const allowedSettings = [
      'approvalTimeout',
      'signalApproval',
      'autoApproveBelow',
      'autoRejectAbove'
    ];
    
    const updated = {};
    
    for (const [key, value] of Object.entries(newSettings)) {
      if (allowedSettings.includes(key)) {
        // Update config (this would persist in a real implementation)
        config.telegram[key] = value;
        updated[key] = value;
      }
    }
    
    logger.info('⚙️ Approval settings updated:', updated);
    this.emit('settingsUpdated', updated);
    
    return updated;
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    // Clear all timeouts
    for (const timeout of this.approvalTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    // Reject all pending signals
    for (const [signalId] of this.pendingSignals) {
      this.rejectSignal(signalId, 'system', 'Bot shutting down');
    }
    
    // Clear maps
    this.pendingSignals.clear();
    this.approvalTimeouts.clear();
    this.userResponses.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('🧹 Signal Approval Bot cleaned up');
  }
}

module.exports = SignalApprovalBot;