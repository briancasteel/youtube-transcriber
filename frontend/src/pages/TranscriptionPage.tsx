import { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Link as LinkIcon, 
  FileAudio, 
  Settings, 
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Download,
  Copy,
  RotateCcw,
  Clock,
  Zap
} from 'lucide-react';
import { apiService } from '../services/api';
import { WhisperOptions, TextEnhancementOptions } from '../types';
import { isValidYouTubeUrl, formatDuration, downloadFile, copyToClipboard } from '../utils';

type InputMethod = 'youtube' | 'upload';
type JobStatus = 'idle' | 'processing' | 'completed' | 'error' | 'cancelled';

interface TranscriptionState {
  status: JobStatus;
  progress: number;
  currentJobId: string | null;
  estimatedTimeRemaining: number | null;
  startTime: Date | null;
  result: any | null;
  error: string | null;
}

export function TranscriptionPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<number | null>(null);
  
  const [inputMethod, setInputMethod] = useState<InputMethod>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Transcription state
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>({
    status: 'idle',
    progress: 0,
    currentJobId: null,
    estimatedTimeRemaining: null,
    startTime: null,
    result: null,
    error: null,
  });

  // Whisper Options
  const [whisperOptions, setWhisperOptions] = useState<WhisperOptions>({
    model: 'base',
    outputFormat: 'txt',
    includeTimestamps: false,
    includeWordTimestamps: false,
    temperature: 0.0,
  });

  // Enhancement Options
  const [enhancementOptions, setEnhancementOptions] = useState<TextEnhancementOptions>({
    addPunctuation: true,
    fixGrammar: true,
    improveClarity: false,
    generateSummary: false,
    extractKeywords: false,
  });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Start polling for job status
  const startPolling = (jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const job = await apiService.getTranscriptionJob(jobId);
        
        setTranscriptionState(prev => ({
          ...prev,
          progress: job.progress,
          status: job.status === 'completed' ? 'completed' : 
                  job.status === 'failed' ? 'error' :
                  job.status === 'processing' ? 'processing' : 'processing',
          error: job.error || null,
        }));

        // Calculate estimated time remaining
        if (transcriptionState.startTime && job.progress > 0) {
          const elapsed = Date.now() - transcriptionState.startTime.getTime();
          const estimatedTotal = (elapsed / job.progress) * 100;
          const remaining = Math.max(0, estimatedTotal - elapsed);
          
          setTranscriptionState(prev => ({
            ...prev,
            estimatedTimeRemaining: remaining,
          }));
        }

        // Stop polling if job is complete
        if (job.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          
          // Load the result
          try {
            const result = await apiService.getTranscriptionResult(jobId);
            setTranscriptionState(prev => ({
              ...prev,
              result,
            }));
          } catch (resultError) {
            console.warn('Failed to load result:', resultError);
          }
        } else if (job.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Continue polling on error, but don't update state
      }
    }, 2000); // Poll every 2 seconds
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setTranscriptionState(prev => ({ ...prev, error: null }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    setTranscriptionState({
      status: 'processing',
      progress: 0,
      currentJobId: null,
      estimatedTimeRemaining: null,
      startTime: new Date(),
      result: null,
      error: null,
    });

    try {
      let executionId: string;

      if (inputMethod === 'youtube') {
        if (!youtubeUrl.trim()) {
          throw new Error('Please enter a YouTube URL');
        }
        if (!isValidYouTubeUrl(youtubeUrl)) {
          throw new Error('Please enter a valid YouTube URL');
        }

        const result = await apiService.startYouTubeTranscription(
          youtubeUrl,
          whisperOptions,
          enhancementOptions
        );
        executionId = result.executionId;
      } else {
        if (!selectedFile) {
          throw new Error('Please select an audio file');
        }

        const result = await apiService.uploadAudioFile(
          selectedFile,
          whisperOptions,
          enhancementOptions
        );
        executionId = result.jobId;
      }

      setTranscriptionState(prev => ({
        ...prev,
        currentJobId: executionId,
      }));

      // Start polling for progress
      startPolling(executionId);
    } catch (err) {
      setTranscriptionState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'An error occurred',
      }));
    }
  };

  const handleCancel = async () => {
    if (!transcriptionState.currentJobId) return;
    
    try {
      await apiService.cancelTranscriptionJob(transcriptionState.currentJobId);
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      
      setTranscriptionState(prev => ({
        ...prev,
        status: 'cancelled',
      }));
    } catch (err) {
      console.error('Failed to cancel job:', err);
      // Still update UI to show cancelled state
      setTranscriptionState(prev => ({
        ...prev,
        status: 'cancelled',
      }));
    }
    
    setShowCancelConfirm(false);
  };

  const handleReset = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    setTranscriptionState({
      status: 'idle',
      progress: 0,
      currentJobId: null,
      estimatedTimeRemaining: null,
      startTime: null,
      result: null,
      error: null,
    });
    
    setYoutubeUrl('');
    setSelectedFile(null);
    setCopySuccess(false);
  };

  const handleCopyText = async (text: string) => {
    try {
      await copyToClipboard(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleDownload = (content: string, filename: string, format: string) => {
    const contentType = format === 'json' ? 'application/json' : 'text/plain';
    downloadFile(content, filename, contentType);
  };

  const getProgressColor = () => {
    if (transcriptionState.status === 'error') return 'bg-red-600';
    if (transcriptionState.status === 'cancelled') return 'bg-gray-600';
    if (transcriptionState.status === 'completed') return 'bg-green-600';
    return 'bg-blue-600';
  };

  const getStatusIcon = () => {
    switch (transcriptionState.status) {
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'cancelled':
        return <X className="w-5 h-5 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (transcriptionState.status) {
      case 'processing':
        return 'Processing transcription...';
      case 'completed':
        return 'Transcription completed!';
      case 'error':
        return 'Transcription failed';
      case 'cancelled':
        return 'Transcription cancelled';
      default:
        return '';
    }
  };

  const formatTimeRemaining = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s remaining`;
    }
    return `${remainingSeconds}s remaining`;
  };

  // Show results if completed
  if (transcriptionState.status === 'completed' && transcriptionState.result) {
    const result = transcriptionState.result;
    const transcriptionText = result.captions ? result.captions.map((c: any) => c.text).join(' ') : result.transcription?.text || '';
    
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <h1 className="text-3xl font-bold text-gray-900">Transcription Complete</h1>
          </div>
          <p className="text-lg text-gray-600">
            Your transcription has been processed successfully
          </p>
        </div>

        {/* Performance Metrics */}
        {result.metadata && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Performance Metrics</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {result.metadata.processingTime ? formatDuration(result.metadata.processingTime / 1000) : 'N/A'}
                </div>
                <div className="text-sm text-gray-600">Processing Time</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {result.metadata.language || 'Unknown'}
                </div>
                <div className="text-sm text-gray-600">Language</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {result.metadata.enhanced ? 'Yes' : 'No'}
                </div>
                <div className="text-sm text-gray-600">Enhanced</div>
              </div>
            </div>
          </div>
        )}

        {/* Transcription Result */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
              <FileAudio className="w-5 h-5" />
              <span>Transcription</span>
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleCopyText(transcriptionText)}
                className="btn-secondary inline-flex items-center space-x-2"
              >
                <Copy className="w-4 h-4" />
                <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
              </button>
              <button
                onClick={() => handleDownload(
                  transcriptionText,
                  `transcription-${Date.now()}.txt`,
                  'txt'
                )}
                className="btn-secondary inline-flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm text-gray-900 font-mono">
              {transcriptionText}
            </pre>
          </div>
        </div>

        {/* Summary */}
        {result.summary && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Summary</h3>
              <button
                onClick={() => handleCopyText(result.summary)}
                className="btn-secondary inline-flex items-center space-x-2"
              >
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </button>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-gray-900">{result.summary}</p>
            </div>
          </div>
        )}

        {/* Keywords */}
        {result.keywords && result.keywords.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Keywords</h3>
            <div className="flex flex-wrap gap-2">
              {result.keywords.map((keyword: string, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Start New Transcription */}
        <div className="text-center">
          <button
            onClick={handleReset}
            className="btn-primary inline-flex items-center space-x-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Start New Transcription</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Start Transcription</h1>
        <p className="text-lg text-gray-600">
          Choose your input method and configure AI processing options
        </p>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Cancel Transcription?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to cancel the current transcription? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleCancel}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                Yes, Cancel
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="btn-secondary"
              >
                Continue Processing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Status */}
      {transcriptionState.status !== 'idle' && (
        <div className="card">
          <div className="space-y-4">
            {/* Status Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getStatusIcon()}
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {getStatusText()}
                  </h3>
                  {transcriptionState.status === 'processing' && (
                    <p className="text-sm text-gray-600">
                      {transcriptionState.estimatedTimeRemaining 
                        ? formatTimeRemaining(transcriptionState.estimatedTimeRemaining)
                        : 'Calculating time remaining...'
                      }
                    </p>
                  )}
                </div>
              </div>
              
              {/* Cancel Button */}
              {transcriptionState.status === 'processing' && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="btn-secondary inline-flex items-center space-x-2 text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              )}
              
              {/* Reset Button */}
              {(transcriptionState.status === 'error' || transcriptionState.status === 'cancelled') && (
                <button
                  onClick={handleReset}
                  className="btn-primary inline-flex items-center space-x-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Try Again</span>
                </button>
              )}
            </div>

            {/* Progress Bar */}
            {transcriptionState.status === 'processing' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Progress</span>
                  <span className="text-gray-900 font-medium">{transcriptionState.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all duration-300 ${getProgressColor()}`}
                    style={{ width: `${transcriptionState.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {transcriptionState.error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800">Error</h4>
                    <p className="text-red-700 mt-1">{transcriptionState.error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Processing Time */}
            {transcriptionState.startTime && transcriptionState.status === 'processing' && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>
                  Processing for {formatDuration((Date.now() - transcriptionState.startTime.getTime()) / 1000)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Form - Only show if not processing or completed */}
      {transcriptionState.status === 'idle' && (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Input Method Selection */}
          <div className="card space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Input Method</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setInputMethod('youtube')}
                className={`p-6 rounded-lg border-2 transition-all ${
                  inputMethod === 'youtube'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center space-y-3">
                  <LinkIcon className={`w-8 h-8 ${
                    inputMethod === 'youtube' ? 'text-primary-600' : 'text-gray-400'
                  }`} />
                  <div className="text-center">
                    <h3 className="font-medium text-gray-900">YouTube URL</h3>
                    <p className="text-sm text-gray-600">Paste a YouTube video link</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setInputMethod('upload')}
                className={`p-6 rounded-lg border-2 transition-all ${
                  inputMethod === 'upload'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center space-y-3">
                  <Upload className={`w-8 h-8 ${
                    inputMethod === 'upload' ? 'text-primary-600' : 'text-gray-400'
                  }`} />
                  <div className="text-center">
                    <h3 className="font-medium text-gray-900">Upload File</h3>
                    <p className="text-sm text-gray-600">Upload an audio file</p>
                  </div>
                </div>
              </button>
            </div>

            {/* YouTube URL Input */}
            {inputMethod === 'youtube' && (
              <div className="space-y-2">
                <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700">
                  YouTube URL
                </label>
                <input
                  id="youtube-url"
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="input-field"
                  required
                />
                <p className="text-sm text-gray-600">
                  Supports youtube.com and youtu.be URLs
                </p>
              </div>
            )}

            {/* File Upload */}
            {inputMethod === 'upload' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Audio File
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,video/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div className="space-y-3">
                      <FileAudio className="w-12 h-12 text-gray-400 mx-auto" />
                      <div>
                        <p className="text-lg font-medium text-gray-900">
                          {selectedFile ? selectedFile.name : 'Choose an audio file'}
                        </p>
                        <p className="text-sm text-gray-600">
                          Supports MP3, WAV, MP4, AAC, OGG, WebM (max 100MB)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {selectedFile && (
                  <div className="flex items-center space-x-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>File selected: {selectedFile.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Configuration */}
          <div className="card space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">AI Configuration</h2>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center space-x-2 text-primary-600 hover:text-primary-700"
              >
                <Settings className="w-4 h-4" />
                <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Options</span>
              </button>
            </div>

            {/* Basic Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="model" className="block text-sm font-medium text-gray-700">
                  Whisper Model
                </label>
                <select
                  id="model"
                  value={whisperOptions.model}
                  onChange={(e) => setWhisperOptions(prev => ({ 
                    ...prev, 
                    model: e.target.value as WhisperOptions['model']
                  }))}
                  className="input-field"
                >
                  <option value="tiny">Tiny (fastest, least accurate)</option>
                  <option value="base">Base (balanced)</option>
                  <option value="small">Small (good accuracy)</option>
                  <option value="medium">Medium (better accuracy)</option>
                  <option value="large">Large (best accuracy, slowest)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="output-format" className="block text-sm font-medium text-gray-700">
                  Output Format
                </label>
                <select
                  id="output-format"
                  value={whisperOptions.outputFormat}
                  onChange={(e) => setWhisperOptions(prev => ({ 
                    ...prev, 
                    outputFormat: e.target.value as WhisperOptions['outputFormat']
                  }))}
                  className="input-field"
                >
                  <option value="txt">Plain Text</option>
                  <option value="srt">SRT Subtitles</option>
                  <option value="vtt">VTT Subtitles</option>
                  <option value="json">JSON with Metadata</option>
                </select>
              </div>
            </div>

            {/* Enhancement Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Text Enhancement</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={enhancementOptions.addPunctuation}
                    onChange={(e) => setEnhancementOptions(prev => ({
                      ...prev,
                      addPunctuation: e.target.checked
                    }))}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Add Punctuation</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={enhancementOptions.fixGrammar}
                    onChange={(e) => setEnhancementOptions(prev => ({
                      ...prev,
                      fixGrammar: e.target.checked
                    }))}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Fix Grammar</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={enhancementOptions.improveClarity}
                    onChange={(e) => setEnhancementOptions(prev => ({
                      ...prev,
                      improveClarity: e.target.checked
                    }))}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Improve Clarity</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={enhancementOptions.generateSummary}
                    onChange={(e) => setEnhancementOptions(prev => ({
                      ...prev,
                      generateSummary: e.target.checked
                    }))}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Generate Summary</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={enhancementOptions.extractKeywords}
                    onChange={(e) => setEnhancementOptions(prev => ({
                      ...prev,
                      extractKeywords: e.target.checked
                    }))}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Extract Keywords</span>
                </label>
              </div>
            </div>

            {/* Advanced Options */}
            {showAdvanced && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Advanced Options</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="language" className="block text-sm font-medium text-gray-700">
                      Language (optional)
                    </label>
                    <input
                      id="language"
                      type="text"
                      value={whisperOptions.language || ''}
                      onChange={(e) => setWhisperOptions(prev => ({ 
                        ...prev, 
                        language: e.target.value || undefined
                      }))}
                      placeholder="auto-detect"
                      className="input-field"
                    />
                    <p className="text-xs text-gray-600">
                      Leave empty for auto-detection or specify (e.g., 'en', 'es', 'fr')
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="temperature" className="block text-sm font-medium text-gray-700">
                      Temperature: {whisperOptions.temperature}
                    </label>
                    <input
                      id="temperature"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={whisperOptions.temperature}
                      onChange={(e) => setWhisperOptions(prev => ({ 
                        ...prev, 
                        temperature: parseFloat(e.target.value)
                      }))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-600">
                      Higher values increase randomness (0.0 = deterministic)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={whisperOptions.includeTimestamps}
                      onChange={(e) => setWhisperOptions(prev => ({
                        ...prev,
                        includeTimestamps: e.target.checked
                      }))}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Include Timestamps</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={whisperOptions.includeWordTimestamps}
                      onChange={(e) => setWhisperOptions(prev => ({
                        ...prev,
                        includeWordTimestamps: e.target.checked
                      }))}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Include Word-level Timestamps</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-center">
            <button
              type="submit"
              disabled={
                (inputMethod === 'youtube' && !youtubeUrl.trim()) || 
                (inputMethod === 'upload' && !selectedFile)
              }
              className="btn-primary inline-flex items-center space-x-2 text-lg px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-5 h-5" />
              <span>Start Transcription</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
