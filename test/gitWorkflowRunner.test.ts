// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import type {
  GitWorkflowOptions,
  PullRequestRequest,
  PullRequestResponse,
} from "@/types/gitWorkflow";
import GitWorkflowRunner from "@workflow/gitWorkflowRunner";

class FakeGitClient {
  readonly calls: string[] = [];
  public changedFiles: string[] = [];
  public remoteBranches = new Set<string>(["main"]);
  public repositoryArgs?: { repositoryUrl: string; apiKey: string | undefined; targetPath: string };
  public pushArgs: Array<{ repositoryPath: string; apiKey: string | undefined; branchName: string }> = [];
  public commitArgs?: { repositoryPath: string; message: string; author?: { name: string; email: string } };
  public failPushBranches = new Set<string>();
  public failPushBranchErrors = new Map<string, Error>();
  public recommitWithoutWorkflowFilesResult = true;

  async ensureRepository(repositoryUrl: string, apiKey: string | undefined, targetPath: string): Promise<void> {
    this.calls.push("ensureRepository");
    this.repositoryArgs = { repositoryUrl, apiKey, targetPath };
  }

  async ensureRemoteBranchFromDefault(_repositoryPath: string, _apiKey: string | undefined, branchName: string): Promise<void> {
    this.calls.push(`ensureRemoteBranchFromDefault:${branchName}`);
    this.remoteBranches.add(branchName);
  }

  async fetch(_repositoryPath: string, _apiKey: string | undefined, branchName: string): Promise<void> {
    this.calls.push(`fetch:${branchName}`);
  }

  async checkoutRemoteBranch(_repositoryPath: string, branchName: string): Promise<void> {
    this.calls.push(`checkoutRemoteBranch:${branchName}`);
  }

  async createBranchFromBase(repositoryPath: string, branchName: string, baseBranch: string): Promise<void> {
    this.calls.push(`createBranchFromBase:${branchName}:${baseBranch}:${repositoryPath}`);
    this.remoteBranches.add(branchName);
  }

  async createBranchFromHead(repositoryPath: string, branchName: string): Promise<void> {
    this.calls.push(`createBranchFromHead:${branchName}:${repositoryPath}`);
  }

  async remoteBranchExists(_repositoryPath: string, _apiKey: string | undefined, branchName: string): Promise<boolean> {
    this.calls.push(`remoteBranchExists:${branchName}`);
    return this.remoteBranches.has(branchName);
  }

  async getDefaultBranch(): Promise<string> {
    this.calls.push("getDefaultBranch");
    return "main";
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

  async commit(repositoryPath: string, message: string, author?: { name: string; email: string }): Promise<void> {
    this.calls.push("commit");
    this.commitArgs = { repositoryPath, message, author };
  }

  async recommitWithoutWorkflowFiles(
    repositoryPath: string,
    message: string,
    author?: { name: string; email: string },
  ): Promise<boolean> {
    this.calls.push("recommitWithoutWorkflowFiles");
    this.commitArgs = { repositoryPath, message, author };
    return this.recommitWithoutWorkflowFilesResult;
  }

  async push(repositoryPath: string, apiKey: string | undefined, branchName: string): Promise<void> {
    this.calls.push(`push:${branchName}`);
    this.pushArgs.push({ repositoryPath, apiKey, branchName });
    const configuredError = this.failPushBranchErrors.get(branchName);
    if (configuredError) {
      this.failPushBranchErrors.delete(branchName);
      throw configuredError;
    }
    if (this.failPushBranches.has(branchName)) throw new Error(`push rejected for ${branchName}`);
  }
}

class FakePullRequestClient {
  public request?: PullRequestRequest;
  public calls: string[] = [];

  async upsertPullRequest(request: PullRequestRequest): Promise<PullRequestResponse> {
    this.calls.push("upsertPullRequest");
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
      inputPath: "E:/tmp/input",
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
    "ensureRemoteBranchFromDefault:main",
    "fetch:main",
    "checkoutRemoteBranch:main",
    "remoteBranchExists:feat/generated-regression",
    "createBranchFromBase:feat/generated-regression:main:E:/tmp/output",
    "getChangedFiles",
    "hasChanges",
  ]);
});

