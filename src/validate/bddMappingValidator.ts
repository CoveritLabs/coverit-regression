// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { diagnostics } from "@/diagnostics/diagnostics";
import { Feature, Step, StepType } from "@/types/feature";
import { FrameworkMappingFileSet } from "@/types/framework";

const STEP_REFERENCE = {
  DESIGN_CLASS: /I use design class "([^"]+)"/,
  STATE: /the UI (?:is in|should be in) state "([^"]+)"/,
  TRANSITION: /I perform transition "([^"]+)"/,
  ASSERTION: /I assert "([^"]+)"/,
  GENERATED_HOOK: /^(?:before|after) action I run hook "([^"]+)"/,
  EXTRACT: /^(?:before|after) action I extract "([^"]+)"/,
};

class BddMappingValidator {
  validate(features: Feature[], mapping: FrameworkMappingFileSet): void {
    for (const feature of features) {
      for (const scenario of feature.scenarios) {
        for (const step of scenario.steps) {
          this.validateStep(feature.filePath.absolutePath, scenario.name, step, mapping);
        }
      }
    }
  }

  private validateStep(filePath: string, scenarioName: string, step: Step, mapping: FrameworkMappingFileSet): void {
    const designClassId = this.extract(step.stepText, STEP_REFERENCE.DESIGN_CLASS);
    if (designClassId) {
      if (designClassId !== mapping.designClass.id) {
        this.warn("UNKNOWN_DESIGN_CLASS_ID", scenarioName, `design class "${designClassId}"`, filePath);
      }
      return;
    }

    if (step.type === StepType.STATE) {
      const stateId = this.extract(step.stepText, STEP_REFERENCE.STATE);
      if (stateId && !mapping.states[stateId]) this.warn("UNKNOWN_STATE_ID", scenarioName, `state "${stateId}"`, filePath);
      return;
    }

    if (step.type === StepType.TRANSITION) {
      const transitionId = this.extract(step.stepText, STEP_REFERENCE.TRANSITION);
      if (transitionId && !mapping.transitions[transitionId]) {
        this.warn("UNKNOWN_TRANSITION_ID", scenarioName, `transition "${transitionId}"`, filePath);
      }
      return;
    }

    if (step.type === StepType.ASSERTION) {
      const assertionId = this.extract(step.stepText, STEP_REFERENCE.ASSERTION);
      if (assertionId) this.validateAssertion(filePath, scenarioName, assertionId, mapping);
      return;
    }

    if (step.type === StepType.ACTION_HOOK) {
      this.validateActionHook(filePath, scenarioName, step, mapping);
    }
  }

  private validateAssertion(
    filePath: string,
    scenarioName: string,
    assertionId: string,
    mapping: FrameworkMappingFileSet,
  ): void {
    if (mapping.assertions[assertionId]) return;
    if (mapping.designClass.assertionFunctions?.[assertionId]) return;
    if (mapping.designClass.operations?.[assertionId]) return;
    if (this.operationUsesExpression(assertionId, mapping)) return;

    this.warn("UNKNOWN_ASSERTION_ID", scenarioName, `assertion "${assertionId}"`, filePath);
  }

  private validateActionHook(
    filePath: string,
    scenarioName: string,
    step: Step,
    mapping: FrameworkMappingFileSet,
  ): void {
    const hookId = this.extract(step.stepText, STEP_REFERENCE.GENERATED_HOOK);
    if (hookId) {
      if (!this.actionHookExists(hookId, mapping) && !mapping.designClass.operations?.[hookId]) {
        this.warn("UNKNOWN_ACTION_HOOK_ID", scenarioName, `action hook "${hookId}"`, filePath);
      }
      return;
    }

    const extractId = this.extract(step.stepText, STEP_REFERENCE.EXTRACT);
    if (extractId && !mapping.designClass.extracts?.[extractId]) {
      this.warn("UNKNOWN_EXTRACT_ID", scenarioName, `extract "${extractId}"`, filePath);
    }
  }

  private actionHookExists(id: string, mapping: FrameworkMappingFileSet): boolean {
    if (mapping.actionHooks[id]) return true;
    return Object.values(mapping.actionHooks).some(
      (hook) => hook.definition.type === "design-operation" && hook.definition.operationId === id,
    );
  }

  private operationUsesExpression(expressionId: string, mapping: FrameworkMappingFileSet): boolean {
    return Object.values(mapping.designClass.operations ?? {}).some(
      (operation) => operation.type === "assert-expression" && operation.expressionId === expressionId,
    );
  }

  private extract(text: string, pattern: RegExp): string | undefined {
    return text.match(pattern)?.[1];
  }

  private warn(code: string, scenarioName: string, reference: string, filePath: string): void {
    diagnostics.warning(code, `Scenario "${scenarioName}" references unmapped ${reference}.`, filePath);
  }
}

export default BddMappingValidator;

