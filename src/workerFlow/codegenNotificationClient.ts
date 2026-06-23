// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { logger } from "@utils/logger";
import type { GitWorkflowResult } from "@/types/gitWorkflow";

export interface CodegenNotificationClientOptions {
  baseUrl?: string;
  internalServiceToken?: string;
}

export default class CodegenNotificationClient {
  private readonly baseUrl?: string;
  private readonly internalServiceToken?: string;

  constructor(options: CodegenNotificationClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.COVERIT_API_INTERNAL_URL ??
      process.env.COVERIT_API_BASE_URL
    )?.replace(/\/$/, "");
    this.internalServiceToken = options.internalServiceToken ?? process.env.INTERNAL_SERVICE_TOKEN;
  }

  async notifyGenerated(sessionId: string, git: GitWorkflowResult, flowIds: string[] = []): Promise<void> {
    await this.post(sessionId, {
      status: "generated",
      branchName: git.branchName,
      changedFiles: git.changedFiles,
      noChanges: git.noChanges,
      pushed: git.pushed,
      pullRequestUrl: git.pullRequest?.url ?? null,
      flowIds,
    });
  }

  async notifyFailed(sessionId: string, errorMessage: string): Promise<void> {
    await this.post(sessionId, {
      status: "failed",
      errorMessage,
    });
  }

  private async post(sessionId: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.baseUrl || !this.internalServiceToken) {
      logger.warn("[Worker] Codegen notification skipped because API URL or internal token is not configured.");
      return;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/internal/notifications/codegen/${encodeURIComponent(sessionId)}/notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CoverIt-Internal-Token": this.internalServiceToken,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        logger.warn(`[Worker] Codegen notification failed: ${response.status} ${body}`);
      }
    } catch (error) {
      logger.warn(`[Worker] Codegen notification failed: ${(error as Error).message}`);
    }
  }
}
