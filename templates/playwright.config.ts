// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { defineConfig } from "@playwright/test";

import { getCoveritRunId, loadCoveritConfig } from "./src/config/coveritConfig";
import { getArtifactPaths } from "./src/utils/artifactPaths";

const config = loadCoveritConfig();
const artifactPaths = getArtifactPaths(config, getCoveritRunId());

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  retries: 0,
  outputDir: artifactPaths.playwrightResults,
  reporter: [["list"], ["html", { outputFolder: artifactPaths.playwrightReport, open: "never" }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  }
});
