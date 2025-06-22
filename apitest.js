#!/usr/bin/env node

/**
 * 🔧 API Connection Test Script
 * 
 * This script tests all API connections and provides diagnostics
 * for the ProTradeAI bot before running the main application.
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Color console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

class APITester {
  constructor() {
    this.results = {
      bingx: { status: 'pending', message: '', details: {} },
      openai: { status: 'pending', message: '', details: {} },
      claude: { status: 'pending', message: '', details: {} },
      gemini: { status: 'pending', message: '', details: {} },
      telegram: { status: 'pending', message: '', details: {} }
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  /**
   * 🏦 Test BingX API Connection
   */
  async testBingXAPI() {
    this.log('🔧 Testing BingX API...', 'blue');
    
    try {
      const apiKey = process.env.BINGX_API_KEY;
      const secret = process.env.BINGX_SECRET;
      const sandbox = process.env.BINGX_SANDBOX === 'true';
      
      if (!apiKey || !secret) {
        this.results.bingx = {
          status: 'error',
          message: 'API credentials not found',
          details: { missing: ['BINGX_API_KEY', 'BINGX_SECRET'].filter(key => !process.env[key]) }
        };
        return;
      }

      const baseURL = sandbox 
        ? 'https://open-api-vst.bingx.com' 
        : 'https://open-api.bingx.com';

      // Test 1: Server time (no auth required)
      this.log('  • Testing server connection...', 'yellow');
      const timeResponse = await axios.get(`${baseURL}/openApi/swap/v2/server/time`, {
        timeout: 10000
      });

      if (timeResponse.status !== 200) {
        throw new Error(`Server time request failed: ${timeResponse.status}`);
      }

      // Test 2: Authenticated endpoint (user balance)
      this.log('  • Testing authenticated endpoint...', 'yellow');
      const timestamp = Date.now();
      const endpoint = '/openApi/user/balance';
      const queryString = '';
      
      const signaturePayload = `${timestamp}GET${endpoint}${queryString}`;
      const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
      
      const authResponse = await axios.get(`${baseURL}/openApi/user/balance`, {
        headers: {
          'X-BX-APIKEY': apiKey,
          'X-BX-TIMESTAMP': timestamp,
          'X-BX-SIGNATURE': signature,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      // Test 3: Market data endpoint
      this.log('  • Testing market data...', 'yellow');
      const marketResponse = await axios.get(`${baseURL}/openApi/swap/v2/quote/price`, {
        params: { symbol: 'BTC-USDT' },
        timeout: 10000
      });

      this.results.bingx = {
        status: 'success',
        message: `Connected to BingX ${sandbox ? '(Sandbox)' : '(Live)'}`,
        details: {
          serverTime: timeResponse.data,
          auth: authResponse.status === 200,
          marketData: marketResponse.status === 200,
          baseURL
        }
      };

    } catch (error) {
      this.results.bingx = {
        status: 'error',
        message: error.message,
        details: { 
          errorCode: error.response?.status,
          errorData: error.response?.data 
        }
      };
    }
  }

  /**
   * 🤖 Test OpenAI API
   */
  async testOpenAI() {
    this.log('🔧 Testing OpenAI API...', 'blue');
    
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        this.results.openai = {
          status: 'warning',
          message: 'OpenAI API key not found - will use mock responses',
          details: {}
        };
        return;
      }

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: 'Test connection. Respond with: "Connection successful"' }
        ],
        max_tokens: 20
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      this.results.openai = {
        status: 'success',
        message: 'OpenAI API connection successful',
        details: {
          model: 'gpt-4o',
          response: response.data.choices[0].message.content
        }
      };

    } catch (error) {
      this.results.openai = {
        status: 'error',
        message: `OpenAI API error: ${error.response?.data?.error?.message || error.message}`,
        details: { errorCode: error.response?.status }
      };
    }
  }

  /**
   * 🎭 Test Claude API
   */
  async testClaude() {
    this.log('🔧 Testing Claude API...', 'blue');
    
    try {
      const apiKey = process.env.CLAUDE_API_KEY;
      
      if (!apiKey) {
        this.results.claude = {
          status: 'warning',
          message: 'Claude API key not found - will use mock responses',
          details: {}
        };
        return;
      }

      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 20,
        messages: [
          { role: 'user', content: 'Test connection. Respond with: "Connection successful"' }
        ]
      }, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      });

      this.results.claude = {
        status: 'success',
        message: 'Claude API connection successful',
        details: {
          model: 'claude-3-5-sonnet-20241022',
          response: response.data.content[0].text
        }
      };

    } catch (error) {
      this.results.claude = {
        status: 'error',
        message: `Claude API error: ${error.response?.data?.error?.message || error.message}`,
        details: { errorCode: error.response?.status }
      };
    }
  }

  /**
   * 💎 Test Gemini API
   */
  async testGemini() {
    this.log('🔧 Testing Gemini API...', 'blue');
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        this.results.gemini = {
          status: 'warning',
          message: 'Gemini API key not found - will use mock responses',
          details: {}
        };
        return;
      }

      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        contents: [
          {
            parts: [
              { text: 'Test connection. Respond with: "Connection successful"' }
            ]
          }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      this.results.gemini = {
        status: 'success',
        message: 'Gemini API connection successful',
        details: {
          model: 'gemini-2.0-flash-exp',
          response: response.data.candidates[0].content.parts[0].text
        }
      };

    } catch (error) {
      this.results.gemini = {
        status: 'error',
        message: `Gemini API error: ${error.response?.data?.error?.message || error.message}`,
        details: { errorCode: error.response?.status }
      };
    }
  }

  /**
   * 📱 Test Telegram Bot
   */
  async testTelegram() {
    this.log('🔧 Testing Telegram Bot...', 'blue');
    
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (!botToken) {
        this.results.telegram = {
          status: 'warning',
          message: 'Telegram bot token not found - notifications disabled',
          details: {}
        };
        return;
      }

      // Test bot info
      const botResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, {
        timeout: 10000
      });

      if (!chatId) {
        this.results.telegram = {
          status: 'warning',
          message: 'Telegram chat ID not set - notifications will not work',
          details: { botInfo: botResponse.data.result }
        };
        return;
      }

      // Test sending message
      const messageResponse = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: '🧪 API Test: Telegram connection successful',
        parse_mode: 'HTML'
      }, {
        timeout: 10000
      });

      this.results.telegram = {
        status: 'success',
        message: 'Telegram bot connection successful',
        details: {
          botInfo: botResponse.data.result,
          messageId: messageResponse.data.result.message_id
        }
      };

    } catch (error) {
      this.results.telegram = {
        status: 'error',
        message: `Telegram API error: ${error.response?.data?.description || error.message}`,
        details: { errorCode: error.response?.status }
      };
    }
  }

  /**
   * 🧪 Run all tests
   */
  async runAllTests() {
    this.log('\n🚀 ProTradeAI API Connection Test', 'bright');
    this.log('=====================================\n', 'blue');

    // Test all APIs
    await Promise.all([
      this.testBingXAPI(),
      this.testOpenAI(),
      this.testClaude(),
      this.testGemini(),
      this.testTelegram()
    ]);

    // Display results
    this.displayResults();
    
    // Provide recommendations
    this.displayRecommendations();
  }

  /**
   * 📊 Display test results
   */
  displayResults() {
    this.log('\n📊 Test Results:', 'bright');
    this.log('================\n', 'blue');

    Object.entries(this.results).forEach(([api, result]) => {
      const statusColor = result.status === 'success' ? 'green' : 
                         result.status === 'warning' ? 'yellow' : 'red';
      const statusIcon = result.status === 'success' ? '✅' : 
                        result.status === 'warning' ? '⚠️' : '❌';
      
      this.log(`${statusIcon} ${api.toUpperCase()}: ${result.message}`, statusColor);
      
      if (result.details && Object.keys(result.details).length > 0) {
        Object.entries(result.details).forEach(([key, value]) => {
          if (typeof value === 'object') {
            this.log(`   ${key}: ${JSON.stringify(value)}`, 'reset');
          } else {
            this.log(`   ${key}: ${value}`, 'reset');
          }
        });
      }
      this.log('');
    });
  }

  /**
   * 💡 Display recommendations
   */
  displayRecommendations() {
    this.log('💡 Recommendations:', 'bright');
    this.log('=================\n', 'blue');

    const errors = Object.values(this.results).filter(r => r.status === 'error');
    const warnings = Object.values(this.results).filter(r => r.status === 'warning');

    if (errors.length === 0 && warnings.length === 0) {
      this.log('🎉 All systems operational! You can start the trading bot.', 'green');
      this.log('\nRun: npm start', 'bright');
      return;
    }

    if (this.results.bingx.status === 'error') {
      this.log('🔧 BingX Issues:', 'red');
      this.log('  • Check your API credentials in .env file');
      this.log('  • Verify API key has trading permissions');
      this.log('  • Consider using sandbox mode for testing (BINGX_SANDBOX=true)');
      this.log('  • Check BingX API documentation for rate limits\n');
    }

    if (warnings.filter(w => ['openai', 'claude', 'gemini'].some(api => this.results[api].status === 'warning')).length >= 2) {
      this.log('⚠️ AI Model Access:', 'yellow');
      this.log('  • At least 2 AI APIs are recommended for best signal quality');
      this.log('  • You can still run with mock AI responses for testing');
      this.log('  • Get API keys from: OpenAI, Anthropic (Claude), Google (Gemini)\n');
    }

    if (this.results.telegram.status !== 'success') {
      this.log('📱 Telegram Setup:', 'yellow');
      this.log('  • Create a bot: message @BotFather on Telegram');
      this.log('  • Get your chat ID: message @userinfobot');
      this.log('  • Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env\n');
    }

    // Environment recommendations
    this.log('🔧 Environment Setup:', 'blue');
    this.log('  • For testing: Set TRADE_MODE=paper and MOCK_DATA=true');
    this.log('  • For live trading: Set TRADE_MODE=live with valid BingX credentials');
    this.log('  • Adjust risk settings in .env file before starting\n');

    if (errors.length > 0) {
      this.log('❌ Critical errors found. Please fix them before starting the bot.', 'red');
    } else {
      this.log('✅ You can start the bot, but consider fixing warnings for optimal performance.', 'green');
      this.log('\nRun: npm start', 'bright');
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new APITester();
  tester.runAllTests().catch(error => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
  });
}

module.exports = APITester;