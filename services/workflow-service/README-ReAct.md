# ReAct Workflow Engine - Reasoning + Acting Pattern

This document explains the ReAct (Reasoning + Acting) pattern implementation in the workflow service, which provides intelligent, self-reasoning workflow execution with explicit decision-making capabilities.

## Overview

The ReAct pattern combines **Reasoning** and **Acting** in an iterative loop where the system:
1. **Reasons** about the current state and decides what action to take
2. **Acts** by executing the planned action
3. **Observes** the results and analyzes the outcome
4. **Repeats** the cycle until the goal is achieved

This creates a more intelligent and adaptable workflow execution compared to traditional predefined workflows.

## Architecture

### Core Components

1. **ReActWorkflowEngine**: Main orchestrator that manages the ReAct loop
2. **ReasoningEngine**: Handles the thinking and decision-making process
3. **ActionExecutor**: Executes planned actions (both internal and external service calls)
4. **ObservationProcessor**: Analyzes action results and provides feedback

### Key Interfaces

```typescript
interface ReActState {
  executionId: string;
  goal: string;                    // The objective to achieve
  context: Record<string, any>;    // Available context/parameters
  reasoningTrace: ReasoningStep[]; // History of reasoning steps
  actionHistory: ActionStep[];     // History of executed actions
  observations: Observation[];     // Analysis of action results
  status: 'pending' | 'reasoning' | 'acting' | 'observing' | 'completed' | 'failed' | 'cancelled';
}

interface ReasoningStep {
  thought: string;        // What the system is thinking
  reasoning: string;      // Detailed reasoning process
  decision: string;       // What decision was made
  confidence: number;     // Confidence level (0-1)
  alternatives?: string[]; // Alternative approaches considered
}

interface ActionStep {
  action: PlannedAction;  // The planned action
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;          // Action result
  error?: string;        // Error if failed
}

interface Observation {
  observation: string;           // What was observed
  analysis: string;             // Analysis of the result
  impact: 'positive' | 'negative' | 'neutral';
  nextStepSuggestion?: string;  // Suggestion for next step
}
```

## API Endpoints

### 1. Generic ReAct Workflow

**POST** `/api/workflow/react`

Execute any goal-oriented workflow using the ReAct pattern.

```json
{
  "goal": "Transcribe YouTube video from https://youtube.com/watch?v=example",
  "context": {
    "youtubeUrl": "https://youtube.com/watch?v=example",
    "language": "en",
    "enhanceText": true
  },
  "metadata": {
    "userId": "user123",
    "priority": "normal",
    "tags": ["transcription", "youtube"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid-here",
    "workflowId": "react-workflow",
    "status": "started",
    "goal": "Transcribe YouTube video from https://youtube.com/watch?v=example",
    "statusUrl": "/api/workflow/execution/uuid-here",
    "reasoningUrl": "/api/workflow/react/uuid-here/reasoning"
  }
}
```

### 2. ReAct YouTube Transcription

**POST** `/api/workflow/youtube-transcription-react`

Specialized endpoint for YouTube transcription using ReAct reasoning.

```json
{
  "youtubeUrl": "https://youtube.com/watch?v=example",
  "options": {
    "language": "en",
    "enhanceText": true,
    "generateSummary": false,
    "quality": "highestaudio"
  }
}
```

### 3. Get Reasoning Trace

**GET** `/api/workflow/react/{executionId}/reasoning`

Get detailed reasoning trace showing the system's thought process.

**Response:**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid-here",
    "goal": "Transcribe YouTube video...",
    "status": "reasoning",
    "currentThought": "I need to validate the YouTube URL first...",
    "reasoningTrace": [
      {
        "id": "reasoning-1",
        "timestamp": "2025-06-25T22:10:00Z",
        "thought": "I need to start working towards the goal...",
        "reasoning": "Given the thought: \"...\", I need to consider:\n1. Available services: video-processor, transcription-service, llm-service\n2. Completed actions: None\n3. Goal requirements: Requires video processing, audio extraction, transcription\n4. Current context: {...}",
        "decision": "validate_youtube_url",
        "confidence": 0.8,
        "alternatives": ["get_video_info_first"]
      }
    ],
    "actionHistory": [
      {
        "id": "action-1",
        "action": {
          "type": "validate_url",
          "description": "Validate YouTube URL format and accessibility",
          "service": "internal"
        },
        "status": "completed",
        "result": {
          "valid": true,
          "platform": "youtube"
        }
      }
    ],
    "observations": [
      {
        "id": "obs-1",
        "observation": "URL validation completed. Result: Valid",
        "analysis": "The URL is valid and can be processed.",
        "impact": "positive",
        "nextStepSuggestion": "Proceed to get video information"
      }
    ],
    "progress": {
      "reasoningSteps": 1,
      "actionsExecuted": 1,
      "successfulActions": 1,
      "failedActions": 0
    }
  }
}
```

## How It Works

### 1. Reasoning Phase

The system analyzes the current state and generates:
- **Thought**: What it's thinking about
- **Reasoning**: Structured analysis of the situation
- **Decision**: What action to take next
- **Confidence**: How confident it is in the decision
- **Alternatives**: Other options considered

Example reasoning for YouTube transcription:
```
Thought: "I need to start working towards the goal: Transcribe YouTube video from https://youtube.com/watch?v=example. Let me analyze what needs to be done first."

