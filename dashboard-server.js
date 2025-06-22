#!/usr/bin/env node

/**
 * 🚀 ProTradeAI Dashboard Server (Mock Data Mode)
 * 
 * Simple server to demonstrate the dashboard with mock data
 * Use this when you want to see the dashboard without full bot initialization
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config');

const app = express();
const PORT = config.api.port || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock data generator
function generateMockData() {
  const now = Date.now();
  const startTime = now - 24 * 60 * 60 * 1000; // 24 hours ago
  
  return {
    // Account info
    account: {
      balance: {
        available: 1000 - 85.50, // Starting capital minus active trades
        inTrades: 85.50,
        total: 1000
      },
      positions: [
        {
          symbol: 'BTC',
          side: 'LONG',
          size: 0.002,
          entryPrice: 42750,
          currentPrice: 43100,
          pnl: 0.7,
          pnlPercent: 0.82
        },
        {
          symbol: 'ETH',
          side: 'SHORT',
          size: 0.035,
          entryPrice: 2650,
          currentPrice: 2625,
          pnl: 0.875,
          pnlPercent: 0.94
        }
      ],
      dailyStats: {
        trades: 3,
        wins: 2,
        losses: 1,
        profit: 8.75,
        winRate: 66.67
      },
      activePositions: 2,
      totalValue: 1008.75
    },
    
    // Recent signals (last 10)
    signals: [
      {
        id: 'BTC_' + (now - 300000),
        symbol: 'BTC',
        type: 'LONG',
        confidence: 78,
        strength: 'STRONG',
        entryPrice: 42750,
        currentPrice: 43100,
        timestamp: now - 300000,
        status: 'EXECUTED'
      },
      {
        id: 'ETH_' + (now - 600000),
        symbol: 'ETH',
        type: 'SHORT',
        confidence: 71,
        strength: 'MEDIUM',
        entryPrice: 2650,
        currentPrice: 2625,
        timestamp: now - 600000,
        status: 'EXECUTED'
      },
      {
        id: 'SOL_' + (now - 900000),
        symbol: 'SOL',
        type: 'LONG',
        confidence: 64,
        strength: 'WEAK',
        entryPrice: 58.50,
        currentPrice: 59.20,
        timestamp: now - 900000,
        status: 'EXPIRED'
      },
      {
        id: 'LINK_' + (now - 1200000),
        symbol: 'LINK',
        type: 'LONG',
        confidence: 82,
        strength: 'STRONG',
        entryPrice: 14.85,
        currentPrice: 15.25,
        timestamp: now - 1200000,
        status: 'CLOSED'
      }
    ],
    
    // Pending approvals (empty for auto-approval mode)
    pending: [],
    
    // Trading stats
    stats: {
      totalTrades: 47,
      winningTrades: 35,
      losingTrades: 12,
      winRate: 74.47,
      totalProfit: 142.85,
      dailyProfit: 8.75,
      weeklyProfit: 68.90,
      monthlyProfit: 142.85,
      avgConfidence: 73.2,
      bestTrade: 12.40,
      worstTrade: -4.20,
      profitFactor: 2.18,
      sharpeRatio: 1.85,
      maxDrawdown: 8.5
    },
    
    // System status
    status: {
      running: true,
      uptime: Math.floor(Math.random() * 86400), // Random uptime up to 24h
      mode: config.tradeMode || 'PAPER',
      timestamp: now,
      lastUpdate: now - Math.floor(Math.random() * 300000), // Last update within 5 minutes
      components: {
        signalEngine: true,
        tradeExecutor: true,
        telegramBot: true,
        marketData: true,
        ai: {
          openai: true,
          claude: true,
          gemini: true
        }
      }
    }
  };
}

// ============================================================================
// 🎯 DASHBOARD ROUTES
// ============================================================================

// Serve dashboard HTML
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Live dashboard data endpoint
app.get('/api/dashboard/live', (req, res) => {
  try {
    const liveData = generateMockData();
    res.json({ success: true, data: liveData });
  } catch (error) {
    console.error('API Error - dashboard live data:', error.message);
    res.status(500).json({ error: 'Failed to get live data' });
  }
});

// ============================================================================
// 🛡️ ADMIN ROUTES (Emergency Stop, etc.)
// ============================================================================

app.post('/api/admin/emergency-stop', (req, res) => {
  console.log('🛑 Emergency stop requested!');
  res.json({ success: true, message: 'Emergency stop activated (mock mode)' });
});

app.get('/api/admin/status', (req, res) => {
  res.json({
    success: true,
    mode: 'MOCK_DASHBOARD',
    message: 'Running dashboard with mock data for demonstration',
    timestamp: Date.now()
  });
});

// ============================================================================
// 🚀 START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🎯 PROTRADE AI DASHBOARD SERVER 🎯              ║
║                                                              ║
║                      📊 MOCK DATA MODE 📊                   ║
║                                                              ║
║  🌐 Dashboard: http://localhost:${PORT}/dashboard                ║
║  🔌 API: http://localhost:${PORT}/api/dashboard/live              ║
║                                                              ║
║  🎮 Use this to test the dashboard interface                ║
║  📈 Shows realistic demo data for development               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

✅ Server running on port ${PORT}
🎯 Visit: http://localhost:${PORT}/dashboard
🔄 Mock data updates every refresh
`);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down dashboard server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down dashboard server...');
  process.exit(0);
});
