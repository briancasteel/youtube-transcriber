import winston from 'winston';

const logLevel = process.env['LOG_LEVEL'] || 'info';
const nodeEnv = process.env['NODE_ENV'] || 'development';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'workflow-service',
    environment: nodeEnv
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transport in production
if (nodeEnv === 'production') {
  logger.add(new winston.transports.File({
    filename: '/app/logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: '/app/logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

export default logger;
