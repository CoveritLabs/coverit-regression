// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";
import { Page, test } from "@playwright/test";

import { BddLoader } from "@/bdd/bddLoader";
import { RegressionRunner } from "@/core/regressionRunner";
import { RunReporter } from "@/reporting/runReporter";

const featuresDir = path.resolve(__dirname, "../features");
const features = new BddLoader().loadAll(featuresDir);
const reporters = new Map<string, RunReporter>();
const scenarioNameOccurrences = new Map<string, number>();
let scenarioIndex = 0;

test.afterEach(async ({}, testInfo) => {
  const reporter = reporters.get(testInfo.testId);
  if (!reporter) return;
  reporters.delete(testInfo.testId);
  await reporter.uploadArtifacts("scenario", { maxDurationMs: 10_000 });
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await new RunReporter().uploadArtifacts("run", { maxDurationMs: 25_000 });
});

for (const feature of features) {
  test.describe(feature.name, () => {
    for (const scenario of feature.scenarios) {
      const currentScenarioIndex = ++scenarioIndex;
      const scenarioNameCount = (scenarioNameOccurrences.get(scenario.name) ?? 0) + 1;
      scenarioNameOccurrences.set(scenario.name, scenarioNameCount);
      const scenarioArtifactName = scenarioNameCount === 1 ? scenario.name : `${scenario.name}-${scenarioNameCount}`;
      test(scenario.name, async ({ page }: { page: Page }, testInfo) => {
        const reporter = new RunReporter({ featureName: feature.name, scenarioName: scenario.name, scenarioIndex: currentScenarioIndex, scenarioArtifactName });
        reporters.set(testInfo.testId, reporter);
        await new RegressionRunner(page, { reporter, featureName: feature.name, scenarioName: scenario.name }).runScenario(scenario);
      });
    }
  });
}
