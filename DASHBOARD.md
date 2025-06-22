# 🎯 ProTradeAI Dashboard

## 📊 Overview
The ProTradeAI Dashboard provides a real-time web interface to monitor your trading bot's performance, signals, and system status.

## 🚀 Quick Start

### Option 1: With Mock Data (Recommended for Testing)
```bash
npm run dashboard
```
Then visit: http://localhost:3000/dashboard

### Option 2: With Live Bot Data
```bash
npm run paper  # Start in paper trading mode
```
The dashboard will be available at: http://localhost:3000/dashboard

## 📈 Features

### Real-Time Monitoring
- **Account Summary**: Balance, daily P&L, open positions
- **Performance Stats**: Win rate, total trades, average confidence
- **System Status**: Uptime, trading mode, last update
- **Recent Signals**: Latest 5 trading signals with confidence
- **Active Positions**: Live position tracking with P&L

### Emergency Controls
- **🔄 Refresh**: Manual data refresh
- **🚨 Emergency Stop**: Immediately reject all pending signals

### Auto-Refresh
- Dashboard updates automatically every 5 seconds
- Real-time status indicators
- Live P&L color coding (green/red)

## 🛠️ API Endpoints

### Dashboard Data
- `GET /api/dashboard/live` - Live dashboard data
- `GET /dashboard` - Dashboard HTML interface

### Emergency Controls
- `POST /api/admin/emergency-stop` - Emergency stop all signals

## ⚙️ Configuration

Dashboard is controlled by these environment variables:

```env
# API Configuration
API_ENABLED=true                # Enable API server
API_PORT=3000                   # Dashboard port
API_ADMIN_ENABLED=true          # Enable emergency controls
API_CORS=true                   # Enable CORS for external access
```

## 🎨 Dashboard Layout

```
┌─────────────────────────────────────────┐
│           🚀 ProTradeAI Dashboard       │
│               Live Paper Trading        │
│        [🔄 Refresh] [🚨 Emergency]      │
├─────────────────────────────────────────┤
│  💰 Account    📊 Performance  ⚙️ System │
│  $1,000.00     75% Win Rate    2h 15m   │
│  +$25.50 P&L   12 Trades      PAPER     │
│  0 Positions   85% Confidence  Active   │
├─────────────────────────────────────────┤
│           🎯 Recent Signals             │
│  BTC LONG 87% - $42,350 - 14:23:15     │
│  ETH SHORT 82% - $2,485 - 14:18:45     │
│  SOL LONG 79% - $98.50 - 14:12:30      │
├─────────────────────────────────────────┤
│          📈 Active Positions            │
│  Symbol │ Side │ Size │ Entry │ P&L     │
│  No active positions                    │
└─────────────────────────────────────────┘
```

## 🔒 Security

- Rate limiting enabled (100 requests per 15 minutes)
- CORS protection
- Helmet security headers
- Request logging
- Error handling

## 📱 Mobile Friendly

The dashboard is responsive and works well on:
- Desktop browsers
- Tablets  
- Mobile phones
- Multiple screen sizes

## 🐛 Troubleshooting

### Dashboard Not Loading
1. Check if API is enabled: `API_ENABLED=true`
2. Verify correct port: Default is `3000`
3. Check bot is running: `npm run paper`
4. Check logs: `npm run logs`

### No Data Showing
1. Ensure all bot components are initialized
2. Check if signals are being generated
3. Verify API endpoints respond: `curl http://localhost:3000/api/dashboard/live`

### Emergency Stop Not Working
1. Check admin routes enabled: `API_ADMIN_ENABLED=true`
2. Verify approval bot is running
3. Check network connectivity

## 📝 Development

### Custom Styling
Edit `public/dashboard.html` to customize:
- Colors and themes
- Layout and components  
- Charts and visualizations
- Additional metrics

### Additional Endpoints
Add new API endpoints in `signalAPI.js`:
```javascript
this.app.get('/api/custom/endpoint', (req, res) => {
  // Your custom data
  res.json({ data: 'custom' });
});
```

## 🎯 Future Enhancements

- 📊 Interactive charts
- 📈 Historical performance graphs  
- 🔔 Real-time notifications
- 📱 Mobile app integration
- 🎨 Custom themes
- 📊 Advanced analytics
