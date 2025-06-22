#!/usr/bin/env node

/**
 * 🔧 Signal Configuration Summary - More Signals Settings
 */

require('dotenv').config();

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           📊 UPDATED SIGNAL SETTINGS - MORE SIGNALS         ║
╚══════════════════════════════════════════════════════════════╝

🔧 CONFIDENCE THRESHOLDS (REDUCED FOR MORE SIGNALS):
• AI Minimum Confidence: ${process.env.AI_MIN_CONFIDENCE}% (was 75%)
• Signal Quality Minimum: ${process.env.MIN_SIGNAL_CONFIDENCE}% (was 75%)
• Technical Minimum: ${process.env.TECH_MIN_CONFIDENCE}% (was 70%)

⏰ TIMING SETTINGS (FASTER FOR MORE SIGNALS):
• Update Interval: ${process.env.UPDATE_INTERVAL / 1000} seconds (was 180s)
• Min Signal Gap: ${process.env.MIN_SIGNAL_GAP / 60000} minutes (was 15min)
• Max Daily Signals: ${process.env.MAX_DAILY_SIGNALS} per symbol (was 8)
• Duplicate Window: ${process.env.DUPLICATE_TIME_WINDOW / 60000} minutes (was 30min)

🚫 SIGNAL BLOCKING:
• Block HOLD Signals: ${process.env.BLOCK_HOLD_SIGNALS}
• Block WEAK Signals: ${process.env.BLOCK_WEAK_SIGNALS} (now allows WEAK for more signals)

✅ EXPECTED CHANGES:
• More signals due to lower confidence thresholds
• WEAK signals now allowed (was blocked)
• More frequent signal generation (2 minutes vs 3 minutes)
• Shorter gap between signals (10 minutes vs 15 minutes)
• More daily signals allowed (12 vs 8)
• Faster duplicate detection window (20 minutes vs 30 minutes)

📊 SIGNAL TYPES NOW ALLOWED:
• LONG/SHORT with WEAK/MEDIUM/STRONG strength
• 60%+ AI confidence (instead of 75%)
• 65%+ final confidence (instead of 75%)
• 60%+ technical confidence (instead of 70%)
• 10+ minutes apart (instead of 15 minutes)
• Up to 12 per day per symbol (instead of 8)

⚠️ QUALITY vs QUANTITY BALANCE:
• Still blocks HOLD signals (non-actionable)
• Still maintains reasonable confidence thresholds
• Still prevents spam with time gaps
• Still limits daily signals per symbol
• Better balance between quality and quantity

🎯 RESULT: You'll now receive more trading signals while maintaining
reasonable quality standards and duplicate prevention!
`);

// Test what signals would now be allowed
const testSignals = [
  { symbol: 'BTC', type: 'LONG', strength: 'WEAK', confidence: 62 },
  { symbol: 'ETH', type: 'SHORT', strength: 'MEDIUM', confidence: 66 },
  { symbol: 'SOL', type: 'HOLD', strength: 'STRONG', confidence: 70 },
  { symbol: 'ADA', type: 'LONG', strength: 'STRONG', confidence: 68 },
  { symbol: 'DOT', type: 'SHORT', strength: 'WEAK', confidence: 61 }
];

console.log('🧪 SIGNAL FILTERING TEST WITH NEW SETTINGS:\n');

testSignals.forEach((signal, i) => {
  const blocked = 
    signal.type === 'HOLD' ||
    signal.confidence < parseInt(process.env.MIN_SIGNAL_CONFIDENCE);
  
  const status = blocked ? '❌ BLOCKED' : '✅ ALLOWED';
  const reason = blocked ? 
    (signal.type === 'HOLD' ? '(HOLD signal)' :
     signal.confidence < parseInt(process.env.MIN_SIGNAL_CONFIDENCE) ? '(Low confidence)' : '') : 
    '(Meets criteria)';
  
  console.log(`${i+1}. ${signal.symbol} ${signal.type} ${signal.strength} (${signal.confidence}%) → ${status} ${reason}`);
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🎉 SETTINGS UPDATED FOR MORE SIGNALS WITH QUALITY CONTROL  ║
╚══════════════════════════════════════════════════════════════╝
`);
