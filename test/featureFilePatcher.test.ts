// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import FeatureFilePatcher from "@generator/featureFilePatcher";
import type { FileEntry } from "@/types/files";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coverit-feature-merge-"));
}

function writeFile(filePath: string, content: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function inputFeature(root: string, relativePath: string, content: string): FileEntry {
  return {
    relativePath,
    absolutePath: writeFile(path.join(root, "input", "features", relativePath), content),
  };
}

test("FeatureFilePatcher replaces matching Flow ID scenarios and preserves old scenarios", () => {
  const root = createTempDir();
  const outputFeaturesPath = path.join(root, "output", "features");
  const generated = inputFeature(
    root,
    "checkout.feature",
    [
      "Feature: Checkout",
      "",
      "  # Flow ID: flow-2",
      "  Scenario: New Pay",
      '    Given the UI is in state "S_NEW"',
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(outputFeaturesPath, "checkout.feature"),
    [
      "Feature: Checkout",
      "",
      "  # Flow ID: flow-1",
      "  Scenario: Existing Cart",
      '    Given the UI is in state "S_CART"',
      "",
      "  # Testflow ID: flow-2",
      "  Scenario: Old Pay",
      '    Given the UI is in state "S_OLD"',
      "",
      "  Scenario: Manual Review",
      '    Given the UI is in state "S_MANUAL"',
      "",
    ].join("\n"),
  );

  const result = new FeatureFilePatcher().patch([generated], outputFeaturesPath);

  assert.equal(result.length, 1);
  assert.equal(result[0].relativePath, "checkout.feature");
  const content = result[0].content ?? "";
  assert.match(content, /Scenario: Existing Cart/);
  assert.match(content, /Scenario: New Pay/);
  assert.match(content, /Scenario: Manual Review/);
  assert.doesNotMatch(content, /Scenario: Old Pay/);
  assert.ok(content.indexOf("Scenario: Existing Cart") < content.indexOf("Scenario: New Pay"));
  assert.ok(content.indexOf("Scenario: New Pay") < content.indexOf("Scenario: Manual Review"));
});

test("FeatureFilePatcher keeps known flow IDs in their existing feature file", () => {
  const root = createTempDir();
  const outputFeaturesPath = path.join(root, "output", "features");
  const generated = inputFeature(
    root,
    "new_checkout.feature",
    [
      "Feature: New Checkout",
      "",
      "  # Flow ID: flow-9",
      "  Scenario: Updated Legacy Flow",
      '    Given the UI is in state "S_NEW"',
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(outputFeaturesPath, "legacy.feature"),
    [
      "Feature: Legacy",
      "",
      "  # Flow ID: flow-9",
      "  Scenario: Old Legacy Flow",
      '    Given the UI is in state "S_OLD"',
      "",
    ].join("\n"),
  );

  const result = new FeatureFilePatcher().patch([generated], outputFeaturesPath);

  assert.deepEqual(
    result.map((entry) => entry.relativePath),
    ["legacy.feature"],
  );
  assert.match(result[0].content ?? "", /Feature: Legacy/);
  assert.match(result[0].content ?? "", /Scenario: Updated Legacy Flow/);
  assert.doesNotMatch(result[0].content ?? "", /Scenario: Old Legacy Flow/);
});

test("FeatureFilePatcher appends new flow IDs without matching untagged scenarios by name", () => {
  const root = createTempDir();
  const outputFeaturesPath = path.join(root, "output", "features");
  const generated = inputFeature(
    root,
    "account.feature",
    [
      "Feature: Account",
      "",
      "  # Flow ID: flow-new",
      "  Scenario: Open Account",
      '    Given the UI is in state "S_NEW"',
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(outputFeaturesPath, "account.feature"),
    ["Feature: Account", "", "  Scenario: Open Account", '    Given the UI is in state "S_MANUAL"', ""].join("\n"),
  );

  const result = new FeatureFilePatcher().patch([generated], outputFeaturesPath);
  const content = result[0].content ?? "";

  assert.equal(content.match(/Scenario: Open Account/g)?.length, 2);
  assert.match(content, /S_MANUAL/);
  assert.match(content, /S_NEW/);
});

test("FeatureFilePatcher rejects duplicate generated Flow IDs", () => {
  const root = createTempDir();
  const outputFeaturesPath = path.join(root, "output", "features");
  const first = inputFeature(
    root,
    "first.feature",
    'Feature: First\n\n  # Flow ID: flow-1\n  Scenario: First\n    Given the UI is in state "S_ONE"\n',
  );
  const second = inputFeature(
    root,
    "second.feature",
    'Feature: Second\n\n  # Flow ID: flow-1\n  Scenario: Second\n    Given the UI is in state "S_TWO"\n',
  );

  assert.throws(
    () => new FeatureFilePatcher().patch([first, second], outputFeaturesPath),
    /Duplicate generated Flow ID "flow-1"/,
  );
});
