const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');
const logger = require('./utils/logger');

class OpenAIEngine {
  constructor() {
    this.openai = null;
    this.claude = null;
    this.gemini = null;
    this.initialized = false;
    this.requestCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.intelligentCache = new Map();
    this.cacheHits = 0;
    this.totalRequests = 0;
    // Cache configuration from config
    this.cacheConfig = config.ai.cache || {
      enabled: true,
      timeout: 1800000,
      maxSize: 1000,
      tolerance: { price: 500, volume: 20000, rsi: 10, macd: 0.1 }
    };
  }

  /**
   * 🚀 Initialize AI engines
   */
  async init() {
    try {
      // Initialize OpenAI
      if (config.ai.openai.apiKey && !config.testMode) {
        this.openai = new OpenAI({
          apiKey: config.ai.openai.apiKey
        });
        logger.info('✅ OpenAI initialized');
      } else {
        logger.warn('⚠️ OpenAI API key not found, using mock responses');
      }

      // Initialize Claude
      if (config.ai.claude.apiKey && !config.testMode) {
        this.claude = new Anthropic({
          apiKey: config.ai.claude.apiKey
        });
        logger.info('✅ Claude initialized');
      } else {
        logger.warn('⚠️ Claude API key not found, using mock responses');
      }

      // Initialize Gemini
      if (config.ai.gemini && config.ai.gemini.apiKey && !config.testMode) {
        this.gemini = new GoogleGenerativeAI(config.ai.gemini.apiKey);
        logger.info('✅ Gemini initialized');
      } else {
        logger.warn('⚠️ Gemini API key not found, using mock responses');
      }

      this.initialized = true;
      logger.info('✅ OpenAI Engine initialized');
    } catch (error) {
      logger.error('❌ OpenAI Engine initialization failed:', error.message);
      this.initialized = true; // Continue with mock responses
    }
  }

