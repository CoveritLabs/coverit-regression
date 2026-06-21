#!/usr/bin/env node

// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function main() {
  const baseRef = process.env.GITHUB_BASE_REF || process.env.COVERIT_BASE_REF || "main";
  const base = process.env.COVERIT_DIFF_BASE || `origin/${baseRef}`;
  const head = process.env.COVERIT_DIFF_HEAD || "HEAD";
  const diffBase = resolveDiffBase(base, head);
  const diff = git(["diff", "-M", "--diff-filter=ACMR", "--unified=0", `${diffBase}`, head, "--", ":(glob)features/**/*.feature"]);
  const detection = detectAddedFlows(diff.stdout);

  if (detection.skip) {
    console.log("No added CoverIt flows detected. Skipping Playwright run.");
    process.exit(0);
  }

  const env = {
    ...process.env,
    ...(detection.featureRegex ? { FEATURE_REGEX: detection.featureRegex } : {}),
    ...(detection.scenarioRegex ? { SCENARIO_REGEX: detection.scenarioRegex } : {}),
    ...(detection.marks ? { MARKS: detection.marks } : {}),
  };
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "test:filtered"], { stdio: "inherit", env });
  process.exit(result.status ?? 1);
}

function detectAddedFlows(diffText) {
  const files = parseFeatureDiff(diffText);
  const addedFiles = [];
  const addedScenarios = [];
  const addedMarks = new Set();

  for (const file of files) {
    if (file.isNewFile) {
      addedFiles.push(file.path);
      continue;
    }

    for (const scenario of file.scenarios) {
      addedScenarios.push(scenario.name);
      for (const mark of scenario.marks) addedMarks.add(mark);
    }
  }

  if (addedFiles.length === 0 && addedScenarios.length === 0) return { skip: true };

  return {
    skip: false,
    featureRegex: addedFiles.length > 0 ? regexUnion(addedFiles.map(normalizePath)) : undefined,
    scenarioRegex: addedScenarios.length > 0 ? regexUnion(addedScenarios) : undefined,
    marks: addedMarks.size > 0 ? [...addedMarks].join(",") : undefined,
  };
}

function parseFeatureDiff(diffText) {
  const files = [];
  let currentFile;
  let pendingMarks = [];
  let nextFileIsNew = false;

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      if (currentFile) files.push(currentFile);
      currentFile = undefined;
      pendingMarks = [];
      nextFileIsNew = false;
      continue;
    }

    if (line.startsWith("new file mode ")) {
      nextFileIsNew = true;
      continue;
    }

    if (line.startsWith("+++ b/")) {
      const filePath = line.slice("+++ b/".length);
      if (filePath.startsWith("features/") && filePath.endsWith(".feature")) {
        currentFile = { path: filePath, isNewFile: nextFileIsNew, scenarios: [] };
      }
      continue;
    }

    if (!currentFile) continue;
    if (!line.startsWith("+") || line.startsWith("+++")) continue;

    const addedLine = line.slice(1).trim();
    if (!addedLine || addedLine.startsWith("#")) continue;
    if (addedLine.startsWith("@")) {
      pendingMarks.push(...extractMarks(addedLine));
      continue;
    }

    const scenarioName = addedLine.match(/^Scenario(?: Outline)?:\s*(.+)$/)?.[1]?.trim();
    if (scenarioName) {
      currentFile.scenarios.push({ name: scenarioName, marks: [...new Set(pendingMarks)] });
      pendingMarks = [];
      continue;
    }

    // Any other content line (Feature:, Background:, Given/When/Then, etc.) means
    // tags collected so far belong to something other than a Scenario - drop them
    // so they don't bleed onto the next scenario encountered later in the diff.
    pendingMarks = [];
  }

  if (currentFile) files.push(currentFile);
  return files;
}

function extractMarks(line) {
  return line
    .split(/\s+/)
    .map((mark) => mark.trim())
    .filter((mark) => /^@[A-Za-z0-9_-]+$/.test(mark));
}

function regexUnion(values) {
  return values.map(escapeRegex).join("|");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function resolveDiffBase(base, head) {
  // If the base ref doesn't even resolve (e.g. origin/<branch> was never
  // fetched, or the base branch is genuinely empty/orphan), there's nothing
  // sane to diff against - treat everything in `head` as newly added.
  if (!tryGit(["rev-parse", "--verify", "--quiet", `${base}^{commit}`])) {
    return EMPTY_TREE;
  }

  // If base and head share no common history (e.g. base is an unrelated/
  // unborn branch), merge-base resolution fails and `base...head` either
  // throws or - worse - silently yields an empty diff. Fall back to the
  // empty tree so files that exist on head but not on base are still
  // detected as added.
  const mergeBase = tryGit(["merge-base", base, head]);
  if (!mergeBase) return EMPTY_TREE;

  return mergeBase.trim();
}

function tryGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout;
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

if (require.main === module) main();

module.exports = {
  detectAddedFlows,
  parseFeatureDiff,
};
