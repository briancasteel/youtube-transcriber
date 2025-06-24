import winston from 'winston';

const logLevel = process.env['LOG_LEVEL'] || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, service = 'video-processor', requestId, ...meta }) => {
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [${service}] ${message}`;
      const requestInfo = requestId ? ` (req: ${requestId})` : '';
      const metaInfo = Object.keys(meta).length > 0 ? `\nData: ${JSON.stringify(meta, null, 2)}` : '';
      return `${logEntry}${requestInfo}${metaInfo}`;
    })
  ),
  defaultMeta: { service: 'video-processor' },
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
if (process.env['NODE_ENV'] === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));

  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
}

export default logger;
