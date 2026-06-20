// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import dotenv from "dotenv";
dotenv.config();

import { Job, Worker } from "bullmq";
import IORedis from "ioredis";

import { logger } from "@utils/logger";
import { processBddOutputJob } from "@/workerFlow/processor";
import PostgresCrawlSessionRepository from "@/workerFlow/crawlSessionRepository";
import { startOutputCleanupSchedule } from "@/workerFlow/outputCleanup";

const QUEUE_NAME = "bdd-processing-queue";
const BDD_OUTPUT_JOB_NAME = "task_process_bdd_output";

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

const sessionRepository = new PostgresCrawlSessionRepository();
const outputCleanupTimer = startOutputCleanupSchedule();

async function startup(): Promise<void> {
  logger.info("[Worker] Initialization completed. Connected to database and services.");
}

async function shutdown(): Promise<void> {
  if (outputCleanupTimer) clearInterval(outputCleanupTimer);
  await sessionRepository.close();
  await redisConnection.quit();
  logger.info("[Worker] Gracefully closed all connections.");
}

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    switch (job.name) {
      case BDD_OUTPUT_JOB_NAME:
        return processBddOutputJob(
          { jobId: job.id, data: job.data },
          {
            sessionRepository,
          },
        );
      default:
        throw new Error(`Unsupported job type: ${job.name}`);
    }
  },
  {
    connection: redisConnection as any,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "1", 10),
    settings: {
      backoffStrategy: (attemptsMade: number) => attemptsMade * 500,
    },
  },
);

worker.on("ready", async () => {
  await startup();
  logger.info("[Worker] Ready to receive and process tasks.");
});

worker.on("completed", (job: Job) => {
  logger.info(`[Worker] Job ${job.id} (${job.name}) completed successfully.`);
});

worker.on("failed", (job: Job | undefined, err: Error) => {
  logger.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
});

process.on("SIGTERM", async () => {
  logger.info("[Worker] SIGTERM received. Shutting down worker...");
  await worker.close();
  await shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("[Worker] SIGINT received. Shutting down worker...");
  await worker.close();
  await shutdown();
  process.exit(0);
});
