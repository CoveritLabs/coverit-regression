// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import FrameworkMappingReader from "@input/frameworkMappingReader";
import { StepType } from "@/types/feature";
import type { FrameworkMappingFileSet } from "@/types/framework";

test("FrameworkMappingReader normalizes transition action input shapes into ordered actions", () => {
  const mapping: FrameworkMappingFileSet = {
    states: {},
    transitions: {
      T_LEGACY_SINGLE: {
        id: "T_LEGACY_SINGLE",
        type: StepType.TRANSITION,
        className: "LegacySingleTransition",
        action: { type: "click", stateId: "S_HOME", locatorKey: "cta" },
      },
      T_LEGACY_ARRAY: {
        id: "T_LEGACY_ARRAY",
        type: StepType.TRANSITION,
        className: "LegacyArrayTransition",
        action: [
          { type: "fill", locator: { cssSelector: "#username" }, value: "standard_user" },
          { type: "click", stateId: "S_HOME", locatorKey: "login" },
        ],
      },
      T_ACTIONS_ARRAY: {
        id: "T_ACTIONS_ARRAY",
        type: StepType.TRANSITION,
        className: "ActionsArrayTransition",
        actions: [
          { type: "fill", locator: { cssSelector: "#password" }, value: "secret_sauce" },
          { type: "select", stateId: "S_HOME", locatorKey: "sort", value: "az" },
        ],
      },
    },
    assertions: {},
    actionHooks: {},
    designClass: { id: "scenarioData" },
  };

  const model = new FrameworkMappingReader().buildGeneratedFrameworkModel(mapping);
  const transitions = Object.fromEntries(model.transitions.map((transition) => [transition.id, transition]));

  assert.deepEqual(transitions.T_LEGACY_SINGLE.actions, [
    { type: "click", stateId: "S_HOME", locatorKey: "cta" },
  ]);
  assert.deepEqual(transitions.T_LEGACY_ARRAY.actions.map((action) => action.type), ["fill", "click"]);
  assert.deepEqual(transitions.T_ACTIONS_ARRAY.actions.map((action) => action.type), ["fill", "select"]);
  assert.equal("action" in transitions.T_LEGACY_SINGLE, false);
});
