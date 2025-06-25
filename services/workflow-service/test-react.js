/**
 * Test script for ReAct Workflow Engine
 * 
 * This script demonstrates how to use the new ReAct (Reasoning + Acting) pattern
 * for intelligent workflow execution.
 * 
 * Usage: node test-react.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:8004/api/workflow';

// Test configuration
const TEST_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll for testing
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 150; // 5 minutes max

/**
 * Test the ReAct YouTube transcription workflow
 */
async function testReActYouTubeTranscription() {
  console.log('🧠 Testing ReAct YouTube Transcription Workflow');
  console.log('=' .repeat(60));
  
  try {
    // Start the ReAct workflow
    console.log('📝 Starting ReAct YouTube transcription...');
    const response = await axios.post(`${BASE_URL}/youtube-transcription-react`, {
      youtubeUrl: TEST_YOUTUBE_URL,
      options: {
        language: 'en',
        enhanceText: true,
        generateSummary: false,
        quality: 'highestaudio'
      }
    });

    const { executionId, goal, reasoningUrl } = response.data.data;
    console.log(`✅ Workflow started successfully!`);
    console.log(`   Execution ID: ${executionId}`);
    console.log(`   Goal: ${goal}`);
    console.log(`   Reasoning URL: ${reasoningUrl}`);
    console.log('');

    // Monitor the reasoning process
    await monitorReActWorkflow(executionId);

  } catch (error) {
    console.error('❌ Failed to start ReAct workflow:', error.response?.data || error.message);
  }
}

/**
 * Test the generic ReAct workflow
 */
async function testGenericReActWorkflow() {
  console.log('🧠 Testing Generic ReAct Workflow');
  console.log('=' .repeat(60));
  
  try {
    // Start a generic ReAct workflow
    console.log('📝 Starting generic ReAct workflow...');
    const response = await axios.post(`${BASE_URL}/react`, {
      goal: 'Analyze and process a YouTube video for transcription',
      context: {
        youtubeUrl: TEST_YOUTUBE_URL,
        language: 'en',
        enhanceText: false
      },
      metadata: {
        userId: 'test-user',
        source: 'test-script',
        priority: 'normal',
        tags: ['test', 'demo', 'react']
      }
    });

    const { executionId, goal, reasoningUrl } = response.data.data;
    console.log(`✅ Workflow started successfully!`);
    console.log(`   Execution ID: ${executionId}`);
    console.log(`   Goal: ${goal}`);
    console.log(`   Reasoning URL: ${reasoningUrl}`);
    console.log('');

    // Monitor the reasoning process
    await monitorReActWorkflow(executionId);

  } catch (error) {
    console.error('❌ Failed to start generic ReAct workflow:', error.response?.data || error.message);
  }
}

/**
 * Monitor a ReAct workflow execution and show reasoning trace
 */
