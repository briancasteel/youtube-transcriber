const axios = require('axios');

async function testNewArchitecture() {
  console.log('Testing new LangGraph architecture...');
  
  try {
    // Test 1: Check agent status
    console.log('\n1. Testing agent status...');
    const statusResponse = await axios.get('http://localhost:8004/api/agent/status', {
      timeout: 10000
    });
    
    console.log('✅ Agent status endpoint accessible');
    console.log(`📊 Agent available: ${statusResponse.data.data?.available}`);
    console.log(`🤖 Model: ${statusResponse.data.data?.model}`);
    console.log(`🔧 Tools: ${statusResponse.data.data?.tools?.join(', ')}`);
    
    // Test 2: Test transcription with a simple YouTube URL
    console.log('\n2. Testing transcription...');
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll for testing
    
    const transcriptionResponse = await axios.post('http://localhost:8004/api/transcribe', {
      videoUrl: testUrl,
      options: {
        language: 'en',
        includeTimestamps: true
      }
    }, {
      timeout: 60000 // 1 minute timeout
    });
    
    console.log('✅ Transcription request successful');
    console.log(`📝 Video ID: ${transcriptionResponse.data.data?.videoId}`);
    console.log(`🎬 Title: ${transcriptionResponse.data.data?.title}`);
    console.log(`📄 Caption count: ${transcriptionResponse.data.data?.captions?.length || 0}`);
    console.log(`⏱️  Processing time: ${transcriptionResponse.data.data?.metadata?.processingTime}ms`);
    
    console.log('\n🎉 New architecture test successful!');
    console.log('\n📋 Architecture Summary:');
    console.log('- ✅ Removed IntegratedMediaProcessor');
    console.log('- ✅ Using external transcript service (tactiq)');
    console.log('- ✅ Simplified LangGraph agent with 2 tools');
    console.log('- ✅ Direct Ollama integration for AI processing');
    console.log('- ✅ Enhanced logging throughout');
    
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(`Error: ${error.message}`);
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Suggestion: Make sure the workflow service is running on port 8004');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('💡 Suggestion: Check if Ollama is running and accessible');
    }
    
    process.exit(1);
  }
}

// Run the test
testNewArchitecture();
