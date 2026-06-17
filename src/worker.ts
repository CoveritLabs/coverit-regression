// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { logger } from "@utils/logger";
import { Job, Worker } from "bullmq";
import IORedis from "ioredis";

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

async function startup(): Promise<void> {
  logger.info("[Worker] Initialization completed. Connected to database and services.");
}

async function shutdown(): Promise<void> {
  await redisConnection.quit();
  logger.info("[Worker] Gracefully closed all connections.");
}

const worker = new Worker(
  "bdd-processing-queue", // The name of the queue this worker consumes from
  async (job: Job) => {
    switch (job.name) {
      case "task_process_bdd_output":
        console.log(job.data) //! CONTAINS THE DATA FROM THE DOCGEN
        return { success: true, message: "Processed successfully" };
      default:
        throw new Error(`Unsupported job type: ${job.name}`);
    }
  },
  {
    connection: redisConnection as any,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "1", 10),
    settings: {
      backoffStrategy: (attemptsMade: number) => {
        return attemptsMade * 500;
      },
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
  console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
});

process.on("SIGTERM", async () => {
  logger.info("[Worker] SIGTERM received. Shutting down worker...");
  await worker.close();
  await shutdown();
  process.exit(0);
});
