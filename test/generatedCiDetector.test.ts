// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const detector = require(path.join(process.cwd(), "templates", "scripts", "detect-added-flows.js")) as {
  detectAddedFlows(diffText: string): { skip: boolean; featureRegex?: string; scenarioRegex?: string; marks?: string };
  parseFeatureDiff(diffText: string): Array<{
    path: string;
    isNewFile: boolean;
    scenarios: Array<{ name: string; marks: string[] }>;
  }>;
};

test("detector runs all scenarios for newly added feature files", () => {
  const result = detector.detectAddedFlows([
    "diff --git a/features/checkout.feature b/features/checkout.feature",
    "new file mode 100644",
    "+++ b/features/checkout.feature",
    "+Feature: Checkout",
    "+Scenario: Adds item",
  ].join("\n"));

  assert.equal(result.skip, false);
  assert.equal(result.featureRegex, "features/checkout\\.feature");
  assert.equal(result.scenarioRegex, undefined);
});

test("detector runs only added scenarios for modified feature files", () => {
  const result = detector.detectAddedFlows([
    "diff --git a/features/checkout.feature b/features/checkout.feature",
    "+++ b/features/checkout.feature",
    "+@checkout @smoke",
    "+Scenario: Adds item",
    "+Given the UI is in state \"S_CART\"",
  ].join("\n"));

  assert.equal(result.skip, false);
  assert.equal(result.featureRegex, undefined);
  assert.equal(result.scenarioRegex, "Adds item");
  assert.equal(result.marks, "@checkout,@smoke");
});

test("detector skips when no scenarios are added", () => {
  const result = detector.detectAddedFlows([
    "diff --git a/features/checkout.feature b/features/checkout.feature",
    "+++ b/features/checkout.feature",
    "+Given the UI is in state \"S_CART\"",
  ].join("\n"));

  assert.equal(result.skip, true);
});