test("commits, pushes, and upserts a pull request when changes exist", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["src/states/generated/HomeState.ts", "features/login.feature"];
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, pullRequestClient as never);

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.noChanges, false);
  assert.equal(result.pushed, true);
  assert.equal(result.pullRequest?.url, "https://github.com/CoveritLabs/example/pull/1");
  const lastPush = gitClient.pushArgs[gitClient.pushArgs.length - 1];
  assert.equal(lastPush?.apiKey, "secret-token");
  assert.equal(lastPush?.branchName, "feat/generated-regression");
  assert.equal(pullRequestClient.request?.repositoryUrl, "https://github.com/CoveritLabs/example.git");
  assert.equal(pullRequestClient.request?.apiKey, "secret-token");
  assert.equal(pullRequestClient.request?.baseBranch, "main");
  assert.equal(pullRequestClient.request?.headBranch, "feat/generated-regression");
  assert.deepEqual(gitClient.commitArgs, {
    repositoryPath: "E:/tmp/output",
    message: "chore: update generated regression assets",
    author: {
      name: "github-actions[bot]",
      email: "41898282+github-actions[bot]@users.noreply.github.com",
    },
  });
});

test("extends an existing configured branch instead of resetting it from target", async () => {
  const gitClient = new FakeGitClient();
  gitClient.remoteBranches.add("feat/generated-regression");
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, new FakePullRequestClient() as never);

  await runner.prepare();

  assert.ok(gitClient.calls.includes("fetch:feat/generated-regression"));
  assert.ok(gitClient.calls.includes("checkoutRemoteBranch:feat/generated-regression"));
  assert.equal(
    gitClient.calls.some((call) => call.startsWith("createBranchFromBase:feat/generated-regression:main")),
    false,
  );
});

test("prepares and pushes slash-named configured branches from their target branch", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["features/healthandcare_user_flows.feature"];
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(
    createOptions({
      codegenConfig: {
        codegenBranch: "HCP/regression-page",
        prTargetBranch: "HCP",
      },
    }),
    gitClient as never,
    pullRequestClient as never,
  );

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.branchName, "HCP/regression-page");
  assert.equal(result.pushed, true);
  assert.ok(gitClient.calls.includes("ensureRemoteBranchFromDefault:HCP"));
  assert.ok(gitClient.calls.includes("checkoutRemoteBranch:HCP"));
  assert.ok(gitClient.calls.includes("createBranchFromBase:HCP/regression-page:HCP:E:/tmp/output"));
  assert.deepEqual(
    gitClient.pushArgs.map((push) => push.branchName),
    ["HCP/regression-page"],
  );
  assert.equal(pullRequestClient.request?.headBranch, "HCP/regression-page");
  assert.equal(pullRequestClient.request?.baseBranch, "HCP");
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

test("pushes but skips pull request work when no API key is configured", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["features/login.feature"];
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(
    createOptions({
      regressionCodebase: {
        repositoryUrl: "https://github.com/CoveritLabs/example.git",
      },
    }),
    gitClient as never,
    pullRequestClient as never,
  );

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.pushed, true);
  assert.equal(result.pullRequest, undefined);
  const lastPush = gitClient.pushArgs[gitClient.pushArgs.length - 1];
  assert.equal(lastPush?.apiKey, undefined);
  assert.deepEqual(pullRequestClient.calls, []);
});

test("pushes but skips pull request work when no target branch is configured", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["features/login.feature"];
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(
    createOptions({
      codegenConfig: {
        codegenBranch: "feat/generated-regression",
      },
    }),
    gitClient as never,
    pullRequestClient as never,
  );

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(preparedWorkflow?.targetBranch, undefined);
  assert.equal(preparedWorkflow?.baseBranch, "main");
  assert.equal(result.pushed, true);
  assert.equal(result.pullRequest, undefined);
  assert.ok(gitClient.calls.includes("getDefaultBranch"));
  assert.deepEqual(pullRequestClient.calls, []);
});

