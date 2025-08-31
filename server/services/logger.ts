import winston from "winston";
import path from "path";

// Create logs directory path
const logsDir = path.join(process.cwd(), "logs");

// Configure winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: "trade-signal-monitor" },
  transports: [
    // Error log file - only errors
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    // Combined log file - all levels
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
  ],
});

// Export logger instance
export { logger };
