// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { Buffer } from "buffer";

import FileHandler from "@utils/files";
import { logger } from "@utils/logger";
import { CommandRunner, ProcessCommandRunner } from "@workflow/commandRunner";
import type { GitCommitAuthor } from "@/types/gitWorkflow";

class GitClient {
  private readonly commandRunner: CommandRunner;

  constructor(commandRunner: CommandRunner = new ProcessCommandRunner()) {
    this.commandRunner = commandRunner;
  }

  async ensureRepository(repositoryUrl: string, apiKey: string | undefined, targetPath: string): Promise<void> {
    if (!FileHandler.exists(targetPath)) {
      await this.clone(repositoryUrl, apiKey, targetPath);
      return;
    }

    if (!FileHandler.isDirectory(targetPath)) {
      throw new Error(`[Git Workflow] Output path is not a directory: ${targetPath}`);
    }

    if (!FileHandler.exists(FileHandler.join(targetPath, ".git"))) {
      if (FileHandler.scanDirectory(targetPath).length !== 0) {
        FileHandler.removeDirectory(targetPath);
      }
      await this.clone(repositoryUrl, apiKey, targetPath);
      return;
    }

    const remoteUrl = await this.getRemoteUrl(targetPath);
    if (this.normalizeRepositoryUrl(remoteUrl) !== this.normalizeRepositoryUrl(repositoryUrl)) {
      FileHandler.removeDirectory(targetPath);
      await this.clone(repositoryUrl, apiKey, targetPath);
      return;
    }

    logger.info(`[Git Workflow] Reusing existing repository at ${targetPath}.`);
  }

  async fetch(repositoryPath: string, apiKey: string | undefined, branchName: string): Promise<void> {
    const remoteTarget = this.getAuthenticatedUrl(await this.getRemoteUrl(repositoryPath), apiKey);
    await this.runGit(["fetch", remoteTarget, `${branchName}:refs/remotes/origin/${branchName}`], repositoryPath);
  }

  async checkoutRemoteBranch(repositoryPath: string, branchName: string): Promise<void> {
    await this.runGit(["checkout", "-B", branchName, `origin/${branchName}`], repositoryPath);
    await this.runGit(["reset", "--hard", `origin/${branchName}`], repositoryPath);
  }

  async createBranchFromBase(repositoryPath: string, branchName: string, baseBranch: string): Promise<void> {
    await this.runGit(["checkout", "-B", branchName, `origin/${baseBranch}`], repositoryPath);
  }

  async createOrResetBranch(repositoryPath: string, branchName: string, baseBranch: string): Promise<void> {
    await this.createBranchFromBase(repositoryPath, branchName, baseBranch);
  }

  async createBranchFromHead(repositoryPath: string, branchName: string): Promise<void> {
    await this.runGit(["checkout", "-B", branchName], repositoryPath);
  }

  async remoteBranchExists(repositoryPath: string, apiKey: string | undefined, branchName: string): Promise<boolean> {
    const remoteTarget = this.getAuthenticatedUrl(await this.getRemoteUrl(repositoryPath), apiKey);
    try {
      await this.runGit(["ls-remote", "--exit-code", "--heads", remoteTarget, branchName], repositoryPath);
      return true;
    } catch {
      return false;
    }
  }

  async getDefaultBranch(repositoryPath: string, apiKey: string | undefined): Promise<string> {
    const remoteTarget = this.getAuthenticatedUrl(await this.getRemoteUrl(repositoryPath), apiKey);
    const result = await this.runGit(["ls-remote", "--symref", remoteTarget, "HEAD"], repositoryPath);
    const match = result.stdout.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
    if (!match) throw new Error("[Git Workflow] Could not resolve repository default branch.");
    return match[1];
  }

