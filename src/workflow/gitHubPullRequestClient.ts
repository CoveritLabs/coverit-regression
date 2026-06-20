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
    const cleanHeadBranch = this.cleanBranchName(request.headBranch);

    await this.waitForBranchRef(repository.owner, repository.repo, cleanHeadBranch, request.apiKey);

    const apiUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/pulls`;
    logger.info(`[Git Workflow] Submitting PR request for branch "${cleanHeadBranch}" into "${request.baseBranch}"...`);

    const response = await this.fetchImpl(apiUrl, {
      method: "POST",
      headers: this.headers(request.apiKey, true),
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

  async upsertPullRequest(request: PullRequestRequest): Promise<PullRequestResponse> {
    const repository = this.parseRepository(request.repositoryUrl);
    const cleanHeadBranch = this.cleanBranchName(request.headBranch);
    const existing = await this.findOpenPullRequest(request);
    if (existing) {
      logger.info(`[Git Workflow] Updating existing pull request #${existing.number} for branch "${cleanHeadBranch}".`);
      return this.updatePullRequest(request, existing.number);
    }

    return this.createPullRequest({
      ...request,
      headBranch: cleanHeadBranch,
      repositoryUrl: `https://github.com/${repository.owner}/${repository.repo}.git`,
    });
  }

  async findOpenPullRequest(request: PullRequestRequest): Promise<PullRequestResponse | undefined> {
    const repository = this.parseRepository(request.repositoryUrl);
    const cleanHeadBranch = this.cleanBranchName(request.headBranch);
    const params = new URLSearchParams({
      state: "open",
      head: `${repository.owner}:${cleanHeadBranch}`,
      base: request.baseBranch,
      per_page: "1",
    });
    const apiUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/pulls?${params.toString()}`;

    const response = await this.fetchImpl(apiUrl, {
      method: "GET",
      headers: this.headers(request.apiKey),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[Git Workflow] Failed to find pull requests (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json()) as Array<{ html_url?: string; number?: number }>;
    const pullRequest = payload[0];
    if (!pullRequest) return undefined;
    if (!pullRequest.html_url || typeof pullRequest.number !== "number") {
      throw new Error("[Git Workflow] GitHub pull request search response did not include expected fields.");
    }

    return {
      url: pullRequest.html_url,
      number: pullRequest.number,
    };
  }

  async updatePullRequest(request: PullRequestRequest, pullRequestNumber: number): Promise<PullRequestResponse> {
    const repository = this.parseRepository(request.repositoryUrl);
    const apiUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/pulls/${pullRequestNumber}`;

    const response = await this.fetchImpl(apiUrl, {
      method: "PATCH",
      headers: this.headers(request.apiKey, true),
      body: JSON.stringify({
        title: request.title,
        body: request.body,
        base: request.baseBranch,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[Git Workflow] Failed to update pull request (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json()) as { html_url?: string; number?: number };
    if (!payload.html_url || typeof payload.number !== "number") {
      throw new Error("[Git Workflow] GitHub pull request update response did not include expected fields.");
    }

    return {
      url: payload.html_url,
      number: payload.number,
    };
  }

  private async waitForBranchRef(owner: string, repo: string, branch: string, apiKey: string | undefined): Promise<void> {
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`;
    const maxRetries = 5;
    let delayMs = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(
        `[Git Workflow] Verifying remote reference visibility for "${branch}" (Attempt ${attempt}/${maxRetries})...`,
      );

      const response = await this.fetchImpl(refUrl, {
        method: "GET",
        headers: this.headers(apiKey),
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

  private cleanBranchName(branchName: string): string {
    return branchName.includes(":") ? branchName.split(":").pop()! : branchName;
  }

  private headers(apiKey: string | undefined, hasBody: boolean = false): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      "User-Agent": "coverit-regression-generator",
    };
  }
}

export default GitHubPullRequestClient;
