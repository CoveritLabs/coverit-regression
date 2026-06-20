// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

const currentLogLevel = process.env.LOG_LEVEL || "info";
const configuredFileLogPaths = new Set<string>();

export const logger = winston.createLogger({
  level: currentLogLevel,
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), logFormat),
  transports: [
    new winston.transports.Console({
      level: currentLogLevel,
      format: combine(colorize({ all: true })),
    }),
  ],
});

export function setupLogger(options: { logToFile?: boolean; logPath?: string }) {
  logger.info(`Current log level: ${currentLogLevel}`);

  if (options.logToFile) {
    const filename = options.logPath || "combined.log";
    if (configuredFileLogPaths.has(filename)) {
      logger.info(`File logging already initialized at: ${filename}`);
      return;
    }

    logger.add(
      new winston.transports.File({
        filename,
        level: currentLogLevel,
      }),
    );
    configuredFileLogPaths.add(filename);

    logger.info(`File logging initialized at: ${filename}`);
  }
}
