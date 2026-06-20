// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { diagnostics } from "@/diagnostics/diagnostics";
import BddReader from "@input/bddReader";
import BddMappingValidator from "@/validate/bddMappingValidator";
import { StepType, type Feature } from "@/types/feature";
import { DesignOperationType, ExtractSource } from "@/types/framework";
import type { FrameworkMappingFileSet } from "@/types/framework";

function createFeature(content: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverit-bdd-"));
  const featurePath = path.join(root, "example.feature");
  fs.writeFileSync(featurePath, content, "utf8");
  return featurePath;
}

function mapping(): FrameworkMappingFileSet {
  return {
    states: {
      S_HOME: {
        id: "S_HOME",
        type: StepType.STATE,
        url: "/",
        className: "HomePageState",
      },
      S_CART: {
        id: "S_CART",
        type: StepType.STATE,
        url: "/cart",
        className: "CartPageState",
      },
    },
    transitions: {
      T_OPEN_CART: {
        id: "T_OPEN_CART",
        type: StepType.TRANSITION,
        className: "OpenCartTransition",
        action: {
          type: "click",
          stateId: "S_HOME",
          locatorKey: "cartButton",
        },
      },
    },
    assertions: {
      A_CART_ROWS_VISIBLE: {
        id: "A_CART_ROWS_VISIBLE",
        type: StepType.ASSERTION,
        definition: {
          type: "element",
          assertion: "visibility",
          stateId: "S_CART",
          locatorKey: "cartRows",
          visible: true,
        },
      },
    },
    actionHooks: {
      H_STORE_ITEM_COST: {
        id: "H_STORE_ITEM_COST",
        type: StepType.ACTION_HOOK,
        definition: {
          type: "design-operation",
          operationId: "storeItemCost",
        },
      },
    },
    designClass: {
      id: "scenarioData",
      extracts: {
        itemCost: {
          stateId: "S_HOME",
          locatorKey: "itemPrice",
          source: ExtractSource.TEXT,
        },
      },
      operations: {
        storeItemCost: {
          type: DesignOperationType.SET,
          key: "item.cost",
          value: { from: "itemCost" },
        },
      },
    },
  };
}

test("BddReader keeps parsed step ids positional and leaves semantic ids in step text", () => {
  fs.mkdirSync(path.join(process.cwd(), "dist-test", "input", "features"), { recursive: true });
  const featurePath = createFeature(`Feature: Cart

  Scenario: Cart opens
    Given I use design class "scenarioData"
    Given the UI is in state "S_HOME"
    When I perform transition "T_OPEN_CART"
    And after action I run hook "storeItemCost"
    Then the UI should be in state "S_CART"
    And I assert "A_CART_ROWS_VISIBLE"
`);

  const feature = new BddReader().parse({
    absolutePath: featurePath,
    relativePath: "example.feature",
  });

  assert.deepEqual(
    feature.scenarios[0].steps.map((step) => [step.type, step.id]),
    [
      [StepType.STATE, "1"],
      [StepType.STATE, "2"],
      [StepType.TRANSITION, "3"],
      [StepType.ACTION_HOOK, "4"],
      [StepType.STATE, "5"],
      [StepType.ASSERTION, "6"],
    ],
  );
  assert.match(feature.scenarios[0].steps[1].stepText, /"S_HOME"/);
});

test("BddMappingValidator accepts valid semantic ids and design operation hook aliases", () => {
  diagnostics.clear();
  const feature: Feature = {
    name: "Cart",
    filePath: {
      absolutePath: "cart.feature",
      relativePath: "cart.feature",
    },
    scenarios: [
      {
        id: "1",
        name: "Cart opens",
        steps: [
          {
            id: "1",
            keyword: "Given",
            parentKeyword: "Given",
            type: StepType.STATE,
            stepText: 'I use design class "scenarioData"',
          },
          {
            id: "2",
            keyword: "Given",
            parentKeyword: "Given",
            type: StepType.STATE,
            stepText: 'the UI is in state "S_HOME"',
          },
          {
            id: "3",
            keyword: "When",
            parentKeyword: "When",
            type: StepType.TRANSITION,
            stepText: 'I perform transition "T_OPEN_CART"',
          },
          {
            id: "4",
            keyword: "And",
            parentKeyword: "When",
            type: StepType.ACTION_HOOK,
            stepText: 'after action I run hook "storeItemCost"',
          },
          {
            id: "5",
            keyword: "Then",
            parentKeyword: "Then",
            type: StepType.STATE,
            stepText: 'the UI should be in state "S_CART"',
          },
          {
            id: "6",
            keyword: "And",
            parentKeyword: "Then",
            type: StepType.ASSERTION,
            stepText: 'I assert "A_CART_ROWS_VISIBLE"',
          },
        ],
      },
    ],
  };

  new BddMappingValidator().validate([feature], mapping());

  assert.deepEqual(diagnostics.all(), []);
});

test("BddMappingValidator reports warnings for missing ids", () => {
  diagnostics.clear();
  const feature: Feature = {
    name: "Cart",
    filePath: {
      absolutePath: "cart.feature",
      relativePath: "cart.feature",
    },
    scenarios: [
      {
        id: "1",
        name: "Broken cart",
        steps: [
          {
            id: "S_MISSING",
            keyword: "Given",
            parentKeyword: "Given",
            type: StepType.STATE,
            stepText: 'the UI is in state "S_MISSING"',
          },
          {
            id: "T_MISSING",
            keyword: "When",
            parentKeyword: "When",
            type: StepType.TRANSITION,
            stepText: 'I perform transition "T_MISSING"',
          },
          {
            id: "A_MISSING",
            keyword: "And",
            parentKeyword: "Then",
            type: StepType.ASSERTION,
            stepText: 'I assert "A_MISSING"',
          },
          {
            id: "H_MISSING",
            keyword: "And",
            parentKeyword: "When",
            type: StepType.ACTION_HOOK,
            stepText: 'after action I run hook "H_MISSING"',
          },
        ],
      },
    ],
  };

  new BddMappingValidator().validate([feature], mapping());

  assert.deepEqual(
    diagnostics.all().map((diagnostic) => diagnostic.code),
    ["UNKNOWN_STATE_ID", "UNKNOWN_TRANSITION_ID", "UNKNOWN_ASSERTION_ID", "UNKNOWN_ACTION_HOOK_ID"],
  );
});
