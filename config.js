require('dotenv').config();

const config = {
  // 🔐 ENVIRONMENT & MODE
  environment: process.env.NODE_ENV || 'development',
  tradeMode: process.env.TRADE_MODE || 'paper', // 'paper' | 'live'
  testMode: process.env.TEST_MODE === 'true',
  debugMode: process.env.DEBUG_MODE === 'true',
  
  // 💰 CAPITAL & RISK MANAGEMENT
  capital: {
    total: parseFloat(process.env.TOTAL_CAPITAL) || 1000, // $500-$1000
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 1.5, // 1.5%
    maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES) || 3,
    minTradeAmount: parseFloat(process.env.MIN_TRADE_AMOUNT) || 10, // $10 minimum
    maxTradeAmount: parseFloat(process.env.MAX_TRADE_AMOUNT) || 50, // $50 maximum per trade
    leverageMultiplier: parseFloat(process.env.LEVERAGE) || 2, // 2x leverage
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT) || 3, // 3% stop loss
    takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT) || 5 // 5% take profit
  },

  // ⏱️ TIMEFRAMES & INTERVALS
  timeframes: {
    primary: process.env.PRIMARY_TIMEFRAME || '15m',
    secondary: process.env.SECONDARY_TIMEFRAME || '1h',
    longTerm: process.env.LONG_TERM_TIMEFRAME || '4h',
    shortTerm: process.env.SHORT_TERM_TIMEFRAME || '5m',
    analysisTimeframes: ['5m', '15m', '1h', '4h']
  },

  // 📊 TECHNICAL INDICATORS
  indicators: {
    rsi: {
      period: parseInt(process.env.RSI_PERIOD) || 14,
      oversold: parseFloat(process.env.RSI_OVERSOLD) || 30,
      overbought: parseFloat(process.env.RSI_OVERBOUGHT) || 70
    },
    ema: {
      fast: parseInt(process.env.EMA_FAST) || 9,
      medium: parseInt(process.env.EMA_MEDIUM) || 21,
      slow: parseInt(process.env.EMA_SLOW) || 50,
      superSlow: parseInt(process.env.EMA_SUPER_SLOW) || 200
    },
    macd: {
      fast: parseInt(process.env.MACD_FAST) || 12,
      slow: parseInt(process.env.MACD_SLOW) || 26,
      signal: parseInt(process.env.MACD_SIGNAL) || 9
    },
    bollinger: {
      period: parseInt(process.env.BB_PERIOD) || 20,
      deviation: parseFloat(process.env.BB_DEVIATION) || 2
    },
    volume: {
      smaLength: parseInt(process.env.VOLUME_SMA) || 20,
      spikeFactor: parseFloat(process.env.VOLUME_SPIKE_FACTOR) || 1.5
    }
  },

  // ============================================================================
  // 🤖 UPDATED AI CONFIGURATION FOR LATEST MODELS
  // ============================================================================

  // 🤖 AI CONFIGURATION WITH LATEST MODELS
  ai: {    confidence: {
      minimum: parseFloat(process.env.AI_MIN_CONFIDENCE) || 70, // ✅ INCREASED: Higher bar for signals
      gpt4Weight: parseFloat(process.env.GPT4_WEIGHT) || 35,     // ✅ INCREASED: GPT-4o is more reliable
      claudeWeight: parseFloat(process.env.CLAUDE_WEIGHT) || 30,  // ✅ DISABLED: API key expired
      geminiWeight: parseFloat(process.env.GEMINI_WEIGHT) || 20, // ✅ NEW: Gemini 2.0 Flash added
      technicalWeight: parseFloat(process.env.TECHNICAL_WEIGHT) || 15, // ✅ REDUCED: Let AI lead more
      sentimentWeight: parseFloat(process.env.SENTIMENT_WEIGHT) || 0   // ✅ DISABLED: Redistributed to others
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',               // ✅ UPGRADED: Latest GPT-4o
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022', // ✅ LATEST: Already current
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 1000
    },    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',  // ✅ UPGRADED: Latest Gemini 2.0
      enabled: process.env.GEMINI_ENABLED !== 'false',            // ✅ ENABLED: Now included in consensus
      maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 1000    },
    // ✅ NEW: Intelligent Caching Configuration
    cache: {
      enabled: process.env.AI_CACHE_ENABLED !== 'false',          // Enable intelligent caching
      timeout: parseInt(process.env.AI_CACHE_TIMEOUT) || 1800000, // 30 minutes cache expiry
      maxSize: parseInt(process.env.AI_CACHE_MAX_SIZE) || 1000,   // Max cache entries
      tolerance: {
        price: parseInt(process.env.AI_CACHE_PRICE_TOLERANCE) || 500,     // ±500 price tolerance
        volume: parseInt(process.env.AI_CACHE_VOLUME_TOLERANCE) || 20000, // ±20k volume tolerance
        rsi: parseInt(process.env.AI_CACHE_RSI_TOLERANCE) || 10,          // ±10 RSI tolerance
        macd: parseFloat(process.env.AI_CACHE_MACD_TOLERANCE) || 0.2      // ±0.2 MACD tolerance
      }
    }
  },

  // 🏦 EXCHANGE CONFIGURATION (BingX)
  exchange: {
    name: 'bingx',
    apiKey: process.env.BINGX_API_KEY,
    secret: process.env.BINGX_SECRET,
    sandbox: process.env.BINGX_SANDBOX === 'true',
    baseURL: process.env.BINGX_SANDBOX === 'true' 
      ? 'https://open-api-vst.bingx.com' 
      : 'https://open-api.bingx.com',
    rateLimit: {
      requests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 1200,
      perMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 60000
    },
    fees: {
      maker: parseFloat(process.env.BINGX_MAKER_FEE) || 0.001, // 0.1%
      taker: parseFloat(process.env.BINGX_TAKER_FEE) || 0.001  // 0.1%
    }
  },

  // 📱 TELEGRAM CONFIGURATION
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    enabled: process.env.TELEGRAM_ENABLED !== 'false',
    signalApproval: process.env.SIGNAL_APPROVAL === 'true',
    approvalTimeout: parseInt(process.env.APPROVAL_TIMEOUT) || 300000, // 5 minutes
    notifications: {
      signals: process.env.NOTIFY_SIGNALS !== 'false',
      trades: process.env.NOTIFY_TRADES !== 'false',
      errors: process.env.NOTIFY_ERRORS !== 'false',
      dailySummary: process.env.NOTIFY_DAILY_SUMMARY !== 'false'
    }
  },

  // 🪙 COIN SELECTION
  coins: {
    whitelist: (process.env.COIN_WHITELIST || 'BTC,ETH,SOL,LINK,OP,ADA,DOT,AVAX,UNI').split(','),
    blacklist: (process.env.COIN_BLACKLIST || '').split(',').filter(Boolean),
    maxCoins: parseInt(process.env.MAX_COINS) || 10,
    minVolume: parseFloat(process.env.MIN_VOLUME) || 1000000, // $1M daily volume
    minMarketCap: parseFloat(process.env.MIN_MARKET_CAP) || 100000000, // $100M market cap
    selection: {
      volumeWeight: parseFloat(process.env.VOLUME_WEIGHT) || 40,
      trendWeight: parseFloat(process.env.TREND_WEIGHT) || 35,
      volatilityWeight: parseFloat(process.env.VOLATILITY_WEIGHT) || 25
    }
  },

  // 📈 STRATEGY CONFIGURATION
  strategy: {
    signalTypes: ['LONG', 'SHORT'], // ✅ REMOVED 'HOLD' - no HOLD signals should be sent
    signalStrength: ['MEDIUM', 'STRONG'], // ✅ REMOVED 'WEAK' - only quality signals
    marketRegimes: ['BULL', 'BEAR', 'SIDEWAYS'],
    updateInterval: parseInt(process.env.UPDATE_INTERVAL) || 300000, // 5 minutes
    strategyRefreshInterval: parseInt(process.env.STRATEGY_REFRESH) || 86400000, // 24 hours
    minSignalGap: parseInt(process.env.MIN_SIGNAL_GAP) || 900000, // ✅ INCREASED: 15 minutes between signals
    backtestDays: parseInt(process.env.BACKTEST_DAYS) || 30,
    // ✅ NEW: Signal quality controls
    signalQuality: {
      minConfidence: parseFloat(process.env.MIN_SIGNAL_CONFIDENCE) || 75, // Higher bar for signals
      requireMultiTimeframe: process.env.REQUIRE_MULTI_TF !== 'false', // Need confirmation across timeframes
      maxDailySignals: parseInt(process.env.MAX_DAILY_SIGNALS) || 6, // ✅ REDUCED: Limit to 6 quality signals per day
      duplicateTimeWindow: parseInt(process.env.DUPLICATE_TIME_WINDOW) || 1800000, // 30 min duplicate check
      technicalMinConfidence: parseFloat(process.env.TECH_MIN_CONFIDENCE) || 70, // ✅ INCREASED: Higher technical bar
      blockHoldSignals: process.env.BLOCK_HOLD_SIGNALS !== 'false' // ✅ NEW: Block HOLD signals by default
    }
  },

  // 📊 MARKET CONTEXT PROTOCOL (MCP)
  mcp: {
    enabled: process.env.MCP_ENABLED !== 'false',
    fearGreedWeight: parseFloat(process.env.FEAR_GREED_WEIGHT) || 20,
    sentimentWeight: parseFloat(process.env.MCP_SENTIMENT_WEIGHT) || 30,
    volumeWeight: parseFloat(process.env.MCP_VOLUME_WEIGHT) || 25,
    volatilityWeight: parseFloat(process.env.MCP_VOLATILITY_WEIGHT) || 25,
    refreshInterval: parseInt(process.env.MCP_REFRESH) || 3600000 // 1 hour
  },

  // 📝 LOGGING CONFIGURATION
  logging: {
    level: process.env.LOG_LEVEL || 'info', // error, warn, info, debug
    console: process.env.LOG_CONSOLE !== 'false',
    file: process.env.LOG_FILE !== 'false',
    telegram: process.env.LOG_TELEGRAM === 'true',
    directory: process.env.LOG_DIRECTORY || './logs',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    format: process.env.LOG_FORMAT || 'json' // json, simple
  },

  // 🗄️ DATABASE CONFIGURATION
  database: {
    type: process.env.DB_TYPE || 'json', // 'json' | 'mongodb' | 'redis'
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/protrade-ai',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0
    },
    json: {
      directory: process.env.JSON_DB_DIR || './data',
      autoSave: process.env.JSON_AUTO_SAVE !== 'false'
    }
  },

  // 🌐 API SERVER
  api: {
    enabled: process.env.API_ENABLED !== 'false',
    port: parseInt(process.env.API_PORT) || 3000,
    host: process.env.API_HOST || 'localhost',
    cors: process.env.API_CORS !== 'false',
    adminEnabled: process.env.API_ADMIN_ENABLED !== 'false', // Enable admin routes by default
    rateLimit: {
      windowMs: parseInt(process.env.API_RATE_WINDOW) || 900000, // 15 minutes
      max: parseInt(process.env.API_RATE_MAX) || 100 // requests per window
    }
  },

  // 🧪 MOCK DATA (for testing)
  mockData: {
    enabled: process.env.MOCK_DATA === 'true',
    priceVariation: parseFloat(process.env.MOCK_PRICE_VARIATION) || 0.02, // 2%
    volumeVariation: parseFloat(process.env.MOCK_VOLUME_VARIATION) || 0.15, // 15%
    updateInterval: parseInt(process.env.MOCK_UPDATE_INTERVAL) || 5000, // 5 seconds
    historicalDays: parseInt(process.env.MOCK_HISTORICAL_DAYS) || 30
  },

  // 🎯 PROFIT TARGETS
  profitTargets: {
    daily: parseFloat(process.env.DAILY_PROFIT_TARGET) || 50, // $50
    weekly: parseFloat(process.env.WEEKLY_PROFIT_TARGET) || 350, // $350
    monthly: parseFloat(process.env.MONTHLY_PROFIT_TARGET) || 1500, // $1500
    winRateTarget: parseFloat(process.env.WIN_RATE_TARGET) || 75, // 75%
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 25, // $25
    maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN) || 10 // 10%
  }
};

