import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  Link as LinkIcon, 
  FileAudio, 
  Settings, 
  Play,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { apiService } from '../services/api';
import { WhisperOptions, TextEnhancementOptions } from '../types';
import { isValidYouTubeUrl } from '../utils';

type InputMethod = 'youtube' | 'upload';

export function TranscriptionPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [inputMethod, setInputMethod] = useState<InputMethod>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

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
        // For file upload, we get a jobId, so we'll navigate to the job detail page
        navigate(`/jobs/${result.jobId}`);
        return;
      }

      // Navigate to the workflow execution page
      navigate(`/jobs/${executionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Start Transcription</h1>
        <p className="text-lg text-gray-600">
          Choose your input method and configure AI processing options
        </p>
      </div>

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

        {/* Error Display */}
        {error && (
          <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isLoading || (inputMethod === 'youtube' && !youtubeUrl.trim()) || (inputMethod === 'upload' && !selectedFile)}
            className="btn-primary inline-flex items-center space-x-2 text-lg px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            <span>{isLoading ? 'Starting...' : 'Start Transcription'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
