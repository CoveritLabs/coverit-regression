// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import BddOutputPayloadValidator from "@/validate/bddOutputPayloadValidator";

test("BddOutputPayloadValidator accepts split feature payloads", () => {
  const payload = new BddOutputPayloadValidator().parse({
    session_id: "session-1",
    features: [
      {
        id: "F_CART",
        feature_name: "Cart",
        feature_text: "Feature: Cart\n",
        scenario_names: ["Open Cart"],
      },
      {
        feature_name: "Account",
        feature_text: "Feature: Account\n",
      },
    ],
    states: {},
    transitions: {},
  });

  assert.equal(payload.features.length, 2);
  assert.equal(payload.features[0].feature_name, "Cart");
  assert.deepEqual(payload.features[0].scenario_names, ["Open Cart"]);
  assert.deepEqual(payload.assertions, {});
  assert.deepEqual(payload.action_hooks, {});
});

test("BddOutputPayloadValidator rejects payloads without features", () => {
  assert.throws(
    () =>
      new BddOutputPayloadValidator().parse({
        session_id: "session-1",
        feature_name: "Legacy",
        feature_text: "Feature: Legacy\n",
        states: {},
        transitions: {},
      }),
    /missing required non-empty array field "features"/,
  );
});
