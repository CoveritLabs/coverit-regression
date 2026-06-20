// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { GitCommitAuthor, GitWorkflowOptions, GitWorkflowResult, PreparedGitWorkflow } from "@/types/gitWorkflow";
import GitClient from "@workflow/gitClient";
import GitHubPullRequestClient from "@workflow/gitHubPullRequestClient";
import { GIT_WORKFLOW_DEFAULTS } from "@constants/config";
import { logger } from "@utils/logger";

class GitWorkflowRunner {
  private readonly options?: GitWorkflowOptions;
  private readonly gitClient: GitClient;
  private readonly pullRequestClient: GitHubPullRequestClient;

  constructor(
    options?: GitWorkflowOptions,
    gitClient: GitClient = new GitClient(),
    pullRequestClient: GitHubPullRequestClient = new GitHubPullRequestClient(),
  ) {
    this.options = options;
    this.gitClient = gitClient;
    this.pullRequestClient = pullRequestClient;
  }

  async prepare(): Promise<PreparedGitWorkflow | undefined> {
    if (!this.options) return undefined;

    const repositoryUrl = this.options.regressionCodebase.repositoryUrl;
    const apiKey = this.options.regressionCodebase.apiKey;
    const targetBranch = this.options.codegenConfig.prTargetBranch?.trim();
    const outputPath = this.options.generatorOptions.outputPath;
    const branchName = this.resolveBranchName();
    const configuredBranch = Boolean(this.options.codegenConfig.codegenBranch?.trim());

    if (!repositoryUrl) throw new Error("[Git Workflow] repositoryUrl is required.");

    await this.gitClient.ensureRepository(repositoryUrl, apiKey, outputPath);
    const baseBranch = await this.resolveBaseBranch(outputPath, apiKey, targetBranch);
    await this.gitClient.fetch(outputPath, apiKey, baseBranch);
    await this.gitClient.checkoutRemoteBranch(outputPath, baseBranch);

    const preparedBranchName = await this.prepareCodegenBranch(outputPath, apiKey, branchName, baseBranch);

    return {
      branchName: preparedBranchName,
      repositoryUrl,
      repositoryPath: outputPath,
      apiKey,
      targetBranch,
      baseBranch,
      configuredBranch,
    };
  }

  async finalize(preparedWorkflow?: PreparedGitWorkflow): Promise<GitWorkflowResult> {
    if (!this.options || !preparedWorkflow) {
      return {
        branchName: "",
        changedFiles: [],
        noChanges: true,
        pushed: false,
      };
    }

    let changedFiles = await this.gitClient.getChangedFiles(preparedWorkflow.repositoryPath);
    if (!(await this.gitClient.hasChanges(preparedWorkflow.repositoryPath))) {
      logger.info("[Git Workflow] No changes detected after generation. Skipping push and pull request creation.");
      return {
        branchName: preparedWorkflow.branchName,
        changedFiles,
        noChanges: true,
        pushed: false,
      };
    }

    let branchName = preparedWorkflow.branchName;
    const commitMessage = this.resolveCommitMessage();
    const commitAuthor = this.resolveCommitAuthor();

    await this.gitClient.stageAll(preparedWorkflow.repositoryPath);
    await this.gitClient.commit(preparedWorkflow.repositoryPath, commitMessage, commitAuthor);
    try {
      await this.gitClient.push(preparedWorkflow.repositoryPath, preparedWorkflow.apiKey, branchName);
    } catch (error) {
      if (this.isWorkflowScopeRejection(error) && this.hasWorkflowFiles(changedFiles)) {
        logger.warn(
          "[Git Workflow] Token cannot push GitHub workflow changes. Removing .github/workflows from this generated commit and retrying.",
        );
        const hasPushableChanges = await this.gitClient.recommitWithoutWorkflowFiles(
          preparedWorkflow.repositoryPath,
          commitMessage,
          commitAuthor,
        );
        changedFiles = changedFiles.filter((file) => !this.isWorkflowFile(file));

        if (!hasPushableChanges || changedFiles.length === 0) {
          logger.warn("[Git Workflow] Only GitHub workflow files changed. Skipping push and pull request creation.");
          return {
            branchName,
            changedFiles: [],
            noChanges: true,
            pushed: false,
          };
        }

        try {
          await this.gitClient.push(preparedWorkflow.repositoryPath, preparedWorkflow.apiKey, branchName);
        } catch (retryError) {
          branchName = await this.pushFallbackBranch(preparedWorkflow, retryError);
        }
      } else {
        branchName = await this.pushFallbackBranch(preparedWorkflow, error);
      }
    }

    if (!preparedWorkflow.apiKey) {
      logger.warn("[Git Workflow] No GitHub API key configured. Changes were pushed, but pull request creation/update was skipped.");
      return {
        branchName,
        changedFiles,
        noChanges: false,
        pushed: true,
      };
    }

    if (!preparedWorkflow.targetBranch) {
      logger.warn("[Git Workflow] No PR target branch configured. Changes were pushed, but pull request creation/update was skipped.");
      return {
        branchName,
        changedFiles,
        noChanges: false,
        pushed: true,
      };
    }

    const pullRequest = await this.pullRequestClient.upsertPullRequest({
      repositoryUrl: preparedWorkflow.repositoryUrl,
      apiKey: preparedWorkflow.apiKey,
      title: this.resolvePullRequestTitle(),
      body: this.resolvePullRequestBody(changedFiles),
      headBranch: branchName,
      baseBranch: preparedWorkflow.targetBranch,
      isDraft: this.options.codegenConfig.prDraft ?? false,
    });

    return {
      branchName,
      changedFiles,
      noChanges: false,
      pushed: true,
      pullRequest,
    };
  }

