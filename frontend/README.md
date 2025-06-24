# YouTube Transcriber Frontend

A modern React frontend application for the YouTube Transcriber system, providing an intuitive user interface for AI-powered video transcription.

## Features

- **Modern React Architecture**: Built with React 18, TypeScript, and Vite for optimal performance
- **Responsive Design**: Mobile-first design using Tailwind CSS
- **Real-time Updates**: Live job status monitoring and progress tracking
- **Multiple Input Methods**: Support for YouTube URLs and direct file uploads
- **Advanced Configuration**: Comprehensive AI model and enhancement options
- **Results Management**: Download, copy, and view transcription results in multiple formats
- **Professional UI**: Clean, intuitive interface with comprehensive job management

## Technology Stack

- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Lucide React** - Beautiful icon library
- **Axios** - HTTP client for API communication

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - API Gateway: http://localhost:8000 (backend)

### Production Build

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Preview production build**:
   ```bash
   npm run preview
   ```

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   └── Layout.tsx       # Main layout component
│   ├── pages/               # Page components
│   │   ├── HomePage.tsx     # Landing page
│   │   ├── TranscriptionPage.tsx  # Transcription form
│   │   ├── JobsPage.tsx     # Jobs listing
│   │   └── JobDetailPage.tsx      # Job details and results
│   ├── services/            # API service layer
│   │   └── api.ts           # API client and methods
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts         # Shared types
│   ├── utils/               # Utility functions
│   │   └── index.ts         # Helper functions
│   ├── hooks/               # Custom React hooks (future)
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles and Tailwind imports
├── public/                  # Static assets
├── dist/                    # Production build output
├── Dockerfile               # Container configuration
├── nginx.conf               # Nginx configuration for production
├── package.json             # Dependencies and scripts
├── tailwind.config.js       # Tailwind CSS configuration
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

## Key Features

### 1. Home Page
- System overview and feature highlights
- Real-time system health monitoring
- Quick access to transcription and jobs
- Performance statistics and capabilities

### 2. Transcription Page
- **Input Methods**:
  - YouTube URL input with validation
  - Audio file upload (drag & drop)
- **AI Configuration**:
  - Whisper model selection (tiny to large)
  - Output format selection (TXT, SRT, VTT, JSON)
  - Text enhancement options
  - Advanced settings (language, temperature, timestamps)

### 3. Jobs Management
- **Jobs Listing**:
  - Real-time status updates
  - Progress tracking for active jobs
  - Search and filter capabilities
  - Pagination support
- **Job Details**:
  - Comprehensive job information
  - Real-time progress monitoring
  - Error handling and display
  - Performance metrics

### 4. Results Viewing
- **Transcription Display**:
  - Formatted text output
  - Copy to clipboard functionality
  - Download in multiple formats
- **Enhancement Results**:
  - AI-generated summaries
  - Extracted keywords
  - Applied improvements tracking

## API Integration

The frontend communicates with the backend through a comprehensive API service layer:

- **Video Processing**: YouTube URL validation and processing
- **File Upload**: Direct audio file transcription
- **Workflow Management**: YouTube transcription pipeline
- **Job Monitoring**: Real-time status and progress tracking
- **Results Retrieval**: Transcription and enhancement results

## Configuration

### Environment Variables

The application uses the following configuration:

- **Development**: API proxy configured in `vite.config.ts`
- **Production**: Nginx proxy configuration in `nginx.conf`

### API Endpoints

All API calls are proxied through `/api/` to the backend API Gateway:

- `/api/video/*` - Video processing endpoints
- `/api/workflow/*` - Workflow orchestration
- `/api/llm/*` - LLM service endpoints
- `/api/health/*` - Health monitoring

## Docker Deployment

### Development
```bash
# Run with docker-compose (includes all services)
docker-compose up --build
```

### Production
```bash
# Build production image
docker build -t youtube-transcriber-frontend .

# Run container
docker run -p 3000:80 youtube-transcriber-frontend
```

## Performance Optimizations

- **Code Splitting**: Automatic route-based code splitting
- **Asset Optimization**: Vite's built-in optimizations
- **Caching**: Nginx-based static asset caching
- **Compression**: Gzip compression for all text assets
- **Bundle Analysis**: Optimized bundle size with tree shaking

## Security Features

- **Content Security Policy**: Configured in Nginx
- **XSS Protection**: Security headers enabled
- **Input Validation**: Client-side and server-side validation
- **CORS Configuration**: Proper cross-origin resource sharing

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development Guidelines

### Code Style
- TypeScript strict mode enabled
- ESLint configuration for code quality
- Consistent component structure
- Proper error handling

### Component Architecture
- Functional components with hooks
- Props interface definitions
- Proper state management
- Reusable utility functions

### API Integration
- Centralized API service
- Proper error handling
- Loading states management
- Type-safe API responses

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new interfaces
3. Include proper error handling
4. Test components thoroughly
5. Update documentation as needed

## License

This project is part of the YouTube Transcriber system and follows the same licensing terms.
