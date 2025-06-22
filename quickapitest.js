#!/usr/bin/env node

/**
 * ⚡ Quick API Test - Fast validation of all API connections
 * Run: node scripts/quick-api-test.js
 */

const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

class QuickAPITester {
  constructor() {
    this.results = [];
  }

  async runQuickTests() {
    console.log(chalk.blue.bold('⚡ QUICK API CONNECTION TEST\n'));

    // Test all APIs in parallel for speed
    const tests = [
      this.testOpenAI(),
      this.testClaude(),
      this.testBingX(),
      this.testTelegram(),
      this.testFearGreed()
    ];

    await Promise.allSettled(tests);
    this.showResults();
  }

  async testOpenAI() {
    const name = 'OpenAI';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      this.addResult(name, 'SKIP', 'No API key provided');
      return;
    }

    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 10000
      });

      if (response.status === 200) {
        this.addResult(name, 'PASS', `${response.data.data.length} models available`);
      } else {
        this.addResult(name, 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult(name, 'FAIL', this.getErrorMessage(error));
    }
  }

  async testClaude() {
    const name = 'Claude';
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      this.addResult(name, 'SKIP', 'No API key provided');
      return;
    }

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      }, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: 10000
      });

      this.addResult(name, 'PASS', 'API responding correctly');
    } catch (error) {
      if (error.response?.status === 400) {
        this.addResult(name, 'PASS', 'API key valid');
      } else {
        this.addResult(name, 'FAIL', this.getErrorMessage(error));
      }
    }
  }

  async testBingX() {
    const name = 'BingX';
    const apiKey = process.env.BINGX_API_KEY;
    const secret = process.env.BINGX_SECRET;

    if (!apiKey || !secret) {
      this.addResult(name, 'SKIP', 'No API credentials provided');
      return;
    }

    try {
      const baseURL = process.env.BINGX_SANDBOX === 'true' 
        ? 'https://open-api-vst.bingx.com' 
        : 'https://open-api.bingx.com';

      const response = await axios.get(`${baseURL}/openApi/swap/v2/server/time`, {
        headers: { 'X-BX-APIKEY': apiKey },
        timeout: 10000
      });

      if (response.data && response.data.serverTime) {
        const serverTime = new Date(response.data.serverTime);
        const timeDiff = Math.abs(Date.now() - serverTime.getTime());
        this.addResult(name, 'PASS', `Server time sync: ${timeDiff}ms difference`);
      } else {
        this.addResult(name, 'FAIL', 'Invalid server response');
      }
    } catch (error) {
      this.addResult(name, 'FAIL', this.getErrorMessage(error));
    }
  }

  async testTelegram() {
    const name = 'Telegram';
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      this.addResult(name, 'SKIP', 'No bot token provided');
      return;
    }

    try {
      const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, {
        timeout: 10000
      });

      if (response.data.ok) {
        const bot = response.data.result;
        this.addResult(name, 'PASS', `Bot: @${bot.username}`);
      } else {
        this.addResult(name, 'FAIL', 'Bot validation failed');
      }
    } catch (error) {
      this.addResult(name, 'FAIL', this.getErrorMessage(error));
    }
  }

  async testFearGreed() {
    const name = 'Fear & Greed';

    try {
      const response = await axios.get('https://api.alternative.me/fng/', {
        timeout: 5000
      });

      if (response.data && response.data.data) {
        const fng = response.data.data[0];
        this.addResult(name, 'PASS', `Current: ${fng.value} (${fng.value_classification})`);
      } else {
        this.addResult(name, 'FAIL', 'Invalid response format');
      }
    } catch (error) {
      this.addResult(name, 'WARN', 'External API unavailable - will use mock data');
    }
  }

  addResult(name, status, message) {
    this.results.push({ name, status, message });
    
    const icon = {
      'PASS': '✅',
      'FAIL': '❌', 
      'WARN': '⚠️',
      'SKIP': '⏭️'
    }[status];

    const color = {
      'PASS': chalk.green,
      'FAIL': chalk.red,
      'WARN': chalk.yellow,
      'SKIP': chalk.gray
    }[status];

    console.log(`${icon} ${color(name.padEnd(12))} ${message}`);
  }

  getErrorMessage(error) {
    if (error.code === 'ENOTFOUND') return 'Network connection failed';
    if (error.code === 'ETIMEDOUT') return 'Request timeout';
    if (error.response?.status === 401) return 'Invalid API key';
    if (error.response?.status === 403) return 'API access forbidden';
    if (error.response?.status === 429) return 'Rate limit exceeded';
    if (error.response?.data?.error) return error.response.data.error.message || 'API error';
    return error.message;
  }

  showResults() {
    console.log('\n' + chalk.blue.bold('📊 QUICK TEST SUMMARY'));
    console.log(chalk.blue('='.repeat(30)));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARN').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`⏭️  Skipped: ${skipped}`);

    // Recommendations
    console.log('\n' + chalk.blue.bold('💡 RECOMMENDATIONS:'));

    if (failed === 0 && passed > 0) {
      console.log(chalk.green('✅ All available APIs working - ready to start bot'));
    }

    if (skipped > 0) {
      console.log(chalk.yellow('⚠️  Some APIs skipped due to missing keys - bot will use mock data'));
    }

    if (failed > 0) {
      console.log(chalk.red('❌ Fix failed API connections before starting bot'));
      
      const failedAPIs = this.results.filter(r => r.status === 'FAIL');
      failedAPIs.forEach(api => {
        console.log(chalk.red(`   • ${api.name}: ${api.message}`));
      });
    }

    // Bot mode recommendation
    console.log('\n' + chalk.blue.bold('🚀 RECOMMENDED BOT MODE:'));

    if (passed >= 2 && failed === 0) {
      console.log(chalk.green('📄 PAPER TRADING MODE - Start with: npm run paper'));
    } else if (failed > 0) {
      console.log(chalk.yellow('🧪 TEST MODE - Start with: npm run test'));
    } else {
      console.log(chalk.gray('🔧 SETUP REQUIRED - Add API keys to .env file'));
    }
  }
}

// Run if called directly
if (require.main === module) {
  const tester = new QuickAPITester();
  tester.runQuickTests().catch(error => {
    console.error(chalk.red.bold('💥 Quick test failed:'), error.message);
    process.exit(1);
  });
}

module.exports = QuickAPITester;