test("falls back to a generated branch when configured branch push is rejected", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["features/login.feature"];
  gitClient.failPushBranches.add("feat/generated-regression");
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, pullRequestClient as never);

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.notEqual(result.branchName, "feat/generated-regression");
  assert.match(result.branchName, /^codegen\/\d{14}-[a-z0-9]{6}$/);
  assert.ok(gitClient.calls.some((call) => call.startsWith("createBranchFromHead:codegen/")));
  const lastPush = gitClient.pushArgs[gitClient.pushArgs.length - 1];
  assert.equal(lastPush?.branchName, result.branchName);
  assert.equal(pullRequestClient.request?.headBranch, result.branchName);
});

test("falls back when a slash-named configured branch push is rejected by the remote", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = ["features/healthandcare_user_flows.feature"];
  gitClient.failPushBranches.add("HCP/regression-page");
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(
    createOptions({
      codegenConfig: {
        codegenBranch: "HCP/regression-page",
        prTargetBranch: "HCP",
      },
    }),
    gitClient as never,
    pullRequestClient as never,
  );

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.match(result.branchName, /^codegen\/\d{14}-[a-z0-9]{6}$/);
  assert.deepEqual(gitClient.pushArgs.map((push) => push.branchName), ["HCP/regression-page", result.branchName]);
  assert.ok(gitClient.calls.some((call) => call.startsWith("createBranchFromHead:codegen/")));
  assert.equal(pullRequestClient.request?.headBranch, result.branchName);
  assert.equal(pullRequestClient.request?.baseBranch, "HCP");
});

test("removes GitHub workflow files and retries when token lacks workflow scope", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = [".github/workflows/coverit-regression.yml", "features/login.feature"];
  gitClient.failPushBranchErrors.set(
    "feat/generated-regression",
    new Error(
      "refusing to allow a Personal Access Token to create or update workflow `.github/workflows/coverit-regression.yml` without `workflow` scope",
    ),
  );
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, pullRequestClient as never);

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.pushed, true);
  assert.deepEqual(result.changedFiles, ["features/login.feature"]);
  assert.equal(result.branchName, "feat/generated-regression");
  assert.deepEqual(
    gitClient.calls.filter((call) => call === "recommitWithoutWorkflowFiles" || call.startsWith("push:")),
    ["push:feat/generated-regression", "recommitWithoutWorkflowFiles", "push:feat/generated-regression"],
  );
  assert.equal(pullRequestClient.request?.headBranch, "feat/generated-regression");
});

test("skips push when workflow files are the only changes and token lacks workflow scope", async () => {
  const gitClient = new FakeGitClient();
  gitClient.changedFiles = [".github/workflows/coverit-regression.yml"];
  gitClient.recommitWithoutWorkflowFilesResult = false;
  gitClient.failPushBranchErrors.set(
    "feat/generated-regression",
    new Error(
      "refusing to allow a Personal Access Token to create or update workflow `.github/workflows/coverit-regression.yml` without `workflow` scope",
    ),
  );
  const pullRequestClient = new FakePullRequestClient();
  const runner = new GitWorkflowRunner(createOptions(), gitClient as never, pullRequestClient as never);

  const preparedWorkflow = await runner.prepare();
  const result = await runner.finalize(preparedWorkflow);

  assert.equal(result.noChanges, true);
  assert.equal(result.pushed, false);
  assert.deepEqual(result.changedFiles, []);
  assert.deepEqual(pullRequestClient.calls, []);
  assert.deepEqual(
    gitClient.calls.filter((call) => call === "recommitWithoutWorkflowFiles" || call.startsWith("push:")),
    ["push:feat/generated-regression", "recommitWithoutWorkflowFiles"],
  );
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
  assert.equal(preparedWorkflow.baseBranch, "main");
  assert.equal(preparedWorkflow.configuredBranch, true);
});