Reasoning: "Given the thought, I need to consider:
1. Available services: video-processor, transcription-service, llm-service
2. Completed actions: None
3. Goal requirements: Requires video processing, audio extraction, transcription, possibly text enhancement
4. Current context: {youtubeUrl: '...', language: 'en', enhanceText: true}"

Decision: "validate_youtube_url"
Confidence: 0.8
```

### 2. Acting Phase

The system executes the planned action:
- **Internal actions**: URL validation, requirement analysis
- **External actions**: API calls to video-processor, transcription-service, llm-service

### 3. Observation Phase

The system analyzes the action result:
- **Observation**: What happened
- **Analysis**: Detailed analysis of the result
- **Impact**: Whether it was positive, negative, or neutral
- **Next Step Suggestion**: What should happen next

### 4. Goal Evaluation

After each observation, the system evaluates:
- Is the goal achieved?
- Should we continue with more actions?
- Do we need to try a different approach?

## Intelligent Decision Making

The ReAct engine makes intelligent decisions based on:

### Context Analysis
- Available services and their capabilities
- Previous action results
- Goal requirements
- Current workflow state

### Adaptive Planning
- Chooses appropriate actions based on the goal
- Handles failures with alternative approaches
- Adjusts strategy based on intermediate results

### Error Recovery
- Analyzes failures and suggests alternatives
- Can retry with different parameters
- Provides fallback strategies

## Example: YouTube Transcription Flow

1. **Goal**: "Transcribe YouTube video from https://youtube.com/watch?v=example and enhance the text"

2. **Reasoning Step 1**: 
   - Thought: "Need to start with URL validation"
   - Decision: "validate_youtube_url"

3. **Action 1**: Validate URL (internal)
   - Result: URL is valid

4. **Observation 1**: "URL validation successful, proceed to get video info"

5. **Reasoning Step 2**:
   - Thought: "URL is valid, now get video metadata"
   - Decision: "get_video_info"

6. **Action 2**: Call video-processor service
   - Result: Video metadata retrieved

7. **Observation 2**: "Video info obtained, proceed to process video"

8. **Continue until goal achieved...**

## Benefits

### 1. **Transparency**
- Every decision is logged with reasoning
- Full trace of thought process available
- Easy to debug and understand workflow behavior

### 2. **Adaptability**
- Can handle unexpected situations
- Adjusts approach based on results
- No rigid predefined workflow steps

### 3. **Intelligence**
- Makes context-aware decisions
- Learns from action results
- Provides confidence levels for decisions

### 4. **Error Handling**
- Intelligent error recovery
- Alternative approach suggestions
- Graceful failure handling

### 5. **Extensibility**
- Easy to add new action types
- Pluggable reasoning strategies
- Service-agnostic architecture

## Configuration

### Service Endpoints
The ReAct engine can call these services:
- **video-processor**: Video processing and audio extraction
- **transcription-service**: Audio transcription
- **llm-service**: Text enhancement and AI processing

### Internal Actions
- **validate_url**: URL format validation
- **analyze_requirements**: Goal requirement analysis

### Reasoning Parameters
- **maxIterations**: 20 (prevents infinite loops)
- **confidenceThreshold**: Configurable decision confidence
- **fallbackStrategies**: Alternative approaches for failures

## Monitoring and Debugging

### Logs
- Detailed logging at each phase
- Reasoning decisions logged
- Action execution results
- Error details and recovery attempts

### Metrics
- Reasoning steps per workflow
- Action success/failure rates
- Average workflow completion time
- Confidence levels over time

### Debugging
- Full reasoning trace available via API
- Step-by-step execution history
- Action results and observations
- Current workflow state inspection

## Comparison with Other Patterns

| Feature | Traditional Workflow | Langgraph | ReAct |
|---------|---------------------|-----------|-------|
| **Flexibility** | Low (predefined steps) | Medium (state machine) | High (goal-oriented) |
| **Reasoning** | None | Implicit | Explicit |
| **Adaptability** | Low | Medium | High |
| **Transparency** | Low | Medium | High |
| **Error Recovery** | Basic | Good | Excellent |
| **Debugging** | Difficult | Moderate | Easy |

## Best Practices

### 1. **Goal Definition**
- Be specific about what you want to achieve
- Include context that helps with decision making
- Use clear, actionable language

### 2. **Context Provision**
- Provide relevant parameters upfront
- Include preferences and constraints
- Add metadata for better decision making

### 3. **Monitoring**
- Use the reasoning trace endpoint for debugging
- Monitor confidence levels for quality assessment
- Track action success rates

### 4. **Error Handling**
- Review failed workflows via reasoning trace
- Understand why decisions were made
- Adjust context or goals based on learnings

## Future Enhancements

1. **Learning from History**: Use past executions to improve decision making
2. **Dynamic Service Discovery**: Automatically discover available services
3. **Parallel Reasoning**: Execute multiple reasoning paths simultaneously
4. **Custom Reasoning Strategies**: Pluggable reasoning algorithms
5. **Integration with LLMs**: Use large language models for more sophisticated reasoning
