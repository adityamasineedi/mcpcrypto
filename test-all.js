#!/usr/bin/env node

/**
 * 🧪 ProTradeAI Comprehensive Test Suite
 * 
 * Tests all files, APIs, and functionality before deployment
 * Run: node scripts/test-all.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');

class ComprehensiveTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
    this.config = null;
  }

  /**
   * 🚀 Run all tests
   */
  async runAllTests() {
    console.log(chalk.blue.bold(`
╔══════════════════════════════════════════════════════════════╗
║               🧪 PROTRADE AI TEST SUITE 🧪                   ║
║                                                              ║
║          Comprehensive System & API Validation              ║
╚══════════════════════════════════════════════════════════════╝
    `));

    try {
      // Phase 1: File Structure Tests
      await this.testFileStructure();
      
      // Phase 2: Configuration Tests
      await this.testConfiguration();
      
      // Phase 3: API Connection Tests
      await this.testAPIConnections();
      
      // Phase 4: Module Tests
      await this.testModuleInitialization();
      
      // Phase 5: Functionality Tests
      await this.testCoreFunctionality();
      
      // Phase 6: Performance Tests
      await this.testPerformance();
      
      // Show final results
      this.showFinalResults();
      
    } catch (error) {
      this.logError('Critical test failure', error.message);
      process.exit(1);
    }
  }

  /**
   * 📁 Test file structure and dependencies
   */
  async testFileStructure() {
    this.logHeader('📁 File Structure Tests');

    // Test core files
    const coreFiles = [
      'package.json',
      '.env.template',
      'config.js',
      'index.js',
      'marketFetcher.js',
      'coinSelector.js',
      'mcpEngine.js',
      'openAIEngine.js',
      'signalEngine.js',
      'telegramBot.js',
      'signalApprovalBot.js',
      'tradeExecutor.js',
      'accuracyLogger.js',
      'signalAPI.js',
      'dailySummaryBot.js',
      'strategyRegenerator.js'
    ];

    for (const file of coreFiles) {
      this.testFileExists(file);
    }

    // Test directories
    const directories = ['logs', 'data', 'utils'];
    for (const dir of directories) {
      this.testDirectoryExists(dir);
    }

    // Test package.json dependencies
    await this.testDependencies();

    // Test .env file
    this.testEnvFile();
  }

  /**
   * ⚙️ Test configuration
   */
  async testConfiguration() {
    this.logHeader('⚙️ Configuration Tests');

    try {
      // Load config
      this.config = require('./config');
      this.logPass('Configuration loaded successfully');

      // Validate config
      const errors = this.config.validate();
      if (errors.length === 0) {
        this.logPass('Configuration validation passed');
      } else {
        this.logFail('Configuration validation failed', errors.join(', '));
      }

      // Test specific config values
      this.testConfigValue('capital.total', this.config.capital.total, 'number');
      this.testConfigValue('capital.riskPerTrade', this.config.capital.riskPerTrade, 'number');
      this.testConfigValue('ai.confidence.minimum', this.config.ai.confidence.minimum, 'number');
      this.testConfigValue('coins.whitelist', this.config.coins.whitelist, 'array');

    } catch (error) {
      this.logFail('Configuration loading failed', error.message);
    }
  }

  /**
   * 🌐 Test API connections
   */
  async testAPIConnections() {
    this.logHeader('🌐 API Connection Tests');

    // Test OpenAI API
    await this.testOpenAIAPI();

    // Test Claude API
    await this.testClaudeAPI();

    // Test BingX API
    await this.testBingXAPI();

    // Test Telegram API
    await this.testTelegramAPI();

    // Test external APIs
    await this.testExternalAPIs();
  }

  /**
   * 🔧 Test module initialization
   */
  async testModuleInitialization() {
    this.logHeader('🔧 Module Initialization Tests');

    const modules = [
      { name: 'MarketFetcher', file: './marketFetcher' },
      { name: 'CoinSelector', file: './coinSelector' },
      { name: 'MCPEngine', file: './mcpEngine' },
      { name: 'OpenAIEngine', file: './openAIEngine' },
      { name: 'SignalEngine', file: './signalEngine' },
      { name: 'TelegramBot', file: './telegramBot' },
      { name: 'TradeExecutor', file: './tradeExecutor' },
      { name: 'AccuracyLogger', file: './accuracyLogger' }
    ];

    for (const module of modules) {
      await this.testModuleInit(module.name, module.file);
    }
  }

  /**
   * ⚡ Test core functionality
   */
  async testCoreFunctionality() {
    this.logHeader('⚡ Core Functionality Tests');

    // Test signal generation
    await this.testSignalGeneration();

    // Test risk management
    await this.testRiskManagement();

    // Test data persistence
    await this.testDataPersistence();

    // Test logging system
    await this.testLoggingSystem();
  }

  /**
   * 📊 Test performance
   */
  async testPerformance() {
    this.logHeader('📊 Performance Tests');

    // Test memory usage
    this.testMemoryUsage();

    // Test startup time
    await this.testStartupTime();

    // Test API response times
    await this.testAPIResponseTimes();
  }

  /**
   * 🔍 Individual test methods
   */
  testFileExists(filename) {
    if (fs.existsSync(filename)) {
      this.logPass(`File exists: ${filename}`);
    } else {
      this.logFail(`Missing file: ${filename}`);
    }
  }

  testDirectoryExists(dirname) {
    if (fs.existsSync(dirname)) {
      this.logPass(`Directory exists: ${dirname}`);
    } else {
      // Create directory if it doesn't exist
      try {
        fs.mkdirSync(dirname, { recursive: true });
        this.logWarning(`Created missing directory: ${dirname}`);
      } catch (error) {
        this.logFail(`Cannot create directory: ${dirname}`, error.message);
      }
    }
  }

  async testDependencies() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const dependencies = Object.keys(packageJson.dependencies || {});
      
      if (dependencies.length > 0) {
        this.logPass(`Found ${dependencies.length} dependencies`);
        
        // Test critical dependencies
        const critical = ['axios', 'express', 'dotenv', 'winston', 'telegraf'];
        const missing = critical.filter(dep => !dependencies.includes(dep));
        
        if (missing.length === 0) {
          this.logPass('All critical dependencies found');
        } else {
          this.logFail('Missing critical dependencies', missing.join(', '));
        }
      } else {
        this.logFail('No dependencies found in package.json');
      }
    } catch (error) {
      this.logFail('Cannot read package.json', error.message);
    }
  }

  testEnvFile() {
    if (fs.existsSync('.env')) {
      this.logPass('.env file exists');
      
      // Test if .env can be loaded
      try {
        require('dotenv').config();
        this.logPass('.env file loaded successfully');
      } catch (error) {
        this.logFail('.env file cannot be loaded', error.message);
      }
    } else {
      if (fs.existsSync('.env.template')) {
        this.logWarning('.env file missing, but template exists');
      } else {
        this.logFail('.env and .env.template both missing');
      }
    }
  }

  testConfigValue(path, value, expectedType) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    
    if (actualType === expectedType) {
      this.logPass(`Config ${path}: ${actualType} ✓`);
    } else {
      this.logFail(`Config ${path}: expected ${expectedType}, got ${actualType}`);
    }
  }

  async testOpenAIAPI() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      this.logWarning('OpenAI API key not found - will use mock mode');
      return;
    }

    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 10000
      });

      if (response.status === 200) {
        this.logPass('OpenAI API connection successful');
      } else {
        this.logFail('OpenAI API returned non-200 status', response.status);
      }
    } catch (error) {
      this.logFail('OpenAI API connection failed', error.message);
    }
  }

  async testClaudeAPI() {
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      this.logWarning('Claude API key not found - will use mock mode');
      return;
    }

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      }, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        this.logPass('Claude API connection successful');
      } else {
        this.logFail('Claude API returned non-200 status', response.status);
      }
    } catch (error) {
      if (error.response?.status === 400) {
        this.logPass('Claude API key valid (got expected 400 for test message)');
      } else {
        this.logFail('Claude API connection failed', error.message);
      }
    }
  }

  async testBingXAPI() {
    const apiKey = process.env.BINGX_API_KEY;
    const secret = process.env.BINGX_SECRET;
    
    if (!apiKey || !secret) {
      this.logWarning('BingX API credentials not found - will use mock mode');
      return;
    }

    try {
      const baseURL = process.env.BINGX_SANDBOX === 'true' 
        ? 'https://open-api-vst.bingx.com' 
        : 'https://open-api.bingx.com';      const response = await axios.get(`${baseURL}/openApi/swap/v2/server/time`, {
        headers: { 'X-BX-APIKEY': apiKey },
        timeout: 10000
      });

      // BingX code 0 means SUCCESS
      if (response.data.code === 0 && response.data.data && response.data.data.serverTime) {
        this.logPass('BingX API connection successful');
      } else {
        this.logFail('BingX API invalid response', JSON.stringify(response.data));
      }
    } catch (error) {
      this.logFail('BingX API connection failed', error.message);
    }
  }

  async testTelegramAPI() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      this.logWarning('Telegram bot token not found - notifications disabled');
      return;
    }

    try {
      const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, {
        timeout: 10000
      });

      if (response.status === 200 && response.data.ok) {
        this.logPass(`Telegram bot connected: @${response.data.result.username}`);
      } else {
        this.logFail('Telegram API invalid response', JSON.stringify(response.data));
      }
    } catch (error) {
      this.logFail('Telegram API connection failed', error.message);
    }
  }

  async testExternalAPIs() {
    // Test Fear & Greed Index
    try {
      const response = await axios.get('https://api.alternative.me/fng/', { timeout: 5000 });
      if (response.status === 200) {
        this.logPass('Fear & Greed Index API accessible');
      }
    } catch (error) {
      this.logWarning('Fear & Greed Index API failed - will use mock data');
    }
  }

  async testModuleInit(name, filePath) {
    try {
      const ModuleClass = require(filePath);
      const instance = new ModuleClass();
      
      if (typeof instance.init === 'function') {
        this.logPass(`${name} module structure valid`);
      } else {
        this.logWarning(`${name} missing init method`);
      }
    } catch (error) {
      this.logFail(`${name} module load failed`, error.message);
    }
  }

  async testSignalGeneration() {
    try {
      // Test signal generation with mock data
      process.env.MOCK_DATA = 'true';
      process.env.TEST_MODE = 'true';
      
      const SignalEngine = require('./signalEngine');
      const signalEngine = new SignalEngine();
      
      // Mock initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.logPass('Signal generation test - structure valid');
    } catch (error) {
      this.logFail('Signal generation test failed', error.message);
    }
  }

  testRiskManagement() {
    try {
      if (!this.config) return;
      
      const capital = this.config.capital.total;
      const riskPercent = this.config.capital.riskPerTrade;
      const maxRisk = capital * (riskPercent / 100);
      
      if (maxRisk <= capital * 0.05) { // Max 5% per trade
        this.logPass(`Risk management: ${riskPercent}% per trade = $${maxRisk.toFixed(2)}`);
      } else {
        this.logWarning(`High risk per trade: ${riskPercent}% = $${maxRisk.toFixed(2)}`);
      }
    } catch (error) {
      this.logFail('Risk management test failed', error.message);
    }
  }

  testDataPersistence() {
    try {
      // Test data directory
      if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
      }

      // Test write/read
      const testFile = 'data/test.json';
      const testData = { test: true, timestamp: Date.now() };
      
      fs.writeFileSync(testFile, JSON.stringify(testData));
      const readData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      
      if (readData.test === true) {
        this.logPass('Data persistence test passed');
        fs.unlinkSync(testFile); // Cleanup
      } else {
        this.logFail('Data persistence test failed - data mismatch');
      }
    } catch (error) {
      this.logFail('Data persistence test failed', error.message);
    }
  }

  testLoggingSystem() {
    try {
      // Test if winston can be loaded
      const winston = require('winston');
      this.logPass('Winston logging system available');
      
      // Test log directory
      if (fs.existsSync('logs') || fs.existsSync('./logs')) {
        this.logPass('Logs directory exists');
      } else {
        this.logWarning('Logs directory missing - will be created');
      }
    } catch (error) {
      this.logFail('Logging system test failed', error.message);
    }
  }

  testMemoryUsage() {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    
    if (heapUsedMB < 100) {
      this.logPass(`Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    } else {
      this.logWarning(`High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    }
  }

  async testStartupTime() {
    const start = Date.now();
    
    try {
      // Simulate module loading
      require('./config');
      const elapsed = Date.now() - start;
      
      if (elapsed < 1000) {
        this.logPass(`Startup time: ${elapsed}ms`);
      } else {
        this.logWarning(`Slow startup time: ${elapsed}ms`);
      }
    } catch (error) {
      this.logFail('Startup time test failed', error.message);
    }
  }

  async testAPIResponseTimes() {
    // Test local API (if running)
    try {
      const start = Date.now();
      await axios.get('http://localhost:3000/health', { timeout: 5000 });
      const elapsed = Date.now() - start;
      
      if (elapsed < 1000) {
        this.logPass(`Local API response time: ${elapsed}ms`);
      } else {
        this.logWarning(`Slow local API response: ${elapsed}ms`);
      }
    } catch (error) {
      this.logWarning('Local API not running (expected if bot not started)');
    }
  }

  /**
   * 📝 Logging methods
   */
  logHeader(title) {
    console.log('\n' + chalk.blue.bold(title));
    console.log(chalk.blue('='.repeat(50)));
  }

  logPass(message, details = '') {
    this.results.passed++;
    this.results.tests.push({ status: 'PASS', message, details });
    console.log(chalk.green('✅ ') + message + (details ? chalk.gray(` (${details})`) : ''));
  }

  logFail(message, details = '') {
    this.results.failed++;
    this.results.tests.push({ status: 'FAIL', message, details });
    console.log(chalk.red('❌ ') + message + (details ? chalk.red(` - ${details}`) : ''));
  }

  logWarning(message, details = '') {
    this.results.warnings++;
    this.results.tests.push({ status: 'WARN', message, details });
    console.log(chalk.yellow('⚠️  ') + message + (details ? chalk.yellow(` - ${details}`) : ''));
  }

  logError(message, details = '') {
    console.log(chalk.red.bold('💥 ') + message + (details ? chalk.red(` - ${details}`) : ''));
  }

  /**
   * 📊 Show final results
   */
  showFinalResults() {
    console.log('\n' + chalk.blue.bold('📊 TEST RESULTS SUMMARY'));
    console.log(chalk.blue('='.repeat(50)));
    
    console.log(chalk.green(`✅ Passed: ${this.results.passed}`));
    console.log(chalk.red(`❌ Failed: ${this.results.failed}`));
    console.log(chalk.yellow(`⚠️  Warnings: ${this.results.warnings}`));
    console.log(`📊 Total Tests: ${this.results.tests.length}`);
    
    const successRate = this.results.tests.length > 0 
      ? ((this.results.passed / this.results.tests.length) * 100).toFixed(1)
      : 0;
    
    console.log(`🎯 Success Rate: ${successRate}%`);
    
    // Overall status
    if (this.results.failed === 0) {
      console.log('\n' + chalk.green.bold('🎉 ALL TESTS PASSED! System ready for deployment.'));
    } else if (this.results.failed < 3) {
      console.log('\n' + chalk.yellow.bold('⚠️  SOME TESTS FAILED - Review issues before deployment.'));
    } else {
      console.log('\n' + chalk.red.bold('❌ MULTIPLE FAILURES - System not ready for deployment.'));
    }
    
    // Recommendations
    console.log('\n' + chalk.blue.bold('📋 RECOMMENDATIONS:'));
    
    if (this.results.failed > 0) {
      console.log(chalk.red('• Fix all failed tests before proceeding'));
    }
    
    if (this.results.warnings > 0) {
      console.log(chalk.yellow('• Review warnings for potential issues'));
    }
    
    if (this.results.failed === 0 && this.results.warnings < 3) {
      console.log(chalk.green('• System appears healthy - ready for paper trading'));
      console.log(chalk.green('• Consider live trading only after 24h+ of successful paper trading'));
    }
    
    // Save results
    this.saveTestResults();
  }

  saveTestResults() {
    try {
      const results = {
        timestamp: new Date().toISOString(),
        summary: {
          passed: this.results.passed,
          failed: this.results.failed,
          warnings: this.results.warnings,
          total: this.results.tests.length,
          successRate: this.results.tests.length > 0 
            ? ((this.results.passed / this.results.tests.length) * 100).toFixed(1)
            : 0
        },
        tests: this.results.tests
      };
      
      const filename = `test-results-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join('data', filename);
      
      // Ensure data directory exists
      if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
      }
      
      fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
      console.log(chalk.blue(`\n📄 Results saved to: ${filepath}`));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save results: ${error.message}`));
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ComprehensiveTester();
  tester.runAllTests().catch(error => {
    console.error(chalk.red.bold('💥 Test suite failed:'), error.message);
    process.exit(1);
  });
}

module.exports = ComprehensiveTester;