  async ensureRemoteBranchFromDefault(
    repositoryPath: string,
    apiKey: string | undefined,
    branchName: string,
  ): Promise<void> {
    if (await this.remoteBranchExists(repositoryPath, apiKey, branchName)) return;

    const defaultBranch = await this.getDefaultBranch(repositoryPath, apiKey);
    logger.warn(
      `[Git Workflow] Target branch "${branchName}" does not exist. Creating it from default branch "${defaultBranch}".`,
    );
    await this.fetch(repositoryPath, apiKey, defaultBranch);
    await this.createBranchFromBase(repositoryPath, branchName, defaultBranch);
    await this.push(repositoryPath, apiKey, branchName);
    await this.fetch(repositoryPath, apiKey, branchName);
  }

  async hasChanges(repositoryPath: string): Promise<boolean> {
    const result = await this.runGit(["status", "--short"], repositoryPath);
    return result.stdout.trim().length > 0;
  }

  async getChangedFiles(repositoryPath: string): Promise<string[]> {
    const result = await this.runGit(["status", "--short"], repositoryPath);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.slice(3).trim());
  }

  async stageAll(repositoryPath: string): Promise<void> {
    await this.runGit(["add", "--all"], repositoryPath);
  }

  async commit(repositoryPath: string, message: string, author?: GitCommitAuthor): Promise<void> {
    if (author) {
      await this.runGit(["config", "--local", "user.name", author.name], repositoryPath);
      await this.runGit(["config", "--local", "user.email", author.email], repositoryPath);
    }
    await this.runGit(["commit", "-m", message], repositoryPath);
  }

  async recommitWithoutWorkflowFiles(
    repositoryPath: string,
    message: string,
    author?: GitCommitAuthor,
  ): Promise<boolean> {
    await this.runGit(["reset", "--soft", "HEAD~1"], repositoryPath);
    await this.runGit(["restore", "--staged", "--", ".github/workflows"], repositoryPath);
    await this.runGitIfPossible(["restore", "--worktree", "--", ".github/workflows"], repositoryPath);
    await this.runGit(["clean", "-fd", "--", ".github/workflows"], repositoryPath);

    if (!(await this.hasChanges(repositoryPath))) return false;

    await this.stageAll(repositoryPath);
    await this.commit(repositoryPath, message, author);
    return true;
  }

  async push(repositoryPath: string, apiKey: string | undefined, branchName: string): Promise<void> {
    const remoteTarget = this.getAuthenticatedUrl(await this.getRemoteUrl(repositoryPath), apiKey);
    await this.runGit(["push", remoteTarget, `HEAD:${branchName}`], repositoryPath);
  }

  private async clone(repositoryUrl: string, apiKey: string | undefined, targetPath: string): Promise<void> {
    const parentDirectory = FileHandler.join(targetPath, "..");
    FileHandler.ensureDirectory(parentDirectory);
    logger.info(`[Git Workflow] Cloning repository into ${targetPath}...`);

    const targetUrl = this.getAuthenticatedUrl(repositoryUrl, apiKey);
    await this.runGit(["clone", targetUrl, targetPath]);
  }

  private async getRemoteUrl(repositoryPath: string): Promise<string> {
    const result = await this.runGit(["remote", "get-url", "origin"], repositoryPath);
    return result.stdout.trim();
  }

  private normalizeRepositoryUrl(repositoryUrl: string): string {
    return repositoryUrl
      .replace(/https:\/\/.*@/, "https://")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  private getAuthenticatedUrl(repositoryUrl: string, apiKey: string | undefined): string {
    if (!apiKey) return repositoryUrl;
    const cleanUrl = repositoryUrl.replace(/https:\/\/.*@/, "https://");
    return cleanUrl.replace("https://", `https://x-access-token:${apiKey}@`);
  }

  private async runGit(args: string[], cwd?: string) {
    const sanitizedLogArgs = args.map((arg) => (arg.includes("x-access-token:") ? "[REDACTED_URL]" : arg));
    logger.info(`[Git Workflow] git ${sanitizedLogArgs.join(" ")}`);
    return this.commandRunner.run("git", args, cwd);
  }

  private async runGitIfPossible(args: string[], cwd?: string): Promise<void> {
    try {
      await this.runGit(args, cwd);
    } catch (error) {
      logger.warn(`[Git Workflow] Optional git cleanup failed and will be skipped. ${(error as Error).message}`);
    }
  }
}

export default GitClient;
