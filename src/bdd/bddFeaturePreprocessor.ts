// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { diagnostics } from "@/diagnostics/diagnostics";
import type { BddOutputFeature, BddOutputPayload } from "@/types/worker";
import { buildBddFormattingPayload } from "./bddPayloadNormalizer";
import { BddStepTextResolver } from "./bddStepText";

const STEP_PATTERN = /^(\s*)(Given|When|Then|And|But)\s+(.+)$/;
const ASSERTION_PATTERN = /^I assert "([^"]+)"$/;
const HOOK_PATTERN = /^(before|after) action I run hook "([^"]+)"$/;
const DESIGN_CLASS_PATTERN = /^I use design class "([^"]+)"$/;
const TRANSITION_PATTERN = /^I perform transition "([^"]+)"$/;

export function preprocessBddFeatures(payload: BddOutputPayload): BddOutputFeature[] {
  const normalizedPayload = buildBddFormattingPayload(payload);
  const resolver = new BddStepTextResolver({
    assertions: normalizedPayload.assertions,
    actionHooks: normalizedPayload.action_hooks,
    designClass: normalizedPayload.design_class,
  });

  return normalizedPayload.features.map((feature) => ({
    ...feature,
    feature_text: preprocessBddFeatureText(feature.feature_text, resolver, feature.feature_name),
  }));
}

export function preprocessBddFeatureText(
  featureText: string,
  resolver: BddStepTextResolver,
  featureName = "generated feature",
): string {
  const lines = featureText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const output: string[] = [];
  let pendingBeforeAction = false;

  for (const line of lines) {
    const match = line.match(STEP_PATTERN);
    if (!match) {
      output.push(line);
      continue;
    }

    const [, indent, keyword, stepText] = match;
    const assertionId = stepText.match(ASSERTION_PATTERN)?.[1];
    if (assertionId) {
      const formatted = resolver.formatAssertion(assertionId);
      if (formatted) output.push(`${indent}${keyword} ${formatted}`);
      else {
        diagnostics.warning("UNFORMATTED_ASSERTION_STEP", `Feature "${featureName}" references assertion "${assertionId}" without a formatter mapping.`);
        output.push(line);
      }
      continue;
    }

    const hookMatch = stepText.match(HOOK_PATTERN);
    if (hookMatch) {
      const timing = hookMatch[1];
      const hookId = hookMatch[2];
      const formatted = resolver.formatActionHook(hookId);
      if (!formatted) {
        diagnostics.warning("UNFORMATTED_ACTION_HOOK_STEP", `Feature "${featureName}" references action hook "${hookId}" without a formatter mapping.`);
        output.push(line);
        continue;
      }

      const nextKeyword = timing === "before" && !pendingBeforeAction ? "When" : "And";
      output.push(`${indent}${nextKeyword} ${formatted}`);
      if (timing === "before") pendingBeforeAction = true;
      continue;
    }

    const designClassId = stepText.match(DESIGN_CLASS_PATTERN)?.[1];
    if (designClassId) {
      const formatted = resolver.formatActionHook(designClassId);
      if (formatted) {
        const timing = resolver.getActionHookTiming(designClassId);
        const nextKeyword = timing === "pre" && !pendingBeforeAction ? "When" : keyword;
        output.push(`${indent}${nextKeyword} ${formatted}`);
        if (timing === "pre") pendingBeforeAction = true;
        continue;
      }
    }

    if (pendingBeforeAction && TRANSITION_PATTERN.test(stepText)) {
      output.push(`${indent}And ${stepText}`);
      pendingBeforeAction = false;
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}
