// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { GitWorkflowOptions, GitWorkflowResult, PreparedGitWorkflow } from "@/types/gitWorkflow";
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
    const targetBranch = this.options.codegenConfig.prTargetBranch;
    const outputPath = this.options.generatorOptions.outputPath;
    const branchName = this.resolveBranchName();

    if (!repositoryUrl) throw new Error("[Git Workflow] repositoryUrl is required.");
    if (!apiKey) throw new Error("[Git Workflow] apiKey is required for GitHub workflow execution.");
    if (!targetBranch) throw new Error("[Git Workflow] prTargetBranch is required.");

    await this.gitClient.ensureRepository(repositoryUrl, apiKey, outputPath);
    await this.gitClient.fetch(outputPath, apiKey, targetBranch);
    await this.gitClient.checkoutRemoteBranch(outputPath, targetBranch);
    await this.gitClient.createOrResetBranch(outputPath, branchName, targetBranch);

    return {
      branchName,
      repositoryUrl,
      repositoryPath: outputPath,
      apiKey,
      targetBranch,
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

    const changedFiles = await this.gitClient.getChangedFiles(preparedWorkflow.repositoryPath);
    if (!(await this.gitClient.hasChanges(preparedWorkflow.repositoryPath))) {
      logger.info("[Git Workflow] No changes detected after generation. Skipping push and pull request creation.");
      return {
        branchName: preparedWorkflow.branchName,
        changedFiles,
        noChanges: true,
        pushed: false,
      };
    }

    await this.gitClient.stageAll(preparedWorkflow.repositoryPath);
    await this.gitClient.commit(preparedWorkflow.repositoryPath, this.resolveCommitMessage());
    await this.gitClient.push(preparedWorkflow.repositoryPath, preparedWorkflow.apiKey, preparedWorkflow.branchName);

    const pullRequest = await this.pullRequestClient.createPullRequest({
      repositoryUrl: preparedWorkflow.repositoryUrl,
      apiKey: preparedWorkflow.apiKey,
      title: this.resolvePullRequestTitle(),
      body: this.resolvePullRequestBody(changedFiles),
      headBranch: preparedWorkflow.branchName,
      baseBranch: preparedWorkflow.targetBranch,
      isDraft: this.options.codegenConfig.prDraft ?? false,
    });

    return {
      branchName: preparedWorkflow.branchName,
      changedFiles,
      noChanges: false,
      pushed: true,
      pullRequest,
    };
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

  private resolveCommitMessage(): string {
    return this.options!.commitMessage?.trim() || GIT_WORKFLOW_DEFAULTS.commitMessage;
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
