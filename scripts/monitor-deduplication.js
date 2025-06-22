#!/usr/bin/env node

/**
 * 🔍 Real-time Signal Deduplication Monitor
 * Use this script to monitor the deduplication system while the bot is running
 */

const express = require('express');
const path = require('path');

const app = express();
const port = 3001;

// Simple in-memory store for demo (in real bot, this would connect to the actual SignalEngine)
let mockDeduplicationData = {
  activeLocks: [
    { symbol: 'BTC-USDT', type: 'LONG', ageMinutes: 5, confidence: 78, price: 50000 },
    { symbol: 'ETH-USDT', type: 'SHORT', ageMinutes: 12, confidence: 82, price: 3200 }
  ],
  recentSignalCounts: {
    'BTC-USDT': 2,
    'ETH-USDT': 1,
    'SOL-USDT': 3
  },
  dailySignalCounts: {
    'BTC-USDT': 4,
    'ETH-USDT': 2,
    'SOL-USDT': 5,
    'LINK-USDT': 1
  },
  summary: {
    totalActiveLocks: 2,
    symbolsWithRecentSignals: 3,
    totalDailySignals: 12
  }
};

app.use(express.static('public'));

// API endpoint for deduplication data
app.get('/api/deduplication', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    data: mockDeduplicationData,
    config: {
      updateInterval: '5 minutes',
      minSignalGap: '5 minutes', 
      duplicateWindow: '30 minutes',
      maxDailySignals: 12,
      minConfidence: '75%'
    }
  });
});

