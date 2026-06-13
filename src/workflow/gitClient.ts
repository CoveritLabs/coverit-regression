// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { Buffer } from "buffer";

import FileHandler from "@utils/files";
import { logger } from "@utils/logger";
import { CommandRunner, ProcessCommandRunner } from "@workflow/commandRunner";

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
    await this.runGit(["fetch", remoteTarget, branchName], repositoryPath);
  }

  async checkoutRemoteBranch(repositoryPath: string, branchName: string): Promise<void> {
    await this.runGit(["checkout", branchName], repositoryPath);
    await this.runGit(["reset", "--hard", `origin/${branchName}`], repositoryPath);
  }

  async createOrResetBranch(repositoryPath: string, branchName: string, baseBranch: string): Promise<void> {
    await this.runGit(["checkout", "-B", branchName, `origin/${baseBranch}`], repositoryPath);
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

  async commit(repositoryPath: string, message: string): Promise<void> {
    await this.runGit(["commit", "-m", message], repositoryPath);
  }

  async push(repositoryPath: string, apiKey: string | undefined, branchName: string): Promise<void> {
    const remoteTarget = this.getAuthenticatedUrl(await this.getRemoteUrl(repositoryPath), apiKey);
    await this.runGit(["push", "--force", remoteTarget, `HEAD:${branchName}`], repositoryPath);
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
}

export default GitClient;
