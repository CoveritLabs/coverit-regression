// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), logFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize({ all: true }), timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), logFormat),
    }),
  ],
});

export function setupLogger(options: { logToFile?: boolean; logPath?: string }) {
  if (options.logToFile) {
    const filename = options.logPath || "combined.log";

    logger.add(
      new winston.transports.File({
        filename,
        format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), logFormat),
      }),
    );

    logger.info(`File logging initialized at: ${filename}`);
  }
}
