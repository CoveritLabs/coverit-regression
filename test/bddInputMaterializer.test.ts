// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { materializeBddInput } from "@/workerFlow/bddInputMaterializer";

test("materializeBddInput writes every generated feature with unique safe names", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "coverit-materialize-"));

  const result = await materializeBddInput(
    {
      session_id: "session-1",
      features: [
        {
          feature_name: "Cart!",
          feature_text: "Feature: Cart!\n",
        },
        {
          feature_name: "Cart",
          feature_text: "Feature: Cart\n",
        },
      ],
      states: {},
      transitions: {},
      assertions: {},
      action_hooks: {},
    },
    { jobId: "job-1", baseDir },
  );

  assert.deepEqual(result.featurePaths.map((featurePath) => path.basename(featurePath)), [
    "cart.feature",
    "cart_2.feature",
  ]);
  assert.equal(fs.readFileSync(result.featurePaths[0], "utf8"), "Feature: Cart!\n");
  assert.equal(fs.readFileSync(result.featurePaths[1], "utf8"), "Feature: Cart\n");
});
