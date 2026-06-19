// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { PATHS } from "@constants/paths";

export const CLI_DEFAULTS = {
  inputPath: PATHS.INPUT,
  outputPath: PATHS.OUTPUT,
  dryRun: false,
  check: false,
  logToFile: true,
} as const;

export const GIT_WORKFLOW_DEFAULTS = {
  branchPrefix: "codegen",
  commitMessage: "chore: update generated regression assets",
  pullRequestTitle: "chore: update generated regression assets",
  pullRequestBodyIntro: "Automated regression code generation update.",
  pullRequestBodyHeading: "Changed files:",
} as const;
