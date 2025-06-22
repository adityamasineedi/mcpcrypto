const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Get config, but handle case where it might not be loaded yet
let config;
try {
  config = require('../config');
} catch (error) {
  // Fallback configuration if config not available
  config = {
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      console: process.env.LOG_CONSOLE !== 'false',
      file: process.env.LOG_FILE !== 'false',
      directory: process.env.LOG_DIRECTORY || './logs',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      format: process.env.LOG_FORMAT || 'json'
    },
    environment: process.env.NODE_ENV || 'development',
    telegram: {
      enabled: false
    }
  };
}

class Logger {
  constructor() {
    this.logger = null;
    this.telegramBot = null;
    this.init();
  }

  /**
   * 🚀 Initialize logger
   */
  init() {
    // Ensure log directory exists
    this.ensureLogDirectory();

    // Create winston logger
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: this.createFormat(),
      transports: this.createTransports(),
      exitOnError: false
    });

    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new winston.transports.File({ 
        filename: path.join(config.logging.directory, 'exceptions.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );

    // Handle unhandled rejections
    this.logger.rejections.handle(
      new winston.transports.File({ 
        filename: path.join(config.logging.directory, 'rejections.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );
  }

  /**
   * 📁 Ensure log directory exists
   */
  ensureLogDirectory() {
    try {
      if (!fs.existsSync(config.logging.directory)) {
        fs.mkdirSync(config.logging.directory, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error.message);
    }
  }

  /**
   * 🎨 Create log format
   */
  createFormat() {
    const formats = [];

    // Add timestamp
    formats.push(winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }));

    // Add errors with stack trace
    formats.push(winston.format.errors({ stack: true }));

    // Add custom format based on configuration
    if (config.logging.format === 'json') {
      formats.push(winston.format.json());
    } else {
      // Simple format for development
      formats.push(winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
          logMessage += ` ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
      }));
    }

    return winston.format.combine(...formats);
  }

  /**
   * 🚛 Create transports
   */
  createTransports() {
    const transports = [];

    // Console transport
    if (config.logging.console) {
      transports.push(new winston.transports.Console({
        format: this.createConsoleFormat()
      }));
    }

    // File transports
    if (config.logging.file) {
      // General log file with rotation
      transports.push(new DailyRotateFile({
        filename: path.join(config.logging.directory, 'trading-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles,
        zippedArchive: true
      }));

      // Error log file
      transports.push(new DailyRotateFile({
        filename: path.join(config.logging.directory, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles,
        zippedArchive: true
      }));

      // Separate files for different log types
      transports.push(new DailyRotateFile({
        filename: path.join(config.logging.directory, 'signals-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '10m',
        maxFiles: '7d',
        zippedArchive: true,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    return transports;
  }

  /**
   * 🎨 Create console format (colorized for development)
   */
  createConsoleFormat() {
    if (config.environment === 'development') {
      return winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let logMessage = `${timestamp} ${level}: ${message}`;
          
          // Add metadata if present (but make it more readable)
          if (Object.keys(meta).length > 0) {
            const metaStr = JSON.stringify(meta, null, 2);
            if (metaStr !== '{}') {
              logMessage += `\n${metaStr}`;
            }
          }
          
          return logMessage;
        })
      );
    } else {
      return winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      );
    }
  }

  /**
   * 📊 Log levels and methods
   */
  error(message, meta = {}) {
    this.logger.error(message, meta);
    
    // Send critical errors to Telegram if configured
    if (config.logging.telegram && this.telegramBot) {
      this.sendTelegramAlert('error', message, meta);
    }
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * 📱 Specialized logging methods
   */
  signal(action, symbol, data = {}) {
    this.logger.info(`SIGNAL_${action.toUpperCase()}`, {
      symbol,
      action,
      timestamp: Date.now(),
      ...data
    });
  }

  trade(action, symbol, data = {}) {
    this.logger.info(`TRADE_${action.toUpperCase()}`, {
      symbol,
      action,
      timestamp: Date.now(),
      ...data
    });
  }

  performance(metric, value, data = {}) {
    this.logger.info(`PERFORMANCE_${metric.toUpperCase()}`, {
      metric,
      value,
      timestamp: Date.now(),
      ...data
    });
  }

  api(method, endpoint, status, data = {}) {
    this.logger.info(`API_${method.toUpperCase()}`, {
      method,
      endpoint,
      status,
      timestamp: Date.now(),
      ...data
    });
  }

  market(event, data = {}) {
    this.logger.info(`MARKET_${event.toUpperCase()}`, {
      event,
      timestamp: Date.now(),
      ...data
    });
  }

  /**
   * 📱 Set Telegram bot for critical alerts
   */
  setTelegramBot(telegramBot) {
    this.telegramBot = telegramBot;
  }

  /**
   * 🚨 Send Telegram alert for critical issues
   */
  async sendTelegramAlert(level, message, meta = {}) {
    try {
      if (!this.telegramBot || !config.telegram.enabled) return;

      const emoji = {
        error: '🚨',
        warn: '⚠️',
        info: 'ℹ️'
      }[level] || '📝';

      let alertMessage = `${emoji} <b>Bot Alert</b>\n\n`;
      alertMessage += `📍 <b>Level:</b> ${level.toUpperCase()}\n`;
      alertMessage += `💬 <b>Message:</b> ${message}\n`;
      
      if (Object.keys(meta).length > 0) {
        alertMessage += `📊 <b>Details:</b>\n`;
        for (const [key, value] of Object.entries(meta)) {
          if (typeof value === 'object') {
            alertMessage += `• ${key}: ${JSON.stringify(value)}\n`;
          } else {
            alertMessage += `• ${key}: ${value}\n`;
          }
        }
      }
      
      alertMessage += `\n⏰ ${new Date().toLocaleString()}`;

      await this.telegramBot.sendMessage(alertMessage, { parse_mode: 'HTML' });
    } catch (error) {
      // Don't log this error to avoid infinite loops
      console.error('Failed to send Telegram alert:', error.message);
    }
  }

  /**
   * 📊 Get log statistics
   */
  getStats() {
    const logFiles = this.getLogFiles();
    
    return {
      level: config.logging.level,
      directory: config.logging.directory,
      files: logFiles.length,
      totalSize: this.calculateTotalLogSize(logFiles),
      oldestFile: this.getOldestLogFile(logFiles),
      newestFile: this.getNewestLogFile(logFiles)
    };
  }

  /**
   * 📁 Get all log files
   */
  getLogFiles() {
    try {
      const files = fs.readdirSync(config.logging.directory);
      return files
        .filter(file => file.endsWith('.log') || file.endsWith('.log.gz'))
        .map(file => {
          const filePath = path.join(config.logging.directory, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        });
    } catch (error) {
      return [];
    }
  }

  /**
   * 📏 Calculate total log size
   */
  calculateTotalLogSize(logFiles) {
    return logFiles.reduce((total, file) => total + file.size, 0);
  }

  /**
   * 📅 Get oldest log file
   */
  getOldestLogFile(logFiles) {
    if (logFiles.length === 0) return null;
    return logFiles.reduce((oldest, file) => 
      file.created < oldest.created ? file : oldest
    );
  }

  /**
   * 📅 Get newest log file
   */
  getNewestLogFile(logFiles) {
    if (logFiles.length === 0) return null;
    return logFiles.reduce((newest, file) => 
      file.created > newest.created ? file : newest
    );
  }

  /**
   * 🧹 Clean old logs
   */
  cleanOldLogs(daysToKeep = 30) {
    try {
      const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      const logFiles = this.getLogFiles();
      let deletedCount = 0;

      for (const file of logFiles) {
        if (file.created.getTime() < cutoff) {
          try {
            fs.unlinkSync(file.path);
            deletedCount++;
            this.debug(`Deleted old log file: ${file.name}`);
          } catch (error) {
            this.error(`Failed to delete log file ${file.name}:`, error.message);
          }
        }
      }

      if (deletedCount > 0) {
        this.info(`Cleaned up ${deletedCount} old log files`);
      }

      return deletedCount;
    } catch (error) {
      this.error('Error cleaning old logs:', error.message);
      return 0;
    }
  }

  /**
   * 📊 Create structured log entry
   */
  createStructuredLog(category, action, data = {}) {
    return {
      category: category.toUpperCase(),
      action: action.toUpperCase(),
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      ...data
    };
  }

  /**
   * 🔧 Update log level dynamically
   */
  setLevel(level) {
    if (!['error', 'warn', 'info', 'debug'].includes(level)) {
      throw new Error('Invalid log level');
    }
    
    this.logger.level = level;
    config.logging.level = level;
    this.info(`Log level changed to: ${level}`);
  }

  /**
   * 📈 Log with context (adds common metadata automatically)
   */
  withContext(context = {}) {
    return {
      error: (message, meta = {}) => this.error(message, { ...context, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
      info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { ...context, ...meta })
    };
  }
}

// Create singleton logger instance
const logger = new Logger();

// Export both the logger instance and the class
module.exports = logger;
module.exports.Logger = Logger;