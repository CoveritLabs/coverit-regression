// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("generated BDD parser captures feature and scenario marks", () => {
  const parserTemplate = fs.readFileSync(path.join(process.cwd(), "templates", "src", "bdd", "bddParser.ts.ejs"), "utf8");
  const featurePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "coverit-marks-")), "example.feature");
  fs.writeFileSync(
    featurePath,
    [
      "@checkout @smoke",
      "Feature: Checkout",
      "",
      "  @cart",
      "  Scenario: Adds item",
      "    Given the UI is in state \"S_CART\"",
      "",
      "  Scenario: Removes item",
      "    Given the UI is in state \"S_CART\"",
    ].join("\n"),
    "utf8",
  );

  assert.match(parserTemplate, /featureMarks/);
  assert.match(parserTemplate, /pendingMarks/);
  assert.match(parserTemplate, /marks:\s*\[\.\.\.new Set\(\[\.\.\.featureMarks,\s*\.\.\.pendingMarks\]\)\]/);
  assert.match(parserTemplate, /extractMarks/);
});