// HTML dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>ProTradeAI - Deduplication Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; }
        .status { display: flex; gap: 20px; flex-wrap: wrap; }
        .metric { flex: 1; min-width: 200px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 2em; font-weight: bold; color: #28a745; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: bold; }
        .refresh { text-align: center; margin: 20px 0; }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .timestamp { text-align: center; color: #666; font-size: 0.9em; }
        .good { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
    </style>
    <script>
        let data = {};
        
        async function fetchData() {
            try {
                const response = await fetch('/api/deduplication');
                data = await response.json();
                updateDisplay();
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        }
        
        function updateDisplay() {
            document.getElementById('totalLocks').textContent = data.data.summary.totalActiveLocks;
            document.getElementById('symbolsTracked').textContent = data.data.summary.symbolsWithRecentSignals;
            document.getElementById('dailySignals').textContent = data.data.summary.totalDailySignals;
            document.getElementById('timestamp').textContent = 'Last updated: ' + new Date(data.timestamp).toLocaleString();
            
            // Update active locks table
            const locksTable = document.getElementById('locksTable');
            locksTable.innerHTML = '<tr><th>Symbol</th><th>Type</th><th>Age (min)</th><th>Confidence</th><th>Price</th></tr>';
            data.data.activeLocks.forEach(lock => {
                const row = locksTable.insertRow();
                row.innerHTML = \`
                    <td>\${lock.symbol}</td>
                    <td>\${lock.type}</td>
                    <td>\${lock.ageMinutes}</td>
                    <td>\${lock.confidence}%</td>
                    <td>$\${lock.price.toLocaleString()}</td>
                \`;
            });
            
            // Update daily counts table
            const dailyTable = document.getElementById('dailyTable');
            dailyTable.innerHTML = '<tr><th>Symbol</th><th>Count</th><th>Status</th></tr>';
            Object.entries(data.data.dailySignalCounts).forEach(([symbol, count]) => {
                const row = dailyTable.insertRow();
                const status = count >= 10 ? 'warning' : count >= 8 ? 'good' : 'good';
                const statusText = count >= 10 ? 'High' : count >= 8 ? 'Normal' : 'Low';
                row.innerHTML = \`
                    <td>\${symbol}</td>
                    <td>\${count}</td>
                    <td class="\${status}">\${statusText}</td>
                \`;
            });
        }
        
        function startAutoRefresh() {
            fetchData();
            setInterval(fetchData, 30000); // Refresh every 30 seconds
        }
        
        document.addEventListener('DOMContentLoaded', startAutoRefresh);
    </script>
</head>
<body>
    <div class="container">
        <div class="card header">
            <h1>🔍 ProTradeAI - Signal Deduplication Monitor</h1>
            <p>Real-time monitoring of duplicate signal prevention system</p>
        </div>
        
        <div class="card">
            <h2>📊 Summary Statistics</h2>
            <div class="status">
                <div class="metric">
                    <h3>Active Locks</h3>
                    <div class="value" id="totalLocks">-</div>
                    <small>Symbols currently locked</small>
                </div>
                <div class="metric">
                    <h3>Symbols Tracked</h3>
                    <div class="value" id="symbolsTracked">-</div>
                    <small>Recent signal activity</small>
                </div>
                <div class="metric">
                    <h3>Daily Signals</h3>
                    <div class="value" id="dailySignals">-</div>
                    <small>Total signals today</small>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>🔒 Active Signal Locks</h2>
            <p>These symbols are currently locked to prevent duplicate signals:</p>
            <table id="locksTable">
                <tr><th>Symbol</th><th>Type</th><th>Age (min)</th><th>Confidence</th><th>Price</th></tr>
            </table>
        </div>
        
        <div class="card">
            <h2>📈 Daily Signal Counts</h2>
            <p>Number of signals generated per symbol today:</p>
            <table id="dailyTable">
                <tr><th>Symbol</th><th>Count</th><th>Status</th></tr>
            </table>
        </div>
        
        <div class="card">
            <h2>⚙️ Configuration</h2>
            <div class="status">
                <div class="metric">
                    <h3>Update Interval</h3>
                    <div class="value" style="font-size: 1.2em;">5 min</div>
                </div>
                <div class="metric">
                    <h3>Signal Gap</h3>
                    <div class="value" style="font-size: 1.2em;">5 min</div>
                </div>
                <div class="metric">
                    <h3>Duplicate Window</h3>
                    <div class="value" style="font-size: 1.2em;">30 min</div>
                </div>
                <div class="metric">
                    <h3>Max Daily</h3>
                    <div class="value" style="font-size: 1.2em;">12</div>
                </div>
            </div>
        </div>
        
        <div class="refresh">
            <button onclick="fetchData()">🔄 Refresh Now</button>
            <div class="timestamp" id="timestamp">-</div>
        </div>
    </div>
</body>
</html>
  `);
});

app.listen(port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🔍 DEDUPLICATION MONITOR DASHBOARD STARTED          ║
╚══════════════════════════════════════════════════════════════╝

📊 Monitor URL: http://localhost:${port}

Features:
• Real-time deduplication status
• Active signal locks tracking
• Daily signal count monitoring
• Auto-refresh every 30 seconds
• Configuration display

Note: This is a demo monitor. In production, connect to actual
SignalEngine.getSignalDebugInfo() for real data.

✅ Dashboard ready for monitoring!
  `);
});

// Simulate data updates for demo
setInterval(() => {
  // Simulate changing data
  mockDeduplicationData.activeLocks.forEach(lock => {
    lock.ageMinutes += Math.floor(Math.random() * 2);
  });
  
  // Occasionally add/remove locks
  if (Math.random() < 0.1) {
    const symbols = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'LINK-USDT'];
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    mockDeduplicationData.activeLocks.push({
      symbol: randomSymbol,
      type: Math.random() > 0.5 ? 'LONG' : 'SHORT',
      ageMinutes: 0,
      confidence: 70 + Math.floor(Math.random() * 20),
      price: 1000 + Math.floor(Math.random() * 50000)
    });
  }
  
  // Remove old locks
  mockDeduplicationData.activeLocks = mockDeduplicationData.activeLocks.filter(lock => lock.ageMinutes < 30);
  
  // Update summary
  mockDeduplicationData.summary.totalActiveLocks = mockDeduplicationData.activeLocks.length;
}, 60000); // Update every minute
