import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Download,
  Copy,
  Trash2,
  RefreshCw,
  FileText,
  Calendar,
  Settings,
  Zap,
  AlertCircle
} from 'lucide-react';
import { apiService } from '../services/api';
import { TranscriptionJob, TranscriptionResult } from '../types';
import { formatRelativeTime, formatDuration, downloadFile, copyToClipboard } from '../utils';

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const loadJobData = async () => {
    if (!jobId) return;
    
    try {
      setError(null);
      const jobData = await apiService.getTranscriptionJob(jobId);
      setJob(jobData);
      
      // If job is completed, load the result
      if (jobData.status === 'completed') {
        try {
          const resultData = await apiService.getTranscriptionResult(jobId);
          setResult(resultData);
        } catch (resultError) {
          console.warn('Failed to load result:', resultError);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadJobData();
  };

  const handleCancel = async () => {
    if (!jobId || !job) return;
    
    try {
      await apiService.cancelTranscriptionJob(jobId);
      await loadJobData(); // Refresh to show updated status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
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

  useEffect(() => {
    loadJobData();
    
    // Auto-refresh for active jobs
    let interval: number;
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      interval = window.setInterval(loadJobData, 5000); // Refresh every 5 seconds for active jobs
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, job?.status]);

  const getStatusIcon = (status: TranscriptionJob['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: TranscriptionJob['status']) => {
    switch (status) {
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          <span className="text-lg text-gray-600">Loading job details...</span>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/jobs')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Jobs</span>
        </button>
        
        <div className="card text-center py-12">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {error || 'Job not found'}
          </h3>
          <p className="text-gray-600 mb-6">
            The job you're looking for doesn't exist or couldn't be loaded.
          </p>
          <button
            onClick={() => navigate('/jobs')}
            className="btn-primary"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/jobs')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Jobs</span>
        </button>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary inline-flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          {(job.status === 'queued' || job.status === 'processing') && (
            <button
              onClick={handleCancel}
              className="btn-secondary inline-flex items-center space-x-2 text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Job Overview */}
      <div className="card">
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {job.originalFilename || `Job ${job.jobId.slice(0, 8)}`}
            </h1>
            <p className="text-gray-600">Job ID: {job.jobId}</p>
          </div>
          
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${getStatusColor(job.status)}`}>
            {getStatusIcon(job.status)}
            <span className="font-medium">
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {job.status === 'processing' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm text-gray-600">{job.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {job.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800">Error</h4>
                <p className="text-red-700 mt-1">{job.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Job Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
              <Calendar className="w-5 h-5" />
              <span>Timeline</span>
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Created:</span>
                <span className="text-gray-900">{formatRelativeTime(job.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Updated:</span>
                <span className="text-gray-900">{formatRelativeTime(job.updatedAt)}</span>
              </div>
              {job.completedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Completed:</span>
                  <span className="text-gray-900">{formatRelativeTime(job.completedAt)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Configuration</span>
            </h3>
            <div className="space-y-2 text-sm">
              {job.whisperOptions && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Model:</span>
                    <span className="text-gray-900">{job.whisperOptions.model || 'base'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Format:</span>
                    <span className="text-gray-900">{job.whisperOptions.outputFormat || 'txt'}</span>
                  </div>
                  {job.whisperOptions.language && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Language:</span>
                      <span className="text-gray-900">{job.whisperOptions.language}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Performance Metrics */}
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Performance Metrics</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {formatDuration(result.processingTime.whisperDuration / 1000)}
                </div>
                <div className="text-sm text-gray-600">Whisper Processing</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {formatDuration(result.processingTime.enhancementDuration / 1000)}
                </div>
                <div className="text-sm text-gray-600">Enhancement</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {formatDuration(result.processingTime.totalDuration / 1000)}
                </div>
                <div className="text-sm text-gray-600">Total Time</div>
              </div>
            </div>
          </div>

          {/* Transcription Result */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Transcription</span>
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleCopyText(result.enhancement?.enhancedText || result.transcription.text)}
                  className="btn-secondary inline-flex items-center space-x-2"
                >
                  <Copy className="w-4 h-4" />
                  <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => handleDownload(
                    result.enhancement?.enhancedText || result.transcription.text,
                    `transcription-${job.jobId.slice(0, 8)}.txt`,
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
                {result.enhancement?.enhancedText || result.transcription.text}
              </pre>
            </div>
            
            {result.transcription.language && (
              <div className="mt-2 text-sm text-gray-600">
                Detected language: {result.transcription.language}
              </div>
            )}
          </div>

          {/* Enhancement Results */}
          {result.enhancement && (
            <div className="space-y-6">
              {/* Summary */}
              {result.enhancement.summary && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Summary</h3>
                    <button
                      onClick={() => handleCopyText(result.enhancement!.summary!)}
                      className="btn-secondary inline-flex items-center space-x-2"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-gray-900">{result.enhancement.summary}</p>
                  </div>
                </div>
              )}

              {/* Keywords */}
              {result.enhancement.keywords && result.enhancement.keywords.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Keywords</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.enhancement.keywords.map((keyword, index) => (
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

              {/* Improvements */}
              <div className="card">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Applied Improvements</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`p-3 rounded-lg ${result.enhancement.improvements.punctuationAdded ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}>
                    <div className="flex items-center space-x-2">
                      {result.enhancement.improvements.punctuationAdded ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium">Punctuation Added</span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${result.enhancement.improvements.grammarFixed ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}>
                    <div className="flex items-center space-x-2">
                      {result.enhancement.improvements.grammarFixed ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium">Grammar Fixed</span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${result.enhancement.improvements.clarityImproved ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}>
                    <div className="flex items-center space-x-2">
                      {result.enhancement.improvements.clarityImproved ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium">Clarity Improved</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
