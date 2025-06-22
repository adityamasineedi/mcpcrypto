const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Add this dependency
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
      const { symbol, technicalData, marketContext, proposedSignal } = signalData;

      // Get AI analyses in parallel
      const [gptAnalysis, claudeAnalysis, geminiAnalysis] = await Promise.allSettled([
        this.getGPTAnalysis(symbol, technicalData, marketContext, proposedSignal),
        this.getClaudeAnalysis(symbol, technicalData, marketContext, proposedSignal),
        this.getGeminiAnalysis(symbol, technicalData, marketContext, proposedSignal)
      ]);

      // Extract results
      const gptResult = gptAnalysis.status === 'fulfilled' ? gptAnalysis.value : this.getMockAnalysis();
      const claudeResult = claudeAnalysis.status === 'fulfilled' ? claudeAnalysis.value : this.getMockAnalysis();
      const geminiResult = geminiAnalysis.status === 'fulfilled' ? geminiAnalysis.value : this.getMockAnalysis();

      // Calculate consensus
      const consensus = this.calculateAIConsensus(gptResult, claudeResult, geminiResult, technicalData);

      logger.info(`🤖 AI Analysis for ${symbol}:`, {
        gptConfidence: gptResult.confidence,
        claudeConfidence: claudeResult.confidence,
        geminiConfidence: geminiResult.confidence,
        finalConfidence: consensus.confidence,
        recommendation: consensus.recommendation
      });

      return consensus;
    } catch (error) {
      logger.error('❌ Error in AI signal analysis:', error.message);
      return this.getMockAnalysis();
    }
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
      logger.error('Full error details:', error);
      
      // If it's a 404 or auth error, disable Claude for this session
      if (error.status === 404 || error.status === 401 || error.status === 400) {
        logger.warn('⚠️ Claude API credentials invalid, disabling for session');
        this.claude = null;
      }
      return this.getMockAnalysis('Claude');
    }
  }

  /**
   * 💎 Get Gemini 2.0 Flash analysis
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

      const model = this.gemini.getGenerativeModel({ 
        model: config.ai.gemini.model || 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1000,
        }
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const analysis = this.parseAIResponse(text, 'Gemini-2.0');
      this.requestCache.set(cacheKey, analysis);

      return analysis;
    } catch (error) {
      logger.error('❌ Gemini analysis error:', error.message);
      logger.error('Full error details:', error);
      
      // If it's an auth error, disable Gemini for this session
      if (error.status === 403 || error.status === 401 || error.status === 400) {
        logger.warn('⚠️ Gemini API credentials invalid, disabling for session');
        this.gemini = null;
      }
      return this.getMockAnalysis('Gemini-2.0');
    }
  }

  /**
   * 📝 Build GPT prompt
   */
  buildGPTPrompt(symbol, technicalData, marketContext, proposedSignal) {
    return `Analyze this cryptocurrency trading signal for ${symbol}:

MARKET CONTEXT:
- Market Regime: ${marketContext.regime}
- Confidence: ${marketContext.confidence}%
- Fear & Greed: ${marketContext.fearGreedIndex}
- Sentiment: ${marketContext.sentiment}
- Volatility: ${marketContext.volatility}

TECHNICAL DATA:
- Current Price: $${technicalData.currentPrice}
- RSI: ${technicalData.rsi.toFixed(2)}
- MACD: ${technicalData.macd.macd.toFixed(4)} (Signal: ${technicalData.macd.signal.toFixed(4)})
- EMA 9: $${technicalData.ema9.toFixed(2)}
- EMA 21: $${technicalData.ema21.toFixed(2)}
- EMA 50: $${technicalData.ema50.toFixed(2)}
- Volume Ratio: ${technicalData.volumeRatio.toFixed(2)}x
- 24h Change: ${technicalData.change24h.toFixed(2)}%

PROPOSED SIGNAL:
- Type: ${proposedSignal.type}
- Strength: ${proposedSignal.strength}
- Entry Price: $${proposedSignal.entryPrice}
- Technical Confidence: ${proposedSignal.confidence}%

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
   * 📝 Build Claude prompt
   */
  buildClaudePrompt(symbol, technicalData, marketContext, proposedSignal) {
    return `As a cryptocurrency trading analyst, evaluate this ${symbol} signal:

🎯 SIGNAL EVALUATION REQUEST
${symbol} | ${proposedSignal.type} | Strength: ${proposedSignal.strength}

📊 MARKET DATA:
• Regime: ${marketContext.regime} (${marketContext.confidence}% confidence)
• Fear/Greed: ${marketContext.fearGreedIndex}/100
• Sentiment: ${marketContext.sentiment}
• Volatility: ${marketContext.volatility}

📈 TECHNICAL INDICATORS:
• Price: $${technicalData.currentPrice}
• RSI(14): ${technicalData.rsi.toFixed(1)}
• MACD: ${technicalData.macd.macd.toFixed(4)} vs Signal ${technicalData.macd.signal.toFixed(4)}
• EMAs: 9($${technicalData.ema9.toFixed(2)}) | 21($${technicalData.ema21.toFixed(2)}) | 50($${technicalData.ema50.toFixed(2)})
• Volume: ${technicalData.volumeRatio.toFixed(1)}x average
• 24h Change: ${technicalData.change24h.toFixed(1)}%

🎲 PROPOSED TRADE:
• Direction: ${proposedSignal.type}
• Entry: $${proposedSignal.entryPrice}
• Technical Score: ${proposedSignal.confidence}%

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
   * 📝 Build Gemini prompt
   */
  buildGeminiPrompt(symbol, technicalData, marketContext, proposedSignal) {
    return `As Gemini 2.0 Flash, analyze this ${symbol} trading signal with your speed and accuracy:

🎯 REAL-TIME SIGNAL ANALYSIS
Symbol: ${symbol} | Action: ${proposedSignal.type} | Strength: ${proposedSignal.strength}

📊 MARKET STATE:
• Regime: ${marketContext.regime} (${marketContext.confidence}% confidence)
• Fear/Greed: ${marketContext.fearGreedIndex}/100
• Sentiment: ${marketContext.sentiment}
• Volatility: ${marketContext.volatility}

📈 TECHNICAL SNAPSHOT:
• Price: $${technicalData.currentPrice}
• RSI: ${technicalData.rsi.toFixed(1)}
• MACD: ${technicalData.macd.macd.toFixed(4)} vs Signal ${technicalData.macd.signal.toFixed(4)}
• EMAs: 9($${technicalData.ema9.toFixed(2)}) | 21($${technicalData.ema21.toFixed(2)}) | 50($${technicalData.ema50.toFixed(2)})
• Volume: ${technicalData.volumeRatio.toFixed(1)}x average
• 24h Change: ${technicalData.change24h.toFixed(1)}%

🎲 PROPOSED EXECUTION:
• Direction: ${proposedSignal.type}
• Entry: $${proposedSignal.entryPrice}
• Technical Score: ${proposedSignal.confidence}%

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
    
    // Weight the confidences
    const weightedGPT = (gptResult.confidence * weights.gpt4Weight) / 100;
    const weightedClaude = (claudeResult.confidence * weights.claudeWeight) / 100;
    const weightedGemini = (geminiResult.confidence * weights.geminiWeight) / 100;
    const weightedTechnical = (technicalData.technicalScore * weights.technicalWeight) / 100;
    
    // Calculate final confidence - ensure it's not null
    let finalConfidence = weightedGPT + weightedClaude + weightedGemini + weightedTechnical;
  
  // Ensure finalConfidence is a valid number
  if (isNaN(finalConfidence) || finalConfidence === null || finalConfidence === undefined) {
    finalConfidence = Math.max(gptResult.confidence, claudeResult.confidence, geminiResult.confidence, technicalData.technicalScore || 50);
  }
  
  // Ensure finalConfidence is a valid number
  if (isNaN(finalConfidence) || finalConfidence === null || finalConfidence === undefined) {
    finalConfidence = Math.max(gptResult.confidence, claudeResult.confidence, geminiResult.confidence, technicalData.technicalScore || 50);
  }
    
    // Ensure finalConfidence is a valid number
    if (isNaN(finalConfidence) || finalConfidence === null || finalConfidence === undefined) {
      finalConfidence = Math.max(gptResult.confidence, claudeResult.confidence, geminiResult.confidence, technicalData.technicalScore || 50);
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
          confidence: gptResult.confidence,
          recommendation: gptResult.recommendation
        },
        claude: {
          confidence: claudeResult.confidence,
          recommendation: claudeResult.recommendation
        },
        gemini: {
          confidence: geminiResult.confidence,
          recommendation: geminiResult.recommendation
        }
      }
    };
  }

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
    
    const avgRisk = risks.reduce((sum, risk) => sum + riskScores[risk], 0) / risks.length;
    
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
      .sort((a, b) => b.confidence - a.confidence)[0];
    reasoning += `Key insight: ${mostConfident.reasoning.split('.')[0]}.`;
    
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
      parsed.confidence = Math.max(0, Math.min(100, parseInt(parsed.confidence)));
      parsed.source = source;
      
      return parsed;
    } catch (error) {
      logger.warn(`⚠️ Failed to parse ${source} response:`, error.message);
      return this.getMockAnalysis(source);
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
   * 🔮 Generate daily strategy refresh
   */
  async generateDailyStrategy(marketContext, coinAnalysis) {
    try {
      const prompt = `Generate 3 fresh trading strategies for today's crypto market:

MARKET CONTEXT:
- Regime: ${marketContext.regime}
- Fear & Greed: ${marketContext.fearGreedIndex}
- Sentiment: ${marketContext.sentiment}
- Top Coins: ${coinAnalysis.slice(0, 5).map(c => c.symbol).join(', ')}

Requirements:
- Low-risk setups with 75%+ win potential
- $50+ daily profit target
- Suitable for ${config.capital.total} account
- Maximum ${config.capital.maxConcurrentTrades} positions

Return JSON with 3 strategies:
{
  "strategies": [
    {
      "name": "strategy name",
      "description": "brief description",
      "coins": ["COIN1", "COIN2"],
      "setup": "entry conditions",
      "risk": "LOW|MEDIUM|HIGH",
      "profit_potential": "daily $ estimate"
    }
  ]
}`;

      if (this.openai && !config.testMode) {
        const response = await this.openai.chat.completions.create({
          model: config.ai.openai.model,
          messages: [
            { role: "system", content: "You are a crypto strategy generator. Return valid JSON only." },
            { role: "user", content: prompt }
          ],
          max_tokens: 800,
          temperature: 0.7
        });
        
        return this.parseAIResponse(response.choices[0].message.content, 'Strategy');
      }
      
      return this.getMockDailyStrategy();
    } catch (error) {
      logger.error('❌ Error generating daily strategy:', error.message);
      return this.getMockDailyStrategy();
    }
  }

  /**
   * 🎲 Mock daily strategy
   */
  getMockDailyStrategy() {
    return {
      strategies: [
        {
          name: "EMA Breakout",
          description: "9/21 EMA crossover with volume confirmation",
          coins: ["BTC", "ETH"],
          setup: "Price above EMAs + volume spike",
          risk: "LOW",
          profit_potential: "$20-30"
        },
        {
          name: "RSI Reversal",
          description: "Oversold RSI bounce in uptrend",
          coins: ["SOL", "LINK"],
          setup: "RSI < 35 + bullish divergence",
          risk: "MEDIUM",
          profit_potential: "$15-25"
        },
        {
          name: "MACD Momentum",
          description: "MACD histogram growing + trend alignment",
          coins: ["ADA", "DOT"],
          setup: "MACD > signal + increasing histogram",
          risk: "LOW",
          profit_potential: "$10-20"
        }
      ]
    };
  }

  /**
   * 🧹 Cleanup resources
   */
  cleanup() {
    this.requestCache.clear();
    logger.info('🧹 OpenAI Engine with latest models cleaned up');
  }
}

module.exports = OpenAIEngine;