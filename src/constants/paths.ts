// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";

const SRC_DIR = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SRC_DIR, "..");

export const PATHS = {
  ROOT: PROJECT_ROOT,
  OUTPUT: path.join(PROJECT_ROOT, "output"),
  INPUT: path.join(PROJECT_ROOT, "input"),
  LOG_FILE: path.join(PROJECT_ROOT, "logs", "generator.log"),
  BDD_FEATURES: path.join(PROJECT_ROOT, "input", "features"),
  FRAMEWORK_MAPPING: path.join(PROJECT_ROOT, "input", "framework-mapping"),
  TEMPLATES: path.join(PROJECT_ROOT, "templates"),
  MATERIALIZED_TEMPLATES: path.join(PROJECT_ROOT, ".generated", "templates"),
} as const;
