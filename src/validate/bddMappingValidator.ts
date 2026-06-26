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
  CLEAN_ELEMENT: /'((?:\\'|[^'])+)'\.[A-Za-z0-9_-]+/,
  CLEAN_CALL: /^call '((?:\\'|[^'])+)'$/,
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

  private validateStep(
    filePath: string,
    scenarioName: string,
    step: Step,
    mapping: FrameworkMappingFileSet,
  ): void {
    const designClassId = this.extract(step.stepText, STEP_REFERENCE.DESIGN_CLASS);
    if (designClassId) {
      if (designClassId !== mapping.designClass.id) this.warn("UNKNOWN_DESIGN_CLASS_ID", scenarioName, `design class "${designClassId}"`, filePath);
      return;
    }

    if (step.type === StepType.STATE) {
      const stateId = this.extract(step.stepText, STEP_REFERENCE.STATE);
      if (stateId && !mapping.states[stateId]) this.warn("UNKNOWN_STATE_ID", scenarioName, `state "${stateId}"`, filePath);
      return;
    }

    if (step.type === StepType.TRANSITION) {
      const transitionId = this.extract(step.stepText, STEP_REFERENCE.TRANSITION);
      if (transitionId && !mapping.transitions[transitionId]) this.warn("UNKNOWN_TRANSITION_ID", scenarioName, `transition "${transitionId}"`, filePath);
      return;
    }

    const elementAlias = this.extract(step.stepText, STEP_REFERENCE.CLEAN_ELEMENT);
    if (elementAlias && !this.elementAliasExists(elementAlias, mapping)) {
      this.warn("UNKNOWN_ELEMENT_ALIAS", scenarioName, `element alias "${elementAlias}"`, filePath);
      return;
    }

    const functionId = this.extract(step.stepText, STEP_REFERENCE.CLEAN_CALL);
    if (functionId && !mapping.assertions.functions?.[functionId] && !mapping.designClass.functions?.[functionId]) {
      this.warn("UNKNOWN_FUNCTION_ID", scenarioName, `function "${functionId}"`, filePath);
    }
  }

  private elementAliasExists(alias: string, mapping: FrameworkMappingFileSet): boolean {
    if (mapping.assertions.elements?.[alias]) return true;
    return Object.values(mapping.states).some((state) => Boolean(state.dom?.elements?.[alias]));
  }

  private extract(text: string, pattern: RegExp): string | undefined {
    return text.match(pattern)?.[1]?.replace(/\\'/g, "'");
  }

  private warn(code: string, scenarioName: string, reference: string, filePath: string): void {
    diagnostics.warning(code, `Scenario "${scenarioName}" references unmapped ${reference}.`, filePath);
  }
}

export default BddMappingValidator;
