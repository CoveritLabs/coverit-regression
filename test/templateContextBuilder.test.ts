// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import TemplateContextBuilder from "@generator/templateContextBuilder";
import { StepType } from "@/types/feature";
import { DesignOperationType, type GeneratedFrameworkModel } from "@/types/framework";

test("TemplateContextBuilder marks generated metadata overwritable and omits new dbId output", () => {
  const model: GeneratedFrameworkModel = {
    states: [
      {
        id: "S_HOME",
        dbId: "db-state",
        type: StepType.STATE,
        label: "Home",
        url: "/",
        className: "HomeState",
        dom: {
          elements: {
            cta: { cssSelector: "#cta" },
          },
        },
      },
    ],
    transitions: [
      {
        id: "T_LOGIN",
        dbId: "db-transition",
        type: StepType.TRANSITION,
        label: "Login",
        className: "LoginTransition",
        actions: [
          { type: "fill", locator: { cssSelector: "#username" }, value: "standard_user" },
          { type: "fill", locator: { cssSelector: "#password" }, value: "secret_sauce" },
          { type: "click", stateId: "S_HOME", locatorKey: "cta" },
        ],
      },
    ],
    assertions: [],
    actionHooks: [],
    designClass: {
      id: "scenarioData",
      dbId: "db-design",
    },
  };

  const metadata = new TemplateContextBuilder().build(model).metadata;

  assert.equal(metadata.stateInfo.S_HOME.overwritable, true);
  assert.equal("dbId" in metadata.stateInfo.S_HOME, false);
  assert.equal(metadata.transitionInfo.T_LOGIN.overwritable, true);
  assert.equal("dbId" in metadata.transitionInfo.T_LOGIN, false);
  assert.deepEqual(metadata.transitionInfo.T_LOGIN.actions.map((action) => action.type), ["fill", "fill", "click"]);
  assert.equal(metadata.locators.states.S_HOME.overwritable, true);
  assert.equal(metadata.locators.transitions.T_LOGIN.overwritable, true);
  assert.equal(metadata.locators.transitions.T_LOGIN.actions?.length, 3);
  assert.deepEqual(metadata.locators.transitions.T_LOGIN.actions?.[0].locator, { cssSelector: "#username" });
  assert.equal(metadata.locators.transitions.T_LOGIN.actions?.[2].locatorKey, "cta");
  assert.equal(metadata.registry.states.S_HOME.overwritable, true);
  assert.equal(metadata.registry.transitions.T_LOGIN.overwritable, true);
  assert.equal(metadata.designClassInfo.overwritable, true);
  assert.equal("dbId" in metadata.designClassInfo, false);
});

test("TemplateContextBuilder materializes inline code blocks into generated extension maps", () => {
  const model: GeneratedFrameworkModel = {
    states: [],
    transitions: [],
    assertions: [
      {
        id: "A_INLINE",
        type: StepType.ASSERTION,
        label: "Inline assertion",
        definition: {
          type: "code",
          code: {
            language: "typescript",
            body: "return { passed: true, message: \"ok\" };",
          },
        },
      },
    ],
    actionHooks: [
      {
        id: "H_INLINE",
        type: StepType.ACTION_HOOK,
        label: "Inline hook",
        definition: {
          type: "code",
          code: {
            language: "typescript",
            body: "context.store.set(\"hook.ran\", true);",
          },
        },
      },
    ],
    designClass: {
      id: "scenarioData",
      expressions: {
        inlineExpression: {
          code: {
            language: "typescript",
            body: "return true;",
          },
        },
      },
      functions: {
        computeValue: {
          code: {
            language: "typescript",
            body: "return 7;",
          },
        },
      },
      assertionFunctions: {
        assertStore: {
          code: {
            language: "typescript",
            body: "return { passed: true, message: \"store ok\" };",
          },
        },
      },
      operations: {
        storeComputed: {
          type: DesignOperationType.SET,
          key: "computed.value",
          value: {
            code: {
              language: "typescript",
              body: "return 42;",
            },
          },
        },
      },
    },
  };

  const metadata = new TemplateContextBuilder().build(model).metadata;

  assert.equal(metadata.inlineCode.designFunctions.length, 3);
  assert.equal(metadata.inlineCode.assertionFunctions.length, 2);
  assert.equal(metadata.inlineCode.hookFunctions.length, 1);
  assert.equal("code" in (metadata.assertionInfo.A_INLINE.definition as unknown as Record<string, unknown>), false);
  assert.match((metadata.assertionInfo.A_INLINE.definition as { functionId?: string }).functionId ?? "", /^__inline_assertion_A_INLINE_/);
  assert.equal("code" in (metadata.actionHookInfo.H_INLINE.definition as unknown as Record<string, unknown>), false);
  assert.match((metadata.actionHookInfo.H_INLINE.definition as { functionId?: string }).functionId ?? "", /^__inline_hook_H_INLINE_/);
  assert.equal("code" in (metadata.designClassInfo.functions?.computeValue as Record<string, unknown>), false);
  assert.equal(metadata.designClassInfo.functions?.computeValue.implementationId, "computeValue");
  assert.match(
    ((metadata.designClassInfo.operations?.storeComputed as { value?: { functionId?: string } }).value?.functionId ?? ""),
    /^__inline_value_storeComputed_value_/,
  );
});
