import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock, Target, AlertTriangle, DollarSign, Wifi, WifiOff, Database } from 'lucide-react';

const RealTimeSignalDashboard = () => {
  const [activeSignals, setActiveSignals] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSource, setDataSource] = useState('UNKNOWN');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initial fetch
    fetchActiveSignals();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchActiveSignals();
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchActiveSignals = async () => {
    try {
      // Fetch from the real API endpoint
      const response = await fetch('/api/dashboard/live');
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        // Set data source and live mode status
        setDataSource(result.data.source || 'UNKNOWN');
        setIsLiveMode(result.data.signalTracking?.isLiveMode || false);
        
        // Transform API data to match component expectations
        const transformedSignals = result.data.signals.map((signal) => {
          return {
            id: signal.id,
            symbol: signal.symbol,
            type: signal.type,
            entryPrice: signal.entryPrice,
            currentPrice: signal.currentPrice || signal.entryPrice,
            confidence: signal.confidence || signal.finalConfidence,
            unrealizedPnL: signal.pnl || 0,
            unrealizedPnLPercent: ((signal.currentPrice - signal.entryPrice) / signal.entryPrice * 100) || 0,
            elapsedMinutes: Math.floor((Date.now() - signal.timestamp) / 60000),
            signalStrength: signal.status === 'ACTIVE' ? 'STRENGTHENING' : 'STABLE',
            stopLossDistance: Math.random() * 5, // Would come from signal data
            takeProfitDistance: Math.random() * 3, // Would come from signal data
            volatility: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
            updateCount: signal.updateCount || 0,
            hasPosition: signal.status === 'EXECUTED' || signal.status === 'ACTIVE'
          };
        });
        
        setActiveSignals(transformedSignals);
        setIsConnected(true);
        setError(null);
      } else {
        throw new Error('Invalid API response');
      }
    } catch (err) {
      console.error('Error fetching signals:', err);
      setError(err.message);
      setIsConnected(false);
      setDataSource('MOCK');
      setIsLiveMode(false);
      
      // Fallback to mock data if API fails
      if (activeSignals.length === 0) {
        setActiveSignals(getMockSignals());
      }
    } finally {
      setLoading(false);
    }
  };
  const calculateUnrealizedPnL = (signal) => {
    // Calculate based on current vs entry price
    if (!signal.currentPrice || !signal.entryPrice) return 0;
    const priceChange = signal.currentPrice - signal.entryPrice;
    const direction = signal.type === 'LONG' ? 1 : -1;
    return (priceChange * direction) / signal.entryPrice * 100; // Return as percentage
  };

  const calculateUnrealizedPnLPercent = (signal) => {
    return calculateUnrealizedPnL(signal); // Same calculation for consistency
  };

  const determineSignalStrength = (signal) => {
    if (signal.status === 'ACTIVE') return 'STRENGTHENING';
    if (signal.status === 'EXECUTED') return 'STABLE';
    if (signal.status === 'EXPIRED') return 'WEAKENING';
    return 'ANALYZING';
  };

  const getMockSignals = () => [
    {
      id: 'BTC_MOCK_001',
      symbol: 'BTC',
      type: 'LONG',
      entryPrice: 42750,
      currentPrice: 43100,
      confidence: 78,
      unrealizedPnL: 14.58,
      unrealizedPnLPercent: 1.4,
      elapsedMinutes: 45,
      signalStrength: 'STRENGTHENING',
      stopLossDistance: 3.2,
      takeProfitDistance: 1.8,
      volatility: 'MEDIUM'
    },
    {
      id: 'ETH_MOCK_002',
      symbol: 'ETH',
      type: 'SHORT',
      entryPrice: 2650,
      currentPrice: 2625,
      confidence: 71,
      unrealizedPnL: 8.75,
      unrealizedPnLPercent: 0.94,
      elapsedMinutes: 23,
      signalStrength: 'STABLE',
      stopLossDistance: 2.1,
      takeProfitDistance: 2.4,
      volatility: 'LOW'
    }
  ];

  const startTrackingDemo = async () => {
    try {
      const demoSignal = {
        symbol: 'BTC',
        type: 'LONG',
        entryPrice: 43000,
        confidence: 75,
        positionSize: 100
      };

      const response = await fetch('/api/signals/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(demoSignal)
      });

      const result = await response.json();
      
      if (result.success) {
        // Refresh signals to show the new one
        setTimeout(() => fetchActiveSignals(), 1000);
      }
    } catch (error) {
      console.error('Error starting demo tracking:', error);
    }
  };
  const getDataSourceIndicator = () => {
    const iconClass = "w-4 h-4";
    const textClass = "text-sm font-medium";
    
    if (isLiveMode) {
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-800 rounded-full">
          <Wifi className={iconClass} />
          <span className={textClass}>LIVE</span>
        </div>
      );
    } else if (dataSource === 'FILES') {
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
          <Database className={iconClass} />
          <span className={textClass}>FILES</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full">
          <WifiOff className={iconClass} />
          <span className={textClass}>DEMO</span>
        </div>
      );
    }
  };

  const getConnectionStatus = () => {
    if (isConnected) {
      return (
        <div className="flex items-center space-x-2 text-green-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm">Connected</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 text-red-600">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <span className="text-sm">Disconnected</span>
        </div>
      );
    }
  };

  const getStrengthColor = (strength) => {
    switch (strength) {
      case 'STRENGTHENING': return 'text-green-600 bg-green-100';
      case 'WEAKENING': return 'text-red-600 bg-red-100';
      case 'STABLE': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPnLColor = (pnl) => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getVolatilityIndicator = (volatility) => {
    const colors = {
      'LOW': 'bg-green-200',
      'MEDIUM': 'bg-yellow-200', 
      'HIGH': 'bg-red-200'
    };
    return colors[volatility] || 'bg-gray-200';
  };

  const getSignalIcon = (type) => {
    return type === 'LONG' ? 
      <TrendingUp className="w-5 h-5 text-green-500" /> : 
      <TrendingDown className="w-5 h-5 text-red-500" />;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Signals...</h3>
          <p className="text-gray-500">Connecting to real-time tracking system</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold text-gray-900">Real-Time Signals</h1>
          {getDataSourceIndicator()}
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={startTrackingDemo}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            disabled={isLiveMode}
          >
            {isLiveMode ? 'Live Mode Active' : 'Start Demo Tracking'}
          </button>
          {getConnectionStatus()}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
            <div>
              <p className="text-red-800 font-medium">Connection Error</p>
              <p className="text-red-600 text-sm">
                {error} - Showing mock data. Real-time updates may be delayed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Signals */}
      <div className="grid gap-6">
        {activeSignals.map((signal) => (
          <div key={signal.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
            {/* Signal Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {getSignalIcon(signal.type)}
                <h3 className="text-xl font-semibold text-gray-900">
                  {signal.symbol} {signal.type}
                </h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStrengthColor(signal.signalStrength)}`}>
                  {signal.signalStrength}
                </span>
                {signal.updateCount && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                    {signal.updateCount} updates
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  ${signal.currentPrice.toFixed(4)}
                </div>
                <div className="text-sm text-gray-500">
                  Entry: ${signal.entryPrice.toFixed(4)}
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {/* P&L */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">UNREALIZED P&L</span>
                </div>
                <div className={`text-lg font-semibold ${getPnLColor(signal.unrealizedPnL)}`}>
                  {signal.unrealizedPnL >= 0 ? '+' : ''}${signal.unrealizedPnL.toFixed(2)}
                </div>
                <div className={`text-sm ${getPnLColor(signal.unrealizedPnL)}`}>
                  {signal.unrealizedPnLPercent >= 0 ? '+' : ''}{signal.unrealizedPnLPercent.toFixed(2)}%
                </div>
              </div>

              {/* Time */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">ELAPSED</span>
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatTime(signal.elapsedMinutes)}
                </div>
                <div className="text-sm text-gray-500">
                  {signal.hasPosition ? 'Position Open' : 'Tracking'}
                </div>
              </div>

              {/* Stop Loss */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">STOP LOSS</span>
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {signal.stopLossDistance.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">
                  away
                </div>
              </div>

              {/* Take Profit */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Target className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">TAKE PROFIT</span>
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {signal.takeProfitDistance.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">
                  away
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3">
              {/* Confidence */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Signal Confidence</span>
                  <span className="font-medium">{signal.confidence}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${signal.confidence}%` }}
                  ></div>
                </div>
              </div>

              {/* Volatility */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Market Volatility</span>
                  <span className="font-medium">{signal.volatility}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${getVolatilityIndicator(signal.volatility)}`}
                    style={{ 
                      width: signal.volatility === 'LOW' ? '33%' : 
                             signal.volatility === 'MEDIUM' ? '66%' : '100%' 
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 mt-4">
              <button className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                View Details
              </button>
              <button className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors">
                Close Position
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {activeSignals.length === 0 && !loading && (
        <div className="text-center py-12">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Signals</h3>
          <p className="text-gray-500 mb-4">
            Real-time signal tracking will appear here when signals are generated.
          </p>
          <button 
            onClick={startTrackingDemo}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Demo Signal
          </button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="text-2xl font-bold">{activeSignals.length}</div>
            <div className="text-blue-100">Active Signals</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              +${activeSignals.reduce((sum, s) => sum + s.unrealizedPnL, 0).toFixed(2)}
            </div>
            <div className="text-blue-100">Total Unrealized P&L</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {Math.round(activeSignals.reduce((sum, s) => sum + s.confidence, 0) / activeSignals.length || 0)}%
            </div>
            <div className="text-blue-100">Avg Confidence</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {activeSignals.filter(s => s.hasPosition).length}
            </div>
            <div className="text-blue-100">Open Positions</div>
          </div>
        </div>
      </div>

      {/* Connection Status Footer */}
      <div className="text-center text-sm text-gray-500">
        {isConnected ? (
          <p>🟢 Connected to ProTradeAI Real-Time System • Updates every 5 seconds</p>
        ) : (
          <p>🔴 Offline Mode • Using mock data for demonstration</p>
        )}
      </div>
    </div>
  );
};

export default RealTimeSignalDashboard;
