const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

async function testBingXAPI() {
  console.log('Ì∑™ Testing BingX API Connection...\n');
  
  const apiKey = process.env.BINGX_API_KEY;
  const secret = process.env.BINGX_SECRET;
  const sandbox = process.env.BINGX_SANDBOX === 'true';
  
  const baseURL = sandbox 
    ? 'https://open-api-vst.bingx.com' 
    : 'https://open-api.bingx.com';
  
  if (!apiKey || !secret) {
    console.log('‚ùå API keys missing from .env file');
    return;
  }
  
  console.log(`Ì¥ó Base URL: ${baseURL}`);
  console.log(`Ì¥ë API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`ÌøóÔ∏è Sandbox: ${sandbox}`);
  console.log('');
  
  // Test 1: Server Time
  try {
    console.log('‚è∞ Testing server time...');
    const timeResponse = await axios.get(`${baseURL}/openApi/swap/v2/server/time`, {
      timeout: 10000
    });
    console.log('‚úÖ Server time test passed');
    console.log(`   Server time: ${new Date(timeResponse.data.serverTime || timeResponse.data.data?.serverTime)}`);
  } catch (error) {
    console.log('‚ùå Server time test failed:', error.message);
  }
  
  // Test 2: Market Data (Public)
  try {
    console.log('\nÌ≥ä Testing market data...');
    const priceResponse = await axios.get(`${baseURL}/openApi/swap/v2/quote/price`, {
      params: { symbol: 'BTC-USDT' },
      timeout: 10000
    });
    console.log('‚úÖ Market data test passed');
    console.log(`   BTC Price: $${priceResponse.data.price || priceResponse.data.data?.price}`);
  } catch (error) {
    console.log('‚ùå Market data test failed:', error.message);
  }
  
  // Test 3: Authenticated Request
  try {
    console.log('\nÌ¥ê Testing authenticated request...');
    const timestamp = Date.now();
    const endpoint = '/openApi/user/balance';
    const signaturePayload = `${timestamp}GET${endpoint}`;
    const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
    
    const authResponse = await axios.get(`${baseURL}${endpoint}`, {
      headers: {
        'X-BX-APIKEY': apiKey,
        'X-BX-TIMESTAMP': timestamp,
        'X-BX-SIGNATURE': signature
      },
      timeout: 10000
    });
    console.log('‚úÖ Authentication test passed');
    console.log('   Account access successful');
  } catch (error) {
    console.log('‚ùå Authentication test failed:', error.message);
    if (error.response?.status === 401) {
      console.log('   ‚Üí Check API key and secret');
    }
    if (error.response?.status === 403) {
      console.log('   ‚Üí Check API permissions');
    }
  }
  
  console.log('\nÌ≥ã Test Summary:');
  console.log('If tests fail, try:');
  console.log('1. Check API keys are correct');
  console.log('2. Switch BINGX_SANDBOX=false (try production)');
  console.log('3. Enable MOCK_DATA=true for testing');
  console.log('4. Check internet connection');
}

testBingXAPI().catch(console.error);