  private async resolveBaseBranch(
    repositoryPath: string,
    apiKey: string | undefined,
    targetBranch: string | undefined,
  ): Promise<string> {
    if (targetBranch) {
      await this.gitClient.ensureRemoteBranchFromDefault(repositoryPath, apiKey, targetBranch);
      return targetBranch;
    }

    const defaultBranch = await this.gitClient.getDefaultBranch(repositoryPath, apiKey);
    logger.warn(`[Git Workflow] No PR target branch configured. Using default branch "${defaultBranch}" as generation base.`);
    return defaultBranch;
  }

  private async prepareCodegenBranch(
    repositoryPath: string,
    apiKey: string | undefined,
    branchName: string,
    targetBranch: string,
  ): Promise<string> {
    try {
      if (await this.gitClient.remoteBranchExists(repositoryPath, apiKey, branchName)) {
        logger.info(`[Git Workflow] Extending existing branch "${branchName}".`);
        await this.gitClient.fetch(repositoryPath, apiKey, branchName);
        await this.gitClient.checkoutRemoteBranch(repositoryPath, branchName);
      } else {
        logger.info(`[Git Workflow] Creating branch "${branchName}" from "${targetBranch}".`);
        await this.gitClient.createBranchFromBase(repositoryPath, branchName, targetBranch);
      }
      return branchName;
    } catch (error) {
      const fallbackBranch = this.resolveFallbackBranchName(branchName);
      logger.warn(
        `[Git Workflow] Could not prepare branch "${branchName}". Falling back to "${fallbackBranch}". ${(error as Error).message}`,
      );
      await this.gitClient.checkoutRemoteBranch(repositoryPath, targetBranch);
      await this.gitClient.createBranchFromBase(repositoryPath, fallbackBranch, targetBranch);
      return fallbackBranch;
    }
  }

  private async pushFallbackBranch(preparedWorkflow: PreparedGitWorkflow, error: unknown): Promise<string> {
    const fallbackBranch = this.resolveFallbackBranchName(preparedWorkflow.branchName);
    logger.warn(
      `[Git Workflow] Push to "${preparedWorkflow.branchName}" failed. Falling back to "${fallbackBranch}". ${(error as Error).message}`,
    );
    await this.gitClient.createBranchFromHead(preparedWorkflow.repositoryPath, fallbackBranch);
    await this.gitClient.push(preparedWorkflow.repositoryPath, preparedWorkflow.apiKey, fallbackBranch);
    return fallbackBranch;
  }

  private resolveBranchName(): string {
    const configuredBranch = this.options!.codegenConfig.codegenBranch?.trim();
    if (configuredBranch) return configuredBranch;

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    return `${GIT_WORKFLOW_DEFAULTS.branchPrefix}/${timestamp}`;
  }

  private resolveFallbackBranchName(previousBranchName: string): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 8);
    const fallback = `${GIT_WORKFLOW_DEFAULTS.branchPrefix}/${timestamp}-${suffix}`;
    return fallback === previousBranchName ? `${fallback}-fallback` : fallback;
  }

  private isWorkflowScopeRejection(error: unknown): boolean {
    const message = (error as Error).message ?? "";
    return (
      message.includes("refusing to allow a Personal Access Token") &&
      message.includes("workflow") &&
      message.includes(".github/workflows")
    );
  }

  private hasWorkflowFiles(changedFiles: string[]): boolean {
    return changedFiles.some((file) => this.isWorkflowFile(file));
  }

  private isWorkflowFile(file: string): boolean {
    return file.replace(/\\/g, "/").startsWith(".github/workflows/");
  }

  private resolveCommitMessage(): string {
    return this.options!.commitMessage?.trim() || GIT_WORKFLOW_DEFAULTS.commitMessage;
  }

  private resolveCommitAuthor(): GitCommitAuthor {
    return {
      name: this.options!.commitAuthorName?.trim() || GIT_WORKFLOW_DEFAULTS.commitAuthorName,
      email: this.options!.commitAuthorEmail?.trim() || GIT_WORKFLOW_DEFAULTS.commitAuthorEmail,
    };
  }

  private resolvePullRequestTitle(): string {
    return this.options!.codegenConfig.prTitle?.trim() || GIT_WORKFLOW_DEFAULTS.pullRequestTitle;
  }

  private resolvePullRequestBody(changedFiles: string[]): string {
    if (this.options!.codegenConfig.prBody?.trim()) {
      return this.options!.codegenConfig.prBody;
    }

    const changedFilesSummary =
      changedFiles.length > 0 ? changedFiles.map((file) => `- ${file}`).join("\n") : "- Generated file updates";
    return [
      GIT_WORKFLOW_DEFAULTS.pullRequestBodyIntro,
      "",
      GIT_WORKFLOW_DEFAULTS.pullRequestBodyHeading,
      changedFilesSummary,
    ].join("\n");
  }
}

export default GitWorkflowRunner;
