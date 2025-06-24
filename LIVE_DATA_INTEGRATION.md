# 🌟 Live Data Integration Guide

## Overview

The ProTradeAI dashboard now supports **live data integration** with intelligent fallback to file-based and mock data. This guide explains how to use the enhanced system.

## 🎯 Data Sources

The dashboard automatically detects and uses data in this priority order:

1. **LIVE** - Direct connection to running ProTradeAI bot instance
2. **FILES** - Real trading data stored in JSON files (`data/signals.json`, `data/trades.json`, etc.)
3. **DEMO** - Mock/simulated data for demonstration

## 🚀 Usage

### Option 1: Live Bot Integration (Recommended)

When you start the main ProTradeAI bot, the dashboard automatically connects:

```bash
# Start the main bot - dashboard auto-connects
node index.js
```

The dashboard will show **LIVE** indicator and display real-time bot data.

### Option 2: File-Based Data

If the main bot isn't running, the dashboard reads from data files:

```bash
# Start dashboard server separately
node dashboard-server.js
```

The dashboard will show **FILES** indicator and use stored trading data.

### Option 3: Demo Mode

If no live bot or files are available, demo data is used:

The dashboard will show **DEMO** indicator for demonstration purposes.

## 🔍 Dashboard Features

### Data Source Indicators

- 🟢 **LIVE** - Real-time bot connection, 🟢 green dot
- 🔵 **FILES** - File-based data, 🔵 blue dot  
- 🟡 **DEMO** - Mock data, 🟡 yellow dot

### Real-Time Updates

- **Live Mode**: Updates every 5 seconds from running bot
- **Files Mode**: Updates when files change (less frequent)
- **Demo Mode**: Simulated updates for testing

## 📊 API Endpoints

### `/api/dashboard/live`
Returns comprehensive dashboard data including:
- Account balances and positions
- Recent signals and trades
- Performance metrics
- Data source information

### `/api/signals/tracking`
Returns active signal tracking information

## 🛠️ Integration Details

### Auto-Connection

The dashboard automatically connects to the main bot when both are running:

```javascript
// In index.js - auto-connects dashboard
const bot = new ProTradeAI();
await bot.init(); // Dashboard connection happens here
```

### Manual Connection

You can also manually connect the dashboard:

```javascript
const DashboardServer = require('./dashboard-server');
DashboardServer.connectLiveBot(botInstance);
```

### Data Structure

Live data includes:

```javascript
{
  account: {
    balance: { available, inTrades, total },
    positions: [...],
    dailyStats: { trades, wins, losses, profit, winRate }
  },
  signals: [...], // Recent signals
  trades: [...],  // Recent trades
  performance: { winRate, totalProfit, totalTrades, avgProfit },
  lastUpdate: timestamp,
  source: 'LIVE' | 'FILES' | 'MOCK'
}
```

## 🔧 Configuration

### Port Configuration

Default port is 3000, configurable in `config.js`:

```javascript
api: {
  port: 3000
}
```

### Cache Settings

Live data is cached for 5 seconds to reduce load:

```javascript
cacheTimeout: 5000 // milliseconds
```

## 🐛 Troubleshooting

### Dashboard shows DEMO instead of LIVE

- ✅ Check if main bot is running: `node index.js`
- ✅ Verify bot initialization completed successfully
- ✅ Check console for connection messages

### Dashboard shows FILES instead of LIVE

- ✅ Ensure both bot and dashboard are running
- ✅ Check that dashboard-server connects after bot starts
- ✅ Verify no errors in bot initialization

### No data in FILES mode

- ✅ Check if `data/signals.json` and `data/trades.json` exist
- ✅ Verify files contain valid JSON
- ✅ Check file permissions

### Performance Issues

- ✅ Live mode: Reduce polling frequency in React component
- ✅ Files mode: Check file sizes and read performance
- ✅ Demo mode: Reduce mock data complexity

## 🚀 Testing

### Test Live Integration

```bash
# Run integration test
node test-live-integration.js
```

### Test API Endpoints

```bash
# PowerShell
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/dashboard/live"
$response.data.source  # Should show LIVE, FILES, or MOCK
```

### Test Signal Tracking

```bash
# Add a demo signal
curl -X POST http://localhost:3000/api/signals/track \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","type":"LONG","entryPrice":43000,"confidence":78}'
```

## 📈 Benefits

1. **Real-Time Monitoring** - Live bot performance and signals
2. **Graceful Degradation** - Works even when bot is offline
3. **Historical Analysis** - Access to stored trading data
4. **Demo Capability** - Test features without live trading
5. **Performance Optimized** - Intelligent caching and data fetching

## 🔮 Future Enhancements

- [ ] WebSocket for real-time updates
- [ ] Historical data visualization
- [ ] Advanced filtering and search
- [ ] Mobile-responsive design
- [ ] Multi-bot support
- [ ] Custom dashboard layouts
