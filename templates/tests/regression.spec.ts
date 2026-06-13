import path from "path";
import { Page, test } from "@playwright/test";

import { BddLoader } from "@/bdd/bddLoader";
import { RegressionRunner } from "@/core/regressionRunner";
import { RunReporter } from "@/reporting/runReporter";

const featuresDir = path.resolve(__dirname, "../features");
const features = new BddLoader().loadAll(featuresDir);

for (const feature of features) {
  test.describe(feature.name, () => {
    for (const scenario of feature.scenarios) {
      test(scenario.name, async ({ page }: { page: Page }) => {
        const reporter = new RunReporter({ featureName: feature.name, scenarioName: scenario.name });
        await new RegressionRunner(page, { reporter, featureName: feature.name, scenarioName: scenario.name }).runScenario(scenario);
      });
    }
  });
}
