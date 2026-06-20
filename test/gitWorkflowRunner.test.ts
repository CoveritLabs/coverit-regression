// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import type {
  GitWorkflowOptions,
  PreparedGitWorkflow,
  PullRequestRequest,
  PullRequestResponse,
} from "@/types/gitWorkflow";
import GitWorkflowRunner from "@workflow/gitWorkflowRunner";

class FakeGitClient {
  readonly calls: string[] = [];
  public changedFiles: string[] = [];
  public repositoryArgs?: { repositoryUrl: string; apiKey: string | undefined; targetPath: string };
  public pushArgs?: { repositoryPath: string; apiKey: string | undefined; branchName: string };

  async ensureRepository(repositoryUrl: string, apiKey: string | undefined, targetPath: string): Promise<void> {
    this.calls.push("ensureRepository");
    this.repositoryArgs = { repositoryUrl, apiKey, targetPath };
  }

  async fetch(): Promise<void> {
    this.calls.push("fetch");
  }

  async checkoutRemoteBranch(): Promise<void> {
    this.calls.push("checkoutRemoteBranch");
  }

  async createOrResetBranch(repositoryPath: string, branchName: string): Promise<void> {
    this.calls.push(`createOrResetBranch:${branchName}:${repositoryPath}`);
  }

  async getChangedFiles(): Promise<string[]> {
    this.calls.push("getChangedFiles");
    return this.changedFiles;
  }

  async hasChanges(): Promise<boolean> {
    this.calls.push("hasChanges");
    return this.changedFiles.length > 0;
  }

  async stageAll(): Promise<void> {
    this.calls.push("stageAll");
  }

  async commit(): Promise<void> {
    this.calls.push("commit");
  }

  async push(repositoryPath: string, apiKey: string | undefined, branchName: string): Promise<void> {
    this.calls.push("push");
    this.pushArgs = { repositoryPath, apiKey, branchName };
  }
}

class FakePullRequestClient {
  public request?: PullRequestRequest;

  async createPullRequest(request: PullRequestRequest): Promise<PullRequestResponse> {
    this.request = request;
    return {
      url: "https://github.com/CoveritLabs/example/pull/1",
      number: 1,
    };
  }
}

function createOptions(overrides: Partial<GitWorkflowOptions> = {}): GitWorkflowOptions {
  return {
    generatorOptions: {
      outputPath: "E:/tmp/output",
      dryRun: false,
      check: false,
      logToFile: false,
    },
    regressionCodebase: {
      repositoryUrl: "https://github.com/CoveritLabs/example.git",
      apiKey: "secret-token",
    },
    codegenConfig: {
      codegenBranch: "feat/generated-regression",
      prTargetBranch: "main",
      prTitle: "chore: generated update",
      prBody: "generated body",
      prDraft: true,
    },
    ...overrides,
  };
}

test("skips push and pull request when generation produces no changes", async () => {
  const gitClient = new FakeGitClient();
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, pullRequestClient as never);

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.noChanges, true);
  assert.equal(result.pushed, false);
  assert.equal(pullRequestClient.request, undefined);
  assert.deepEqual(gitClient.calls, [
    "ensureRepository",
    "fetch",
    "checkoutRemoteBranch",
    "createOrResetBranch:feat/generated-regression:E:/tmp/output",
    "getChangedFiles",
    "hasChanges",
  ]);
});

test("commits, pushes, and opens a pull request when changes exist", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["src/states/generated/HomeState.ts", "features/login.feature"];
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, pullRequestClient as never);

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.noChanges, false);
  assert.equal(result.pushed, true);
  assert.equal(result.pullRequest?.url, "https://github.com/CoveritLabs/example/pull/1");
  assert.equal(gitClient.pushArgs?.apiKey, "secret-token");
  assert.equal(gitClient.pushArgs?.branchName, "feat/generated-regression");
  assert.equal(pullRequestClient.request?.repositoryUrl, "https://github.com/CoveritLabs/example.git");
  assert.equal(pullRequestClient.request?.apiKey, "secret-token");
  assert.equal(pullRequestClient.request?.baseBranch, "main");
  assert.equal(pullRequestClient.request?.headBranch, "feat/generated-regression");
});

test("generates a fallback branch name and default pull request text when not provided", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["src/transitions/generated/CheckoutTransition.ts"];
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(
    createOptions({
      codegenConfig: {
        prTargetBranch: "main",
      },
    }),
    gitClient as never,
    pullRequestClient as never,
  );

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.match(result.branchName, /^codegen\/\d{14}$/);
  assert.equal(pullRequestClient.request?.title, "chore: update generated regression assets");
  assert.match(pullRequestClient.request?.body ?? "", /Changed files:/);
});

test("prepare returns the repository context needed by main orchestration", async () => {
  const gitClient = new FakeGitClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, new FakePullRequestClient() as never);

  const preparedWorkflow = await runner.prepare();

  assert.ok(preparedWorkflow);
  assert.equal(preparedWorkflow.repositoryPath, "E:/tmp/output");
  assert.equal(preparedWorkflow.repositoryUrl, "https://github.com/CoveritLabs/example.git");
  assert.equal(preparedWorkflow.apiKey, "secret-token");
  assert.equal(preparedWorkflow.targetBranch, "main");
});
