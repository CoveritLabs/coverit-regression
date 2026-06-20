// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import fs from "fs/promises";
import os from "os";
import path from "path";

import { PATHS } from "@constants/paths";
import { logger } from "@utils/logger";

const GENERATED_FOLDER_PATTERN = /^generated-.+-(\d{13})$/;
const DEFAULT_CLEANUP_INTERVAL_MS = 900_000;
const DEFAULT_MAX_AGE_MS = 7_200_000;

export async function cleanupGeneratedFolders(tmpPath: string = PATHS.TMP, maxAgeMs: number = DEFAULT_MAX_AGE_MS): Promise<number> {
  return cleanupGeneratedFoldersInRoot(path.resolve(tmpPath), maxAgeMs);
}

export async function cleanupKnownGeneratedFolders(maxAgeMs: number = DEFAULT_MAX_AGE_MS): Promise<number> {
  const roots = new Set([PATHS.TMP, path.join(os.tmpdir(), "coverit-regression")].map((root) => path.resolve(root)));
  let removed = 0;
  for (const root of roots) {
    removed += await cleanupGeneratedFoldersInRoot(root, maxAgeMs);
  }
  return removed;
}

async function cleanupGeneratedFoldersInRoot(root: string, maxAgeMs: number): Promise<number> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    if (isPermissionError(error)) {
      logger.warn(`[Worker] Skipping generated folder cleanup for unreadable path: ${root}`);
      return [];
    }
    throw error;
  });
  const now = Date.now();
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const match = entry.name.match(GENERATED_FOLDER_PATTERN);
    if (!match) continue;
    if (now - Number.parseInt(match[1], 10) < maxAgeMs) continue;

    let didRemove = true;
    await fs.rm(path.join(root, entry.name), { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => {
      if (!isPermissionError(error)) throw error;
      logger.warn(`[Worker] Could not remove generated folder: ${path.join(root, entry.name)}`);
      didRemove = false;
    });
    if (didRemove) removed += 1;
  }

  return removed;
}

export function startOutputCleanupSchedule(): NodeJS.Timeout | undefined {
  if (!parseBoolean(process.env.REGRESSION_OUTPUT_CLEANUP_ENABLED, true)) {
    logger.info("[Worker] Output cleanup schedule is disabled.");
    return undefined;
  }

  const intervalMs = parseInteger(process.env.REGRESSION_OUTPUT_CLEANUP_INTERVAL_MS, DEFAULT_CLEANUP_INTERVAL_MS);
  const maxAgeMs = parseInteger(process.env.REGRESSION_OUTPUT_MAX_AGE_MS, DEFAULT_MAX_AGE_MS);

  const runCleanup = async () => {
    try {
      const removed = await cleanupKnownGeneratedFolders(maxAgeMs);
      if (removed > 0) logger.info(`[Worker] Removed ${removed} expired generated folder(s).`);
    } catch (error) {
      logger.warn(`[Worker] Output cleanup failed. ${(error as Error).message}`);
    }
  };

  void runCleanup();
  const timer = setInterval(runCleanup, intervalMs);
  timer.unref?.();
  logger.info(`[Worker] Output cleanup schedule enabled. intervalMs=${intervalMs}, maxAgeMs=${maxAgeMs}.`);
  return timer;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}
