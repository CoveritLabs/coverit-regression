// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import { PATHS } from "@constants/paths";
import type { BddOutputPayload, MaterializedBddInput } from "@/types/worker";

const DEFAULT_DESIGN_CLASS = {
  id: "scenarioData",
  label: "Scenario Data",
  description: "Single scenario data store for generated regression flows.",
  store: {},
  extracts: {},
  expressions: {},
  functions: {},
  assertionFunctions: {},
  operations: {},
};

export async function materializeBddInput(
  payload: BddOutputPayload,
  options: { jobId?: string; baseDir?: string } = {},
): Promise<MaterializedBddInput> {
  const baseDir = options.baseDir ?? path.join(PATHS.ROOT, "tmp");
  await fs.mkdir(baseDir, { recursive: true });

  const uniquePart = sanitizePathSegment(options.jobId || payload.session_id || randomUUID());
  const jobRootPath = path.join(baseDir, `job-input-${uniquePart}-${Date.now()}`);
  const inputPath = path.join(jobRootPath, "input");
  const featuresPath = path.join(inputPath, "features");
  const mappingPath = path.join(inputPath, "framework-mapping");

  await fs.mkdir(featuresPath, { recursive: true });
  await fs.mkdir(mappingPath, { recursive: true });

  const featurePath = path.join(featuresPath, `${safeFeatureName(payload.feature_name)}.feature`);
  await fs.writeFile(featurePath, payload.feature_text, "utf8");

  await writeJson(path.join(mappingPath, "states.json"), payload.states);
  await writeJson(path.join(mappingPath, "transitions.json"), payload.transitions);
  await writeJson(path.join(mappingPath, "assertions.json"), payload.assertions);
  await writeJson(path.join(mappingPath, "action-hooks.json"), payload.action_hooks);
  await writeJson(path.join(mappingPath, "design-class.json"), payload.design_class ?? DEFAULT_DESIGN_CLASS);

  return { jobRootPath, inputPath, featurePath, mappingPath };
}

function safeFeatureName(featureName: string): string {
  const safeName = featureName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeName || "generated_feature";
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 120) || randomUUID();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
