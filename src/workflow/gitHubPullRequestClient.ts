// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { PullRequestRequest, PullRequestResponse } from "@/types/gitWorkflow";
import { logger } from "@utils/logger";

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchLikeResponse>;

class GitHubPullRequestClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch as FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  async createPullRequest(request: PullRequestRequest): Promise<PullRequestResponse> {
    const repository = this.parseRepository(request.repositoryUrl);

    const cleanHeadBranch = request.headBranch.includes(":")
      ? request.headBranch.split(":").pop()!
      : request.headBranch;

    await this.waitForBranchRef(repository.owner, repository.repo, cleanHeadBranch, request.apiKey);

    const apiUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/pulls`;
    logger.info(`[Git Workflow] Submitting PR request for branch "${cleanHeadBranch}" into "${request.baseBranch}"...`);

    const response = await this.fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "coverit-regression-generator",
      },
      body: JSON.stringify({
        title: request.title,
        body: request.body,
        head: cleanHeadBranch,
        base: request.baseBranch,
        draft: request.isDraft,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[Git Workflow] Failed to create pull request (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json()) as { html_url?: string; number?: number };
    if (!payload.html_url || typeof payload.number !== "number") {
      throw new Error("[Git Workflow] GitHub pull request response did not include expected fields.");
    }

    return {
      url: payload.html_url,
      number: payload.number,
    };
  }

  private async waitForBranchRef(owner: string, repo: string, branch: string, apiKey: string): Promise<void> {
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`;
    const maxRetries = 5;
    let delayMs = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(
        `[Git Workflow] Verifying remote reference visibility for "${branch}" (Attempt ${attempt}/${maxRetries})...`,
      );

      const response = await this.fetchImpl(refUrl, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "coverit-regression-generator",
        },
      });

      if (response.ok) {
        logger.info(`[Git Workflow] Remote ref verified. Branch "${branch}" is readable.`);
        return;
      }

      if (attempt < maxRetries) {
        logger.warn(`[Git Workflow] Branch ref not found or unreadable yet. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 1.5;
      }
    }

    throw new Error(
      `[Git Workflow] Aborted PR creation: Branch "refs/heads/${branch}" never became readable on GitHub remote.`,
    );
  }

  private parseRepository(repositoryUrl: string): { owner: string; repo: string } {
    const httpsMatch = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (!httpsMatch) {
      throw new Error(`[Git Workflow] Unsupported GitHub repository URL: ${repositoryUrl}`);
    }

    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    };
  }
}

export default GitHubPullRequestClient;
