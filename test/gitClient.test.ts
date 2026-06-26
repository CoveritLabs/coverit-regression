// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import GitClient from "@workflow/gitClient";
import type { CommandResult, CommandRunner } from "@workflow/commandRunner";

class FakeCommandRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

  async run(command: string, args: string[], cwd?: string): Promise<CommandResult> {
    this.calls.push({ command, args, cwd });

    if (args.join(" ") === "remote get-url origin") {
      return { stdout: "https://github.com/CoveritLabs/example.git\n", stderr: "" };
    }
    if (args.includes("ls-remote") && args.includes("--heads") && args[args.length - 1] === "release") {
      throw new Error("branch missing");
    }
    if (args.includes("ls-remote") && args.includes("--symref")) {
      return { stdout: "ref: refs/heads/main\tHEAD\n", stderr: "" };
    }
    if (args.join(" ") === "status --short") {
      return { stdout: "M src/generated.ts\n", stderr: "" };
    }
    if (args.join(" ") === "restore --worktree -- .github/workflows") {
      throw new Error("pathspec '.github/workflows' did not match any file(s) known to git");
    }

    return { stdout: "", stderr: "" };
  }
}

test("GitClient creates a missing target branch from the default branch", async () => {
  const commandRunner = new FakeCommandRunner();
  const client = new GitClient(commandRunner);

  await client.ensureRemoteBranchFromDefault("E:/tmp/repo", undefined, "release");

  assert.deepEqual(
    commandRunner.calls
      .filter((call) => call.command === "git" && call.args[0] !== "remote")
      .map((call) => call.args),
    [
      ["ls-remote", "--exit-code", "--heads", "https://github.com/CoveritLabs/example.git", "release"],
      ["ls-remote", "--symref", "https://github.com/CoveritLabs/example.git", "HEAD"],
      ["fetch", "https://github.com/CoveritLabs/example.git", "main:refs/remotes/origin/main"],
      ["checkout", "--detach", "origin/main"],
      ["push", "https://github.com/CoveritLabs/example.git", "HEAD:refs/heads/release"],
      ["fetch", "https://github.com/CoveritLabs/example.git", "release:refs/remotes/origin/release"],
    ],
  );
});

test("GitClient prepares slash-named branches without creating local branch refs", async () => {
  const commandRunner = new FakeCommandRunner();
  const client = new GitClient(commandRunner);

  await client.createBranchFromBase("E:/tmp/repo", "HCP/regression-page", "HCP");
  await client.push("E:/tmp/repo", undefined, "HCP/regression-page");

  assert.deepEqual(
    commandRunner.calls.map((call) => call.args),
    [
      ["checkout", "--detach", "origin/HCP"],
      ["remote", "get-url", "origin"],
      ["push", "https://github.com/CoveritLabs/example.git", "HEAD:refs/heads/HCP/regression-page"],
    ],
  );
});

test("GitClient prepares fallback branches from detached HEAD", async () => {
  const commandRunner = new FakeCommandRunner();
  const client = new GitClient(commandRunner);

  await client.createBranchFromHead("E:/tmp/repo", "codegen/20260625191022-009a1q");

  assert.deepEqual(commandRunner.calls.map((call) => call.args), [["checkout", "--detach", "HEAD"]]);
});

test("GitClient does not double-prefix fully qualified remote branch refs", async () => {
  const commandRunner = new FakeCommandRunner();
  const client = new GitClient(commandRunner);

  await client.push("E:/tmp/repo", undefined, "refs/heads/HCP/main");

  assert.deepEqual(
    commandRunner.calls.map((call) => call.args),
    [
      ["remote", "get-url", "origin"],
      ["push", "https://github.com/CoveritLabs/example.git", "HEAD:refs/heads/HCP/main"],
    ],
  );
});

test("GitClient configures commit identity before committing", async () => {
  const commandRunner = new FakeCommandRunner();
  const client = new GitClient(commandRunner);

  await client.commit("E:/tmp/repo", "chore: update generated regression assets", {
    name: "github-actions[bot]",
    email: "41898282+github-actions[bot]@users.noreply.github.com",
  });

  assert.deepEqual(
    commandRunner.calls.map((call) => call.args),
    [
      ["config", "--local", "user.name", "github-actions[bot]"],
      ["config", "--local", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
      ["commit", "-m", "chore: update generated regression assets"],
    ],
  );
});

test("GitClient recommits generated changes without GitHub workflow files", async () => {
  const commandRunner = new FakeCommandRunner();
  const client = new GitClient(commandRunner);

  await client.recommitWithoutWorkflowFiles("E:/tmp/repo", "chore: update generated regression assets", {
    name: "github-actions[bot]",
    email: "41898282+github-actions[bot]@users.noreply.github.com",
  });

  assert.deepEqual(
    commandRunner.calls.map((call) => call.args),
    [
      ["reset", "--soft", "HEAD~1"],
      ["restore", "--staged", "--", ".github/workflows"],
      ["restore", "--worktree", "--", ".github/workflows"],
      ["clean", "-fd", "--", ".github/workflows"],
      ["status", "--short"],
      ["add", "--all"],
      ["config", "--local", "user.name", "github-actions[bot]"],
      ["config", "--local", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
      ["commit", "-m", "chore: update generated regression assets"],
    ],
  );
});
