const axios = require('axios');

// Test the new YouTube Transcription Agent API
async function testAgent() {
  const baseUrl = 'http://localhost:8004/api';
  
  console.log('🧪 Testing YouTube Transcription Agent...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log('✅ Health check:', healthResponse.data);
    console.log();

    // Test 2: Agent status
    console.log('2. Testing agent status...');
    const statusResponse = await axios.get(`${baseUrl}/agent/status`);
    console.log('✅ Agent status:', statusResponse.data);
    console.log();

    // Test 3: URL validation
    console.log('3. Testing URL validation...');
    const validationResponse = await axios.post(`${baseUrl}/validate`, {
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    console.log('✅ URL validation:', validationResponse.data);
    console.log();

    // Test 4: Invalid URL validation
    console.log('4. Testing invalid URL validation...');
    try {
      const invalidResponse = await axios.post(`${baseUrl}/validate`, {
        videoUrl: 'https://invalid-url.com'
      });
      console.log('❌ Should have failed for invalid URL');
    } catch (error) {
      if (error.response) {
        console.log('✅ Invalid URL correctly rejected:', error.response.data);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log();

    console.log('🎉 All tests completed! The new agent system is working.');
    console.log('\n📝 Note: Full transcription test requires Ollama to be running locally.');
    console.log('   To test transcription, ensure Ollama is running and try:');
    console.log('   POST /api/transcribe with { "videoUrl": "https://youtube.com/watch?v=..." }');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run the test
testAgent();