async function monitorReActWorkflow(executionId) {
  console.log('🔍 Monitoring ReAct workflow execution...');
  console.log('');

  let attempts = 0;
  let lastReasoningSteps = 0;
  let lastActions = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    try {
      // Get reasoning trace
      const reasoningResponse = await axios.get(`${BASE_URL}/react/${executionId}/reasoning`);
      const state = reasoningResponse.data.data;

      // Check if there are new reasoning steps or actions
      const newReasoningSteps = state.reasoningTrace.length > lastReasoningSteps;
      const newActions = state.actionHistory.length > lastActions;

      if (newReasoningSteps || newActions || attempts === 0) {
        console.log(`📊 Status Update (${new Date().toLocaleTimeString()})`);
        console.log(`   Status: ${state.status}`);
        console.log(`   Current Thought: ${state.currentThought || 'None'}`);
        console.log(`   Progress: ${state.progress.reasoningSteps} reasoning steps, ${state.progress.actionsExecuted} actions`);
        console.log(`   Success Rate: ${state.progress.successfulActions}/${state.progress.actionsExecuted} actions successful`);
        
        // Show latest reasoning step
        if (state.reasoningTrace.length > 0) {
          const latestReasoning = state.reasoningTrace[state.reasoningTrace.length - 1];
          console.log('');
          console.log('🧠 Latest Reasoning:');
          console.log(`   Thought: "${latestReasoning.thought}"`);
          console.log(`   Decision: ${latestReasoning.decision}`);
          console.log(`   Confidence: ${(latestReasoning.confidence * 100).toFixed(1)}%`);
          if (latestReasoning.alternatives && latestReasoning.alternatives.length > 0) {
            console.log(`   Alternatives: ${latestReasoning.alternatives.join(', ')}`);
          }
        }

        // Show latest action
        if (state.actionHistory.length > 0) {
          const latestAction = state.actionHistory[state.actionHistory.length - 1];
          console.log('');
          console.log('⚡ Latest Action:');
          console.log(`   Type: ${latestAction.action.type}`);
          console.log(`   Description: ${latestAction.action.description}`);
          console.log(`   Status: ${latestAction.status}`);
          console.log(`   Service: ${latestAction.action.service}`);
          if (latestAction.duration) {
            console.log(`   Duration: ${latestAction.duration}ms`);
          }
          if (latestAction.error) {
            console.log(`   Error: ${latestAction.error}`);
          }
        }

        // Show latest observation
        if (state.observations.length > 0) {
          const latestObservation = state.observations[state.observations.length - 1];
          console.log('');
          console.log('👁️ Latest Observation:');
          console.log(`   Observation: "${latestObservation.observation}"`);
          console.log(`   Impact: ${latestObservation.impact}`);
          console.log(`   Analysis: ${latestObservation.analysis}`);
          if (latestObservation.nextStepSuggestion) {
            console.log(`   Next Step: ${latestObservation.nextStepSuggestion}`);
          }
        }

        console.log('');
        console.log('-'.repeat(60));
        console.log('');

        lastReasoningSteps = state.reasoningTrace.length;
        lastActions = state.actionHistory.length;
      }

      // Check if workflow is complete
      if (state.status === 'completed') {
        console.log('🎉 Workflow completed successfully!');
        
        // Get final execution status
        const executionResponse = await axios.get(`${BASE_URL}/execution/${executionId}`);
        const execution = executionResponse.data.data;
        
        console.log('');
        console.log('📋 Final Results:');
        console.log(`   Duration: ${execution.duration}ms`);
        console.log(`   Completed Steps: ${execution.completedSteps.length}`);
        console.log(`   Failed Steps: ${execution.failedSteps.length}`);
        
        if (execution.output) {
          console.log('   Output Summary:');
          console.log(`     Goal Achieved: ${execution.output.achieved}`);
          console.log(`     Reasoning Steps: ${execution.output.reasoningSteps}`);
          console.log(`     Actions Executed: ${execution.output.actionsExecuted}`);
          console.log(`     Summary: ${execution.output.summary}`);
        }
        
        break;
      } else if (state.status === 'failed') {
        console.log('❌ Workflow failed!');
        
        // Get execution details
        const executionResponse = await axios.get(`${BASE_URL}/execution/${executionId}`);
        const execution = executionResponse.data.data;
        
        console.log(`   Error: ${execution.error}`);
        console.log(`   Completed Steps: ${execution.completedSteps.length}`);
        console.log(`   Failed Steps: ${execution.failedSteps.length}`);
        
        break;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;

    } catch (error) {
      console.error('❌ Error monitoring workflow:', error.response?.data || error.message);
      break;
    }
  }

  if (attempts >= MAX_POLL_ATTEMPTS) {
    console.log('⏰ Monitoring timeout reached');
  }
}

/**
 * Display reasoning trace in a formatted way
 */
function displayReasoningTrace(reasoningTrace) {
  console.log('🧠 Complete Reasoning Trace:');
  console.log('');
  
  reasoningTrace.forEach((step, index) => {
    console.log(`Step ${index + 1} (${new Date(step.timestamp).toLocaleTimeString()})`);
    console.log(`  💭 Thought: "${step.thought}"`);
    console.log(`  🤔 Reasoning: ${step.reasoning.split('\n')[0]}...`);
    console.log(`  ✅ Decision: ${step.decision}`);
    console.log(`  📊 Confidence: ${(step.confidence * 100).toFixed(1)}%`);
    if (step.alternatives && step.alternatives.length > 0) {
      console.log(`  🔄 Alternatives: ${step.alternatives.join(', ')}`);
    }
    console.log('');
  });
}

/**
 * Main test function
 */
async function main() {
  console.log('🚀 ReAct Workflow Engine Test Suite');
  console.log('====================================');
  console.log('');
  
  const args = process.argv.slice(2);
  const testType = args[0] || 'youtube';

  switch (testType) {
    case 'youtube':
      await testReActYouTubeTranscription();
      break;
    case 'generic':
      await testGenericReActWorkflow();
      break;
    case 'both':
      await testReActYouTubeTranscription();
      console.log('\n' + '='.repeat(80) + '\n');
      await testGenericReActWorkflow();
      break;
    default:
      console.log('Usage: node test-react.js [youtube|generic|both]');
      console.log('');
      console.log('Options:');
      console.log('  youtube  - Test ReAct YouTube transcription workflow (default)');
      console.log('  generic  - Test generic ReAct workflow');
      console.log('  both     - Test both workflows');
      break;
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testReActYouTubeTranscription,
  testGenericReActWorkflow,
  monitorReActWorkflow
};