// ============================================================================
// 📊 ENHANCED VALIDATION FOR NEW MODELS
// ============================================================================

// 🔍 VALIDATION FUNCTIONS (Updated for 3 AI models)
config.validate = () => {
  const errors = [];
  
  // Check required API keys
  if (!config.testMode && !config.mockData.enabled) {
    if (!config.exchange.apiKey) errors.push('BINGX_API_KEY is required for live trading');
    if (!config.exchange.secret) errors.push('BINGX_SECRET is required for live trading');
  }
  
  // AI API Keys - Need at least 2 for good consensus
  const aiKeys = [
    config.ai.openai.apiKey,
    config.ai.claude.apiKey,
    config.ai.gemini.apiKey && config.ai.gemini.enabled ? config.ai.gemini.apiKey : null
  ].filter(Boolean);
  
  if (aiKeys.length < 2 && !config.testMode) {
    errors.push('At least 2 AI API keys required for reliable consensus (OpenAI, Claude, or Gemini)');
  }
  
  if (config.telegram.enabled && !config.telegram.botToken) {
    errors.push('TELEGRAM_BOT_TOKEN is required when Telegram is enabled');
  }

  // Check weights sum to 100%
  const totalWeight = (config.ai.confidence.gpt4Weight || 0) + 
                     (config.ai.confidence.claudeWeight || 0) + 
                     (config.ai.confidence.geminiWeight || 0) + 
                     (config.ai.confidence.technicalWeight || 0);
  
  if (Math.abs(totalWeight - 100) > 5) { // Allow 5% tolerance
    errors.push(`AI confidence weights should sum to ~100% (currently ${totalWeight}%)`);
  }

  // Check numeric ranges
  if (config.capital.riskPerTrade < 0.1 || config.capital.riskPerTrade > 5) {
    errors.push('Risk per trade should be between 0.1% and 5%');
  }

  if (config.ai.confidence.minimum < 50 || config.ai.confidence.minimum > 95) {
    errors.push('AI confidence minimum should be between 50% and 95%');
  }

  return errors;
};

// 🚀 INITIALIZE WITH MODEL INFO
config.init = () => {
  const errors = config.validate();
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  
  console.log('✅ Configuration validated successfully');
  console.log(`📊 Mode: ${config.tradeMode.toUpperCase()}`);
  console.log(`💰 Capital: $${config.capital.total}`);
  console.log(`⚖️ Risk per trade: ${config.capital.riskPerTrade}%`);
  console.log(`🎯 Target coins: ${config.coins.maxCoins}`);
  console.log(`🤖 AI Models:`, {
    openai: config.ai.openai.model,
    claude: config.ai.claude.model, 
    gemini: config.ai.gemini.enabled ? config.ai.gemini.model : 'disabled'
  });
  console.log(`🧠 AI Confidence: ${config.ai.confidence.minimum}% minimum`);
  console.log(`📊 AI Weights: GPT(${config.ai.confidence.gpt4Weight}%) Claude(${config.ai.confidence.claudeWeight}%) Gemini(${config.ai.confidence.geminiWeight}%) Technical(${config.ai.confidence.technicalWeight}%)`);
};

module.exports = config;