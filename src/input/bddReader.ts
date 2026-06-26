// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { PATHS } from "@constants/paths";
import { PARENT_KEYWORDS, type ParentKeyWord, type StepKeyword, StepType } from "@/types/feature";
import { FileEntry } from "@/types/files";
import { Feature, Scenario, Step } from "@/types/feature";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

const REGEX = {
  FEATURE: /Feature:\s*(.+)/gm,
  SCENARIO: /Scenario:\s*(.+)/gm,
  STEP: /^\s*(Given|When|Then|And|But)\s+(.+)/gm,
  STATE: /the UI (?:is in|should be in) state "([^"]+)"/,
  TRANSITION: /I perform transition "([^"]+)"/,
  DESIGN_CLASS: /I use design class "([^"]+)"/,
  ASSERTION: /^I assert "([^"]+)"$/,
  GENERATED_HOOK: /^(?:before|after) action I run hook "([^"]+)"$/,
  CLEAN_ASSERTION: /^(?:assert|call)\b/,
  CLEAN_HOOK: /^(?:wait|wait-for-url|wait-for-load-state|refresh|reload|go-back|go-forward|click|dblclick|fill|clear|hover|select|check|uncheck|press|focus|blur|assign|append|prepend|merge|remove|pop|increment|decrement|toggle|delete|put|call)\b/,
};

class BddReader {
  features: FileEntry[] = [];
  private readonly featuresPath: string;

  constructor(featuresPath: string = PATHS.BDD_FEATURES) {
    this.featuresPath = featuresPath;
    if (!FileHandler.exists(this.featuresPath)) {
      throw new Error(
        `${this.featuresPath} does not exist. Please create the directory and add your .feature files there.`,
      );
    }
  }

  scan(): FileEntry[] {
    logger.info(`[BDD Reader] Scanning for .feature files in ${this.featuresPath}...`);
    const files = FileHandler.scanDirectory(this.featuresPath);
    this.features = FileHandler.filterByExtension(files, ".feature");
    logger.info(`[BDD Reader] Found ${this.features.length} .feature file(s).`);
    return this.features;
  }

  parse(featureFile: FileEntry): Feature {
    logger.debug(`[BDD Reader] Parsing feature file: ${featureFile.relativePath}`);
    const featureRegex = REGEX.FEATURE;
    featureRegex.lastIndex = 0;
    const content = FileHandler.readFile(featureFile.absolutePath);
    let match = featureRegex.exec(content);
    if (!match) {
      throw new Error(`No feature name found in ${featureFile.relativePath}.`);
    }

    const featureName = match[1].trim();
    logger.debug(`[BDD Reader] Found feature name: ${featureName}`);
    const scenarios = this.extractScenarios(content);
    logger.debug(`[BDD Reader] Extracted ${scenarios.length} scenario(s) for feature: ${featureName}`);

    return {
      name: featureName,
      filePath: featureFile,
      scenarios,
    };
  }

  printFeature(feature: Feature): void {
    logger.debug(`Feature: ${feature.name}`);
    for (const scenario of feature.scenarios) {
      logger.debug(`  Scenario: ${scenario.name}`);
      for (const step of scenario.steps) {
        logger.debug(`    ${step.keyword} ${step.stepText} (Parent: ${step.parentKeyword}, Type: ${step.type})`);
      }
    }
  }

  private extractScenarios(content: string): Scenario[] {
    const scenarioRegex = REGEX.SCENARIO;
    const scenarios: Scenario[] = [];

    for (const match of content.matchAll(scenarioRegex)) {
      const scenarioName = match[1].trim();
      logger.debug(`[BDD Reader] Found scenario: ${scenarioName}`);

      const steps = this.extractSteps(content, match.index);
      logger.debug(`[BDD Reader] Extracted ${steps.length} step(s) for scenario: ${scenarioName}`);

      scenarios.push({ id: (scenarios.length + 1).toString(), name: scenarioName, steps });
    }

    return scenarios;
  }

  private extractSteps(content: string, startIndex: number): Step[] {
    const stepRegex = REGEX.STEP;
    const steps: Step[] = [];
    let lastParentKeyword: ParentKeyWord | null = null;

    const localContent = content.slice(startIndex);
    const nextScenarioIndex = localContent.search(/\n\s*Scenario:/);

    const scenarioBlock = nextScenarioIndex !== -1 ? localContent.slice(0, nextScenarioIndex) : localContent;

    for (const match of scenarioBlock.matchAll(stepRegex)) {
      const keyword = match[1] as StepKeyword;
      const stepText = match[2].trim();

      if ((PARENT_KEYWORDS as readonly string[]).includes(keyword)) {
        lastParentKeyword = keyword as ParentKeyWord;
      }

      steps.push({
        id: (steps.length + 1).toString(),
        keyword,
        parentKeyword: lastParentKeyword,
        type: this.determineStepType(keyword, stepText, lastParentKeyword),
        stepText,
      });
    }

    return steps;
  }

  private determineStepType(keyword: StepKeyword, stepText: string, parentKeyword?: ParentKeyWord): StepType {
    if (REGEX.DESIGN_CLASS.test(stepText) || REGEX.STATE.test(stepText)) return StepType.STATE;
    if (REGEX.TRANSITION.test(stepText)) return StepType.TRANSITION;
    if (REGEX.GENERATED_HOOK.test(stepText)) return StepType.ACTION_HOOK;
    if (REGEX.ASSERTION.test(stepText)) return StepType.ASSERTION;
    if ((keyword === "When" || parentKeyword === "When") && REGEX.CLEAN_HOOK.test(stepText)) return StepType.ACTION_HOOK;
    if (REGEX.CLEAN_ASSERTION.test(stepText)) return StepType.ASSERTION;

    switch (keyword) {
      case "Given":
      case "Then":
        return StepType.STATE;
      case "When":
        return StepType.TRANSITION;
      case "And":
      case "But":
        if (parentKeyword === "Given" || parentKeyword === "Then") return StepType.ASSERTION;
        if (parentKeyword === "When") return StepType.ACTION_HOOK;
      default:
        throw new Error(`No type available for keyword '${keyword}' with parent keyword '${parentKeyword}'.`);
    }
  }
}

export default BddReader;