  /**
   * 🤖 Analyze trading signal with AI consensus
   */
  async analyzeSignal(signalData) {
    try {
      this.totalRequests++;
      
      const { symbol, technicalData, marketContext, proposedSignal } = signalData;

      // Generate cache key for intelligent caching
      const cacheKey = this.generateCacheKey(symbol, marketContext, technicalData, proposedSignal);
      
      // Check intelligent cache first
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        logger.info(`🎯 Using cached AI analysis for ${symbol}`);
        return cachedResponse;
      }

      // Validate technical data before proceeding
      const validatedTechnicalData = this.validateTechnicalData(technicalData);

      // Get AI analyses in parallel
      const [gptAnalysis, claudeAnalysis, geminiAnalysis] = await Promise.allSettled([
        this.getGPTAnalysis(symbol, validatedTechnicalData, marketContext, proposedSignal),
        this.getClaudeAnalysis(symbol, validatedTechnicalData, marketContext, proposedSignal),
        this.getGeminiAnalysis(symbol, validatedTechnicalData, marketContext, proposedSignal)
      ]);

      // Extract results
      const gptResult = gptAnalysis.status === 'fulfilled' ? gptAnalysis.value : this.getMockAnalysis('GPT-4o');
      const claudeResult = claudeAnalysis.status === 'fulfilled' ? claudeAnalysis.value : this.getMockAnalysis('Claude');
      const geminiResult = geminiAnalysis.status === 'fulfilled' ? geminiAnalysis.value : this.getMockAnalysis('Gemini-2.0');

      // Calculate consensus
      const consensus = this.calculateAIConsensus(gptResult, claudeResult, geminiResult, validatedTechnicalData);

      // Store in intelligent cache
      this.setCachedResponse(cacheKey, consensus);

      logger.info(`🤖 AI Analysis for ${symbol}:`, {
        gptConfidence: gptResult.confidence,
        claudeConfidence: claudeResult.confidence,
        geminiConfidence: geminiResult.confidence,
        finalConfidence: consensus.confidence,
        recommendation: consensus.recommendation,
        cached: false
      });

      return consensus;
    } catch (error) {
      logger.error('❌ Error in AI signal analysis:', error.message);
      return this.getMockAnalysis();
    }
  }

  /**
   * ✅ Validate and fix technical data
   */
  validateTechnicalData(technicalData) {
    const validated = { ...technicalData };

    // Fix RSI
    if (typeof validated.rsi !== 'number' || isNaN(validated.rsi)) {
      validated.rsi = 50; // Neutral RSI
    }

    // Fix MACD - this is the main issue!
    if (!validated.macd || typeof validated.macd !== 'object') {
      validated.macd = {
        MACD: 0,
        signal: 0,
        histogram: 0
      };
    } else {
      // Ensure all MACD properties exist and are numbers
      validated.macd.MACD = typeof validated.macd.MACD === 'number' ? validated.macd.MACD : 0;
      validated.macd.signal = typeof validated.macd.signal === 'number' ? validated.macd.signal : 0;
      validated.macd.histogram = typeof validated.macd.histogram === 'number' ? validated.macd.histogram : 0;
    }

    // Fix EMAs
    validated.ema9 = typeof validated.ema9 === 'number' ? validated.ema9 : validated.currentPrice || 0;
    validated.ema21 = typeof validated.ema21 === 'number' ? validated.ema21 : validated.currentPrice || 0;
    validated.ema50 = typeof validated.ema50 === 'number' ? validated.ema50 : validated.currentPrice || 0;
    validated.ema200_4h = typeof validated.ema200_4h === 'number' ? validated.ema200_4h : validated.currentPrice || 0;

    // Fix volume ratio
    validated.volumeRatio = typeof validated.volumeRatio === 'number' ? validated.volumeRatio : 1;

    // Fix change24h
    validated.change24h = typeof validated.change24h === 'number' ? validated.change24h : 0;

    // Fix technical score
    validated.technicalScore = typeof validated.technicalScore === 'number' ? validated.technicalScore : 50;

    return validated;
  }

  /**
   * 🧠 Get GPT-4o analysis
   */
  async getGPTAnalysis(symbol, technicalData, marketContext, proposedSignal) {
    try {
      if (!this.openai) {
        return this.getMockAnalysis('GPT-4o');
      }

      const cacheKey = `gpt_${symbol}_${proposedSignal.type}_${Date.now() - (Date.now() % this.cacheTimeout)}`;
      const cached = this.requestCache.get(cacheKey);
      if (cached) return cached;

      const prompt = this.buildGPTPrompt(symbol, technicalData, marketContext, proposedSignal);

      const response = await this.openai.chat.completions.create({
        model: config.ai.openai.model,
        messages: [
          {
            role: "system",
            content: `You are a professional cryptocurrency trading analyst powered by GPT-4o. You excel at complex reasoning and market analysis. Provide objective, data-driven trading recommendations.

Response format must be valid JSON with these exact fields:
{
  "confidence": number (0-100),
  "recommendation": "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL",
  "reasoning": "string explanation focusing on your advanced reasoning capabilities",
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "price_target": number,
  "stop_loss": number,
  "time_horizon": "SHORT" | "MEDIUM" | "LONG"
}`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: config.ai.openai.maxTokens,
        temperature: config.ai.openai.temperature
      });

      const analysis = this.parseAIResponse(response.choices[0].message.content, 'GPT-4o');
      this.requestCache.set(cacheKey, analysis);

      return analysis;
    } catch (error) {
      logger.error('❌ GPT-4o analysis error:', error.message);
      return this.getMockAnalysis('GPT-4o');
    }
  }

  /**
   * 🎭 Get Claude analysis
   */
  async getClaudeAnalysis(symbol, technicalData, marketContext, proposedSignal) {
    try {
      if (!this.claude || !config.ai.claude.apiKey) {
        return this.getMockAnalysis('Claude');
      }

      const cacheKey = `claude_${symbol}_${proposedSignal.type}_${Date.now() - (Date.now() % this.cacheTimeout)}`;
      const cached = this.requestCache.get(cacheKey);
      if (cached) return cached;

      const prompt = this.buildClaudePrompt(symbol, technicalData, marketContext, proposedSignal);

      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

      const analysis = this.parseAIResponse(response.content[0].text, 'Claude-3.5');
      this.requestCache.set(cacheKey, analysis);

      return analysis;
    } catch (error) {
      logger.error('❌ Claude analysis error:', error.message);
      
      // If it's a 404 or auth error, disable Claude for this session
      if (error.status === 404 || error.status === 401 || error.status === 400) {
        logger.warn('⚠️ Claude API credentials invalid, disabling for session');
        this.claude = null;
      }
      return this.getMockAnalysis('Claude');
    }
  }

  /**
   * 💎 Get Gemini 2.0 Flash analysis (with enhanced error handling)
   */
  async getGeminiAnalysis(symbol, technicalData, marketContext, proposedSignal) {
    try {
      if (!this.gemini || !config.ai.gemini?.apiKey) {
        return this.getMockAnalysis('Gemini-2.0');
      }

      const cacheKey = `gemini_${symbol}_${proposedSignal.type}_${Date.now() - (Date.now() % this.cacheTimeout)}`;
      const cached = this.requestCache.get(cacheKey);
      if (cached) return cached;

      const prompt = this.buildGeminiPrompt(symbol, technicalData, marketContext, proposedSignal);

      // Add timeout and retry logic
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        const model = this.gemini.getGenerativeModel({ 
          model: config.ai.gemini.model || 'gemini-1.5-flash', // Use stable model
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 800, // Reduced for faster response
          }
        });

        const result = await model.generateContent(prompt);
        clearTimeout(timeoutId);
        
        const response = await result.response;
        const text = response.text();

        const analysis = this.parseAIResponse(text, 'Gemini-2.0');
        this.requestCache.set(cacheKey, analysis);

        return analysis;
      } catch (timeoutError) {
        clearTimeout(timeoutId);
        throw timeoutError;
      }

    } catch (error) {
      // Enhanced error logging
      const errorInfo = {
        message: error.message,
        status: error.status,
        code: error.code,
        symbol: symbol,
        timestamp: new Date().toISOString()
      };
      
      // Don't log full error details to reduce noise
      if (error.status === 429) {
        logger.warn(`⚠️ Gemini rate limit hit for ${symbol}, using fallback`);
      } else if (error.status === 503 || error.status === 500) {
        logger.warn(`⚠️ Gemini service unavailable for ${symbol}, using fallback`);
      } else if (error.message.includes('timeout') || error.message.includes('aborted')) {
        logger.warn(`⚠️ Gemini timeout for ${symbol}, using fallback`);
      } else {
        logger.error('❌ Gemini analysis error:', errorInfo);
      }
      
      // Disable Gemini temporarily on certain errors
      if (error.status === 403 || error.status === 401 || error.status === 400) {
        logger.warn('⚠️ Gemini API credentials invalid, disabling for session');
        this.gemini = null;
      }
      
      return this.getMockAnalysis('Gemini-2.0');
    }
  }

  /**
   * 📝 Build GPT prompt with safe data access
   */
  buildGPTPrompt(symbol, technicalData, marketContext, proposedSignal) {
    const safeNum = (value, decimals = 2) => {
      return typeof value === 'number' && !isNaN(value) ? value.toFixed(decimals) : 'N/A';
    };

    return `Analyze this cryptocurrency trading signal for ${symbol}:

MARKET CONTEXT:
- Market Regime: ${marketContext.regime || 'UNKNOWN'}
- Confidence: ${marketContext.confidence || 50}%
- Fear & Greed: ${marketContext.fearGreedIndex || 50}
- Sentiment: ${marketContext.sentiment || 'NEUTRAL'}
- Volatility: ${marketContext.volatility || 'MEDIUM'}

TECHNICAL DATA:
- Current Price: $${safeNum(technicalData.currentPrice, 4)}
- RSI: ${safeNum(technicalData.rsi, 2)}
- MACD: ${safeNum(technicalData.macd.MACD, 4)} (Signal: ${safeNum(technicalData.macd.signal, 4)})
- EMA 9: $${safeNum(technicalData.ema9, 2)}
- EMA 21: $${safeNum(technicalData.ema21, 2)}
- EMA 50: $${safeNum(technicalData.ema50, 2)}
- Volume Ratio: ${safeNum(technicalData.volumeRatio, 2)}x
- 24h Change: ${safeNum(technicalData.change24h, 2)}%

PROPOSED SIGNAL:
- Type: ${proposedSignal.type}
- Strength: ${proposedSignal.strength}
- Entry Price: $${safeNum(proposedSignal.entryPrice, 4)}
- Technical Confidence: ${proposedSignal.confidence || 50}%

TRADING PARAMETERS:
- Capital: $${config.capital.total}
- Risk per trade: ${config.capital.riskPerTrade}%
- Max position: $${config.capital.maxTradeAmount}

Provide a JSON response evaluating this signal. Consider:
1. Technical indicator alignment
2. Market context compatibility
3. Risk/reward ratio
4. Optimal entry/exit points
5. Current market volatility and regime

Focus on ACTIONABLE insights for a ${config.capital.total} account with ${config.capital.riskPerTrade}% risk tolerance.`;
  }

  /**
   * 📝 Build Claude prompt with safe data access
   */
  buildClaudePrompt(symbol, technicalData, marketContext, proposedSignal) {
    const safeNum = (value, decimals = 2) => {
      return typeof value === 'number' && !isNaN(value) ? value.toFixed(decimals) : 'N/A';
    };

    return `As a cryptocurrency trading analyst, evaluate this ${symbol} signal:

🎯 SIGNAL EVALUATION REQUEST
${symbol} | ${proposedSignal.type} | Strength: ${proposedSignal.strength}

📊 MARKET DATA:
• Regime: ${marketContext.regime || 'UNKNOWN'} (${marketContext.confidence || 50}% confidence)
• Fear/Greed: ${marketContext.fearGreedIndex || 50}/100
• Sentiment: ${marketContext.sentiment || 'NEUTRAL'}
• Volatility: ${marketContext.volatility || 'MEDIUM'}

📈 TECHNICAL INDICATORS:
• Price: $${safeNum(technicalData.currentPrice, 4)}
• RSI(14): ${safeNum(technicalData.rsi, 1)}
• MACD: ${safeNum(technicalData.macd.MACD, 4)} vs Signal ${safeNum(technicalData.macd.signal, 4)}
• EMAs: 9($${safeNum(technicalData.ema9, 2)}) | 21($${safeNum(technicalData.ema21, 2)}) | 50($${safeNum(technicalData.ema50, 2)})
• Volume: ${safeNum(technicalData.volumeRatio, 1)}x average
• 24h Change: ${safeNum(technicalData.change24h, 1)}%

🎲 PROPOSED TRADE:
• Direction: ${proposedSignal.type}
• Entry: $${safeNum(proposedSignal.entryPrice, 4)}
• Technical Score: ${proposedSignal.confidence || 50}%

💼 RISK PARAMETERS:
• Account: $${config.capital.total}
• Risk/Trade: ${config.capital.riskPerTrade}%
• Max Position: $${config.capital.maxTradeAmount}

Return JSON analysis:
{
  "confidence": number (0-100),
  "recommendation": "STRONG_BUY"|"BUY"|"HOLD"|"SELL"|"STRONG_SELL",
  "reasoning": "concise explanation",
  "risk_level": "LOW"|"MEDIUM"|"HIGH",
  "price_target": number,
  "stop_loss": number,
  "time_horizon": "SHORT"|"MEDIUM"|"LONG"
}

Focus on: indicator convergence, market regime alignment, optimal risk/reward setup.`;
  }

  /**
   * 📝 Build Gemini prompt with safe data access
   */
  buildGeminiPrompt(symbol, technicalData, marketContext, proposedSignal) {
    const safeNum = (value, decimals = 2) => {
      return typeof value === 'number' && !isNaN(value) ? value.toFixed(decimals) : 'N/A';
    };

    return `As Gemini 2.0 Flash, analyze this ${symbol} trading signal with your speed and accuracy:

🎯 REAL-TIME SIGNAL ANALYSIS
Symbol: ${symbol} | Action: ${proposedSignal.type} | Strength: ${proposedSignal.strength}

📊 MARKET STATE:
• Regime: ${marketContext.regime || 'UNKNOWN'} (${marketContext.confidence || 50}% confidence)
• Fear/Greed: ${marketContext.fearGreedIndex || 50}/100
• Sentiment: ${marketContext.sentiment || 'NEUTRAL'}
• Volatility: ${marketContext.volatility || 'MEDIUM'}

📈 TECHNICAL SNAPSHOT:
• Price: $${safeNum(technicalData.currentPrice, 4)}
• RSI: ${safeNum(technicalData.rsi, 1)}
• MACD: ${safeNum(technicalData.macd.MACD, 4)} vs Signal ${safeNum(technicalData.macd.signal, 4)}
• EMAs: 9($${safeNum(technicalData.ema9, 2)}) | 21($${safeNum(technicalData.ema21, 2)}) | 50($${safeNum(technicalData.ema50, 2)})
• Volume: ${safeNum(technicalData.volumeRatio, 1)}x average
• 24h Change: ${safeNum(technicalData.change24h, 1)}%

🎲 PROPOSED EXECUTION:
• Direction: ${proposedSignal.type}
• Entry: $${safeNum(proposedSignal.entryPrice, 4)}
• Technical Score: ${proposedSignal.confidence || 50}%

💼 RISK CONTEXT:
• Account: $${config.capital.total}
• Risk/Trade: ${config.capital.riskPerTrade}%
• Max Position: $${config.capital.maxTradeAmount}

Provide fast, accurate JSON analysis:
{
  "confidence": number (0-100),
  "recommendation": "STRONG_BUY"|"BUY"|"HOLD"|"SELL"|"STRONG_SELL",
  "reasoning": "focus on speed and pattern recognition insights",
  "risk_level": "LOW"|"MEDIUM"|"HIGH",
  "price_target": number,
  "stop_loss": number,
  "time_horizon": "SHORT"|"MEDIUM"|"LONG"
}

Leverage your real-time processing power for optimal market timing.`;
  }

  /**
   * 🤝 Calculate AI consensus
   */
  calculateAIConsensus(gptResult, claudeResult, geminiResult, technicalData) {
    const weights = config.ai.confidence;
    
    // Weight the confidences with safe fallbacks
    const gptConfidence = typeof gptResult.confidence === 'number' ? gptResult.confidence : 50;
    const claudeConfidence = typeof claudeResult.confidence === 'number' ? claudeResult.confidence : 50;
    const geminiConfidence = typeof geminiResult.confidence === 'number' ? geminiResult.confidence : 50;
    const technicalScore = typeof technicalData.technicalScore === 'number' ? technicalData.technicalScore : 50;

    const weightedGPT = (gptConfidence * weights.gpt4Weight) / 100;
    const weightedClaude = (claudeConfidence * weights.claudeWeight) / 100;
    const weightedGemini = (geminiConfidence * weights.geminiWeight) / 100;
    const weightedTechnical = (technicalScore * weights.technicalWeight) / 100;
    
    // Calculate final confidence
    let finalConfidence = weightedGPT + weightedClaude + weightedGemini + weightedTechnical;
    
    // Ensure finalConfidence is a valid number
    if (isNaN(finalConfidence) || finalConfidence === null || finalConfidence === undefined) {
      finalConfidence = Math.max(gptConfidence, claudeConfidence, geminiConfidence, technicalScore);
    }
    
    // Determine consensus recommendation
    const recommendation = this.getConsensusRecommendation([
      gptResult.recommendation,
      claudeResult.recommendation,
      geminiResult.recommendation
    ], finalConfidence);
    
    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(gptResult, claudeResult, geminiResult, technicalData);
    
    // Calculate price targets
    const priceTarget = this.calculateConsensusTarget(gptResult.price_target, claudeResult.price_target, geminiResult.price_target);
    const stopLoss = this.calculateConsensusStopLoss(gptResult.stop_loss, claudeResult.stop_loss, geminiResult.stop_loss);
    
    return {
      confidence: Math.round(Math.max(0, Math.min(100, finalConfidence))),
      recommendation,
      reasoning: this.buildConsensusReasoning(gptResult, claudeResult, geminiResult),
      risk_level: riskLevel,
      price_target: priceTarget,
      stop_loss: stopLoss,
      time_horizon: this.getConsensusTimeHorizon(gptResult.time_horizon, claudeResult.time_horizon, geminiResult.time_horizon),
      ai_sources: {
        gpt: {
          confidence: gptConfidence,
          recommendation: gptResult.recommendation
        },
        claude: {
          confidence: claudeConfidence,
          recommendation: claudeResult.recommendation
        },
        gemini: {
          confidence: geminiConfidence,
          recommendation: geminiResult.recommendation
        }
      }
    };
  }

  // ... (rest of the methods remain the same)
  
  /**
   * 📊 Get consensus recommendation
   */
  getConsensusRecommendation(recommendations, confidence) {
    const [gptRec, claudeRec, geminiRec] = recommendations;
    
    // If all three AIs agree
    if (gptRec === claudeRec && claudeRec === geminiRec) return gptRec;
    
    // If confidence is low, default to HOLD
    if (confidence < config.ai.confidence.minimum) return 'HOLD';
    
    // Count votes for each recommendation
    const votes = {};
    recommendations.forEach(rec => {
      votes[rec] = (votes[rec] || 0) + 1;
    });
    
    // Find the recommendation with most votes
    const maxVotes = Math.max(...Object.values(votes));
    const consensusRecs = Object.keys(votes).filter(rec => votes[rec] === maxVotes);
    
    // If there's a clear majority (2+ votes)
    if (maxVotes >= 2) {
      return consensusRecs[0];
    }
    
    // If all three disagree, use priority mapping
    const priority = {
      'STRONG_BUY': 5,
      'BUY': 4,
      'HOLD': 3,
      'SELL': 2,
      'STRONG_SELL': 1
    };
    
    // Take the most conservative approach when all disagree
    return recommendations.sort((a, b) => priority[a] - priority[b])[0];
  }

  /**
   * ⚠️ Calculate risk level
   */
  calculateRiskLevel(gptResult, claudeResult, geminiResult, technicalData) {
    const risks = [gptResult.risk_level, claudeResult.risk_level, geminiResult.risk_level];
    const riskScores = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
    
    const avgRisk = risks.reduce((sum, risk) => sum + (riskScores[risk] || 2), 0) / risks.length;
    
    // Factor in volatility
    if (technicalData.volatility > 6) return 'HIGH';
    if (technicalData.volatility < 2 && avgRisk <= 1.5) return 'LOW';
    if (avgRisk <= 1.5) return 'LOW';
    if (avgRisk >= 2.5) return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * 🎯 Calculate consensus price target
   */
  calculateConsensusTarget(gptTarget, claudeTarget, geminiTarget) {
    const targets = [gptTarget, claudeTarget, geminiTarget].filter(t => t && !isNaN(t));
    if (targets.length === 0) return null;
    return targets.reduce((sum, target) => sum + target, 0) / targets.length;
  }

  /**
   * 🛑 Calculate consensus stop loss
   */
  calculateConsensusStopLoss(gptStop, claudeStop, geminiStop) {
    const stops = [gptStop, claudeStop, geminiStop].filter(s => s && !isNaN(s));
    if (stops.length === 0) return null;
    // Take the more conservative (closest) stop loss
    return Math.max(...stops);
  }

  /**
   * ⏰ Get consensus time horizon
   */
  getConsensusTimeHorizon(gptHorizon, claudeHorizon, geminiHorizon) {
    const horizons = [gptHorizon, claudeHorizon, geminiHorizon];
    
    // Count votes
    const votes = {};
    horizons.forEach(h => {
      votes[h] = (votes[h] || 0) + 1;
    });
    
    // Return majority vote, or default to MEDIUM
    const maxVotes = Math.max(...Object.values(votes));
    const consensus = Object.keys(votes).find(h => votes[h] === maxVotes);
    
    return maxVotes >= 2 ? consensus : 'MEDIUM';
  }

  /**
   * 📝 Build consensus reasoning
   */
  buildConsensusReasoning(gptResult, claudeResult, geminiResult) {
    const agreements = [];
    const disagreements = [];
    
    // Check recommendation consensus
    const recs = [gptResult.recommendation, claudeResult.recommendation, geminiResult.recommendation];
    const uniqueRecs = [...new Set(recs)];
    
    if (uniqueRecs.length === 1) {
      agreements.push('All 3 AIs agree on recommendation');
    } else if (uniqueRecs.length === 2) {
      agreements.push('Majority AI consensus on recommendation');
    } else {
      disagreements.push('AIs have different recommendations');
    }
    
    // Check confidence alignment
    const confidences = [gptResult.confidence, claudeResult.confidence, geminiResult.confidence];
    const maxConfDiff = Math.max(...confidences) - Math.min(...confidences);
    
    if (maxConfDiff < 20) {
      agreements.push('Similar confidence levels across all models');
    } else {
      disagreements.push('Varying confidence levels between models');
    }
    
    let reasoning = '';
    if (agreements.length > 0) {
      reasoning += `Consensus: ${agreements.join(', ')}. `;
    }
    if (disagreements.length > 0) {
      reasoning += `Note: ${disagreements.join(', ')}. `;
    }
    
    // Add key insight from the most confident model
    const mostConfident = [gptResult, claudeResult, geminiResult]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    reasoning += `Key insight: ${(mostConfident.reasoning || 'Market analysis pending').split('.')[0]}.`;
    
    return reasoning;
  }

  /**
   * 🔍 Parse AI response
   */
  parseAIResponse(content, source) {
    try {
      // Try to extract JSON from the response
      let jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      const required = ['confidence', 'recommendation', 'reasoning'];
      for (const field of required) {
        if (!(field in parsed)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      // Normalize values
      parsed.confidence = Math.max(0, Math.min(100, parseInt(parsed.confidence) || 50));
      parsed.source = source;
      
      return parsed;
    } catch (error) {
      logger.warn(`⚠️ Failed to parse ${source} response:`, error.message);
      return this.getMockAnalysis(source);
    }
  }

  /**
   * 🔑 Generate cache key for similar market conditions
   */
  generateCacheKey(symbol, marketConditions, technicalData, signalData) {
    const marketHash = this.hashMarketConditions(marketConditions);
    const technicalHash = this.hashTechnicalData(technicalData);
    const signalHash = this.hashSignalData(signalData);
    
    return `${symbol}_${marketHash}_${technicalHash}_${signalHash}`;
  }

  /**
   * 🧮 Hash market conditions for similarity matching
   */
  hashMarketConditions(conditions) {
    if (!conditions) return 'default';
    
    // Use configurable tolerances
    const tolerance = this.cacheConfig.tolerance;
    const price = Math.round((conditions.price || 0) / tolerance.price) * tolerance.price;
    const volume = Math.round((conditions.volume || 0) / tolerance.volume) * tolerance.volume;
    const change = Math.round((conditions.change || 0) * 2) / 2; // Round to nearest 0.5%
    
    return `p${price}_v${volume}_c${change}`;
  }

  /**
   * 📊 Hash technical data for similarity matching
   */
  hashTechnicalData(technical) {
    if (!technical) return 'default';
    
    // Use configurable tolerances
    const tolerance = this.cacheConfig.tolerance;
    const rsi = Math.round((technical.rsi || 50) / tolerance.rsi) * tolerance.rsi;
    const macd = technical.macd && typeof technical.macd.MACD === 'number' ? 
      Math.round(technical.macd.MACD / tolerance.macd) * tolerance.macd : 0;
    const bb = technical.bollingerBands ? 
      Math.round(technical.bollingerBands.position * 5) / 5 : 0; // Round to 0.2
    
    return `rsi${rsi}_macd${macd}_bb${bb}`;
  }

  /**
   * 📈 Hash signal data for similarity matching
   */
  hashSignalData(signal) {
    if (!signal) return 'default';
    
    const type = signal.type || 'unknown';
    const strength = Math.round((signal.strength || 0) * 10) / 10;
    const direction = signal.direction || 'neutral';
    
    return `${type}_${strength}_${direction}`;
  }

  /**
   * 💾 Get cached response if similar conditions exist
   */
  getCachedResponse(cacheKey) {
    if (!this.cacheConfig.enabled) return null;
    
    const cached = this.intelligentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheConfig.timeout) {
      this.cacheHits++;
      logger.info(`🎯 Cache hit for key: ${cacheKey.substring(0, 20)}...`);
      return cached.response;
    }
    return null;
  }

  /**
   * 💾 Store response in intelligent cache
   */
  setCachedResponse(cacheKey, response) {
    if (!this.cacheConfig.enabled) return;
    
    this.intelligentCache.set(cacheKey, {
      response: response,
      timestamp: Date.now()
    });
    
    // Clean old entries if cache gets too large
    if (this.intelligentCache.size > this.cacheConfig.maxSize) {
      this.cleanCache();
    }
  }

  /**
   * 📊 Get cache statistics
   */
  getCacheStats() {
    const hitRate = this.totalRequests > 0 ? 
      ((this.cacheHits / this.totalRequests) * 100).toFixed(2) : '0.00';
    
    return {
      cacheSize: this.intelligentCache.size,
      cacheHits: this.cacheHits,
      totalRequests: this.totalRequests,
      hitRate: `${hitRate}%`,
      estimatedSavings: `$${(this.cacheHits * 0.002).toFixed(3)}` // Approx $0.002 per call
    };
  }

  /**
   * 🧹 Clean expired cache entries
   */
  cleanCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.intelligentCache.entries()) {
      if (now - value.timestamp > this.cacheConfig.timeout) {
        this.intelligentCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * 🎲 Get mock analysis for testing
   */
  getMockAnalysis(source = 'MOCK') {
    const recommendations = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'];
    const riskLevels = ['LOW', 'MEDIUM', 'HIGH'];
    const timeHorizons = ['SHORT', 'MEDIUM', 'LONG'];
    
    return {
      confidence: Math.floor(Math.random() * 40) + 50, // 50-90%
      recommendation: recommendations[Math.floor(Math.random() * recommendations.length)],
      reasoning: `${source} mock analysis: Advanced pattern recognition suggests ${Math.random() > 0.5 ? 'bullish' : 'bearish'} momentum with ${Math.random() > 0.5 ? 'strong' : 'moderate'} conviction.`,
      risk_level: riskLevels[Math.floor(Math.random() * riskLevels.length)],
      price_target: null,
      stop_loss: null,
      time_horizon: timeHorizons[Math.floor(Math.random() * timeHorizons.length)],
      source
    };
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    this.requestCache.clear();
    this.intelligentCache.clear();
    this.cacheHits = 0;
    this.totalRequests = 0;
    logger.info('🧹 OpenAI Engine with intelligent caching cleaned up');
  }
}

module.exports = OpenAIEngine;