#!/usr/bin/env node

/**
 * 🧪 Test Signal Generation Manually
 * Run: node test-signals.js
 */

require('dotenv').config();

// Set test environment
process.env.MOCK_DATA = 'true';
process.env.AI_MIN_CONFIDENCE = '35'; // Lower threshold for testing
process.env.UPDATE_INTERVAL = '30000'; // 30 seconds

const SignalEngine = require('./signalEngine');
const MCPEngine = require('./mcpEngine');
const TelegramBot = require('./telegramBot');

async function testSignalGeneration() {
  console.log('🧪 Testing Manual Signal Generation...\n');

  try {
    // Initialize components
    const mcpEngine = new MCPEngine();
    const signalEngine = new SignalEngine();
    const telegramBot = new TelegramBot();

    await mcpEngine.init();
    await signalEngine.init();
    await telegramBot.init();

    console.log('✅ All components initialized\n');

    // Force signal generation
    console.log('🔍 Generating signals...');
    const signals = await signalEngine.generateSignals();

    console.log(`📊 Generated ${signals.length} signals:\n`);

    for (const signalItem of signals) {
      const signal = signalItem.signal;
      console.log(`🎯 Signal: ${signal.symbol} ${signal.type}`);
      console.log(`   Confidence: ${signal.finalConfidence}%`);
      console.log(`   Entry: $${signal.entryPrice.toFixed(4)}`);
      console.log(`   Risk: ${signal.risk}`);
      console.log(`   Reasoning: ${signal.technical.reasoning}`);
      console.log('');

      // Send to Telegram
      if (telegramBot) {
        await telegramBot.sendSignal(signal);
        console.log(`📱 Sent to Telegram: ${signal.symbol}\n`);
      }
    }

    if (signals.length === 0) {
      console.log('❌ No signals generated. Trying with lower confidence...');
      
      // Try with even lower confidence
      process.env.AI_MIN_CONFIDENCE = '25';
      const retrySignals = await signalEngine.generateSignals();
      console.log(`🔄 Retry generated ${retrySignals.length} signals`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSignalGeneration();