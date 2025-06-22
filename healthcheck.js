#!/usr/bin/env node

/**
 * 🏥 Bot Health Check - Monitor running bot status
 * Run: node scripts/health-check.js
 */

const axios = require('axios');
const fs = require('fs');
const chalk = require('chalk');

class HealthChecker {
  constructor() {
    this.apiUrl = 'http://localhost:3000';
    this.checks = [];
  }

  async runHealthCheck() {
    console.log(chalk.blue.bold('🏥 PROTRADE AI HEALTH CHECK\n'));

    // Check if bot is running
    await this.checkBotStatus();
    
    // Check API endpoints
    await this.checkAPIEndpoints();
    
    // Check system resources
    await this.checkSystemResources();
    
    // Check log files
    await this.checkLogFiles();
    
    // Check data files
    await this.checkDataFiles();
    
    // Show results
    this.showHealthReport();
  }

  async checkBotStatus() {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      
      if (response.status === 200) {
        this.addCheck('Bot Status', 'HEALTHY', `Running on port 3000`);
        return true;
      } else {
        this.addCheck('Bot Status', 'UNHEALTHY', `HTTP ${response.status}`);
        return false;
      }
    } catch (error) {
      this.addCheck('Bot Status', 'DOWN', 'Bot not responding');
      return false;
    }
  }

  async checkAPIEndpoints() {
    const endpoints = [
      { path: '/api/status', name: 'Status API' },
      { path: '/api/signals/latest', name: 'Signals API' },
      { path: '/api/stats', name: 'Stats API' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${this.apiUrl}${endpoint.path}`, { timeout: 5000 });
        
        if (response.status === 200) {
          this.addCheck(endpoint.name, 'HEALTHY', 'Responding correctly');
        } else {
          this.addCheck(endpoint.name, 'UNHEALTHY', `HTTP ${response.status}`);
        }
      } catch (error) {
        this.addCheck(endpoint.name, 'UNHEALTHY', 'Not responding');
      }
    }
  }

  async checkSystemResources() {
    // Memory usage
    try {
      const response = await axios.get(`${this.apiUrl}/api/status`, { timeout: 5000 });
      
      if (response.data && response.data.status) {
        const uptime = response.data.status.bot.uptime;
        const uptimeHours = (uptime / 3600).toFixed(1);
        
        if (uptime > 0) {
          this.addCheck('Uptime', 'HEALTHY', `${uptimeHours} hours`);
        } else {
          this.addCheck('Uptime', 'WARNING', 'Recently started');
        }
      }
    } catch (error) {
      this.addCheck('System Resources', 'UNKNOWN', 'Cannot retrieve data');
    }

    // Local memory check
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    if (heapUsedMB < 200) {
      this.addCheck('Memory Usage', 'HEALTHY', `${heapUsedMB}MB`);
    } else if (heapUsedMB < 500) {
      this.addCheck('Memory Usage', 'WARNING', `${heapUsedMB}MB (high)`);
    } else {
      this.addCheck('Memory Usage', 'CRITICAL', `${heapUsedMB}MB (very high)`);
    }
  }

  async checkLogFiles() {
    const today = new Date().toISOString().split('T')[0];
    const logFiles = [
      `logs/trading-${today}.log`,
      `logs/error-${today}.log`,
      `logs/signals-${today}.log`
    ];

    let activeLogsCount = 0;
    let totalLogSize = 0;

    for (const logFile of logFiles) {
      if (fs.existsSync(logFile)) {
        activeLogsCount++;
        const stats = fs.statSync(logFile);
        totalLogSize += stats.size;
        
        // Check if log file is being written to (modified in last 10 minutes)
        const lastModified = stats.mtime.getTime();
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        
        if (lastModified > tenMinutesAgo) {
          this.addCheck(`${logFile}`, 'ACTIVE', `${(stats.size / 1024).toFixed(1)}KB`);
        } else {
          this.addCheck(`${logFile}`, 'STALE', `Last modified: ${stats.mtime.toLocaleTimeString()}`);
        }
      }
    }

    const totalSizeMB = (totalLogSize / 1024 / 1024).toFixed(1);
    
    if (activeLogsCount > 0) {
      this.addCheck('Log Files', 'HEALTHY', `${activeLogsCount} active files (${totalSizeMB}MB)`);
    } else {
      this.addCheck('Log Files', 'WARNING', 'No recent log activity');
    }
  }

  async checkDataFiles() {
    const dataFiles = [
      'data/trades.json',
      'data/signals.json', 
      'data/stats.json'
    ];

    let dataFilesCount = 0;

    for (const dataFile of dataFiles) {
      if (fs.existsSync(dataFile)) {
        dataFilesCount++;
        try {
          const content = fs.readFileSync(dataFile, 'utf8');
          const data = JSON.parse(content);
          
          if (Array.isArray(data)) {
            this.addCheck(`${dataFile}`, 'HEALTHY', `${data.length} records`);
          } else {
            this.addCheck(`${dataFile}`, 'HEALTHY', 'Valid JSON');
          }
        } catch (error) {
          this.addCheck(`${dataFile}`, 'CORRUPTED', 'Invalid JSON');
        }
      }
    }

    if (dataFilesCount === 0) {
      this.addCheck('Data Files', 'WARNING', 'No data files found (new installation?)');
    }
  }

  addCheck(name, status, details) {
    this.checks.push({ name, status, details });
    
    const icon = {
      'HEALTHY': '✅',
      'ACTIVE': '🟢',
      'WARNING': '⚠️',
      'UNHEALTHY': '🟡',
      'CRITICAL': '🔴',
      'DOWN': '❌',
      'CORRUPTED': '💥',
      'STALE': '⏸️',
      'UNKNOWN': '❓'
    }[status] || '❓';

    const color = {
      'HEALTHY': chalk.green,
      'ACTIVE': chalk.green,
      'WARNING': chalk.yellow,
      'UNHEALTHY': chalk.yellow,
      'CRITICAL': chalk.red,
      'DOWN': chalk.red,
      'CORRUPTED': chalk.red,
      'STALE': chalk.gray,
      'UNKNOWN': chalk.gray
    }[status] || chalk.white;

    console.log(`${icon} ${color(name.padEnd(20))} ${details}`);
  }

  showHealthReport() {
    console.log('\n' + chalk.blue.bold('📊 HEALTH SUMMARY'));
    console.log(chalk.blue('='.repeat(40)));

    const statusCounts = this.checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    }, {});

    // Show counts
    Object.entries(statusCounts).forEach(([status, count]) => {
      const icon = {
        'HEALTHY': '✅',
        'ACTIVE': '🟢', 
        'WARNING': '⚠️',
        'UNHEALTHY': '🟡',
        'CRITICAL': '🔴',
        'DOWN': '❌',
        'CORRUPTED': '💥',
        'STALE': '⏸️',
        'UNKNOWN': '❓'
      }[status] || '❓';
      
      console.log(`${icon} ${status}: ${count}`);
    });

    // Overall health assessment
    const healthy = (statusCounts.HEALTHY || 0) + (statusCounts.ACTIVE || 0);
    const problematic = (statusCounts.CRITICAL || 0) + (statusCounts.DOWN || 0) + (statusCounts.CORRUPTED || 0);
    const warnings = statusCounts.WARNING || 0;

    console.log('\n' + chalk.blue.bold('🎯 OVERALL HEALTH:'));

    if (problematic === 0 && warnings === 0) {
      console.log(chalk.green.bold('🟢 EXCELLENT - All systems operational'));
    } else if (problematic === 0 && warnings <= 2) {
      console.log(chalk.yellow.bold('🟡 GOOD - Minor warnings present'));
    } else if (problematic <= 1) {
      console.log(chalk.yellow.bold('🟠 FAIR - Some issues need attention'));
    } else {
      console.log(chalk.red.bold('🔴 POOR - Multiple critical issues'));
    }

    // Recommendations
    console.log('\n' + chalk.blue.bold('💡 RECOMMENDATIONS:'));

    if (statusCounts.DOWN > 0) {
      console.log(chalk.red('• Bot appears to be down - restart required'));
    }

    if (statusCounts.CORRUPTED > 0) {
      console.log(chalk.red('• Data corruption detected - backup and investigate'));
    }

    if (statusCounts.CRITICAL > 0) {
      console.log(chalk.red('• Critical issues require immediate attention'));
    }

    if (statusCounts.STALE > 0) {
      console.log(chalk.yellow('• Some logs are stale - check if bot is actively trading'));
    }

    if (statusCounts.WARNING > 0) {
      console.log(chalk.yellow('• Review warnings for potential optimizations'));
    }

    if (healthy >= 5 && problematic === 0) {
      console.log(chalk.green('• System healthy - continue normal operations'));
    }

    // Next check reminder
    console.log(`\n${chalk.blue('⏰ Run health check again in 1-2 hours for continuous monitoring')}`);
  }
}

// Run if called directly
if (require.main === module) {
  const checker = new HealthChecker();
  checker.runHealthCheck().catch(error => {
    console.error(chalk.red.bold('💥 Health check failed:'), error.message);
    process.exit(1);
  });
}

module.exports = HealthChecker;