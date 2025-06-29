import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Upload, 
  Zap, 
  Shield, 
  Clock, 
  CheckCircle,
  ArrowRight,
  Play,
  Download,
  Globe
} from 'lucide-react';
import { apiService } from '../services/api';

export function HomePage() {
  const [systemHealth, setSystemHealth] = useState<{
    status: string;
    services: Record<string, boolean>;
  } | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await apiService.checkHealth();
        setSystemHealth(health);
      } catch (error) {
        console.error('Failed to check system health:', error);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: Zap,
      title: 'AI-Powered Transcription',
      description: 'Advanced speech-to-text using OpenAI Whisper with multiple model sizes for optimal accuracy and speed.',
    },
    {
      icon: Shield,
      title: 'Local Processing',
      description: 'All processing happens locally on your infrastructure. Your data never leaves your environment.',
    },
    {
      icon: Clock,
      title: 'Real-time Progress',
      description: 'Track your transcription jobs in real-time with detailed progress updates and status monitoring.',
    },
    {
      icon: FileText,
      title: 'Multiple Formats',
      description: 'Export transcriptions in various formats including plain text, SRT, VTT, and JSON with timestamps.',
    },
    {
      icon: Upload,
      title: 'Flexible Input',
      description: 'Process YouTube videos by URL or upload your own audio files directly for transcription.',
    },
    {
      icon: Globe,
      title: 'Multi-language Support',
      description: 'Automatic language detection or manual specification for accurate transcription in multiple languages.',
    },
  ];

  const steps = [
    {
      number: 1,
      title: 'Input Your Content',
      description: 'Paste a YouTube URL or upload an audio file',
      icon: Upload,
    },
    {
      number: 2,
      title: 'Configure Options',
      description: 'Choose AI model, language, and enhancement settings',
      icon: FileText,
    },
    {
      number: 3,
      title: 'AI Processing',
      description: 'Whisper transcribes and Ollama enhances the text',
      icon: Zap,
    },
    {
      number: 4,
      title: 'Download Results',
      description: 'Get your transcription in multiple formats',
      icon: Download,
    },
  ];

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900">
            AI-Powered
            <span className="text-primary-600"> YouTube Transcription</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Transform YouTube videos and audio files into accurate transcriptions using 
            local AI processing with OpenAI Whisper and Ollama. Fast, secure, and private.
          </p>
        </div>

        {/* System Status */}
        {systemHealth && (
          <div className="inline-flex items-center space-x-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            <span>All Systems Operational</span>
            <span className="text-green-600">
              ({Object.values(systemHealth.services).filter(Boolean).length}/{Object.keys(systemHealth.services).length} services online)
            </span>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="flex justify-center">
          <Link
            to="/transcribe"
            className="btn-primary inline-flex items-center space-x-2 text-lg px-8 py-3"
          >
            <Play className="w-5 h-5" />
            <span>Start Transcribing</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Our streamlined process makes transcription simple and efficient
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                    <Icon className="w-8 h-8 text-primary-600" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {step.number}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gray-200 -translate-y-0.5" />
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                  <p className="text-gray-600">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features Grid */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-gray-900">Powerful Features</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need for professional-grade transcription
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="card space-y-4">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-primary-50 rounded-2xl p-8 md:p-12">
        <div className="text-center space-y-8">
          <h2 className="text-3xl font-bold text-gray-900">Built for Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary-600">5+</div>
              <div className="text-lg font-medium text-gray-900">AI Models</div>
              <div className="text-gray-600">Whisper model sizes for optimal accuracy</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary-600">100%</div>
              <div className="text-lg font-medium text-gray-900">Local Processing</div>
              <div className="text-gray-600">Your data never leaves your infrastructure</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary-600">4</div>
              <div className="text-lg font-medium text-gray-900">Output Formats</div>
              <div className="text-gray-600">TXT, SRT, VTT, and JSON with timestamps</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center space-y-8 py-16">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-gray-900">Ready to Get Started?</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Start transcribing your YouTube videos and audio files with AI-powered accuracy
          </p>
        </div>
        <Link
          to="/transcribe"
          className="btn-primary inline-flex items-center space-x-2 text-lg px-8 py-3"
        >
          <Play className="w-5 h-5" />
          <span>Start Your First Transcription</span>
          <ArrowRight className="w-5 h-5" />
        </Link>
      </section>
    </div>
  );
}
