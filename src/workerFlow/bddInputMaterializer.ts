// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
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
  const baseDir = options.baseDir ?? (await resolveWritableTmpDir());
  await fs.mkdir(baseDir, { recursive: true });

  const uniquePart = sanitizePathSegment(options.jobId || payload.session_id || randomUUID());
  const jobRootPath = path.join(baseDir, `generated-${uniquePart}-${Date.now()}`);
  const inputPath = path.join(jobRootPath, "input");
  const featuresPath = path.join(inputPath, "features");
  const mappingPath = path.join(inputPath, "framework-mapping");

  await fs.mkdir(featuresPath, { recursive: true });
  await fs.mkdir(mappingPath, { recursive: true });

  const featurePaths = await writeFeatures(featuresPath, payload.features);

  await writeJson(path.join(mappingPath, "states.json"), payload.states);
  await writeJson(path.join(mappingPath, "transitions.json"), payload.transitions);
  await writeJson(path.join(mappingPath, "assertions.json"), payload.assertions);
  await writeJson(path.join(mappingPath, "action-hooks.json"), payload.action_hooks);
  await writeJson(path.join(mappingPath, "design-class.json"), payload.design_class ?? DEFAULT_DESIGN_CLASS);

  return { jobRootPath, inputPath, featurePaths, mappingPath };
}

async function writeFeatures(
  featuresPath: string,
  features: BddOutputPayload["features"],
): Promise<string[]> {
  const usedFileNames = new Set<string>();
  const featurePaths: string[] = [];

  for (const feature of features) {
    const fileName = uniqueFeatureFileName(feature.feature_name, usedFileNames);
    const featurePath = path.join(featuresPath, fileName);
    await fs.writeFile(featurePath, feature.feature_text, "utf8");
    featurePaths.push(featurePath);
  }

  return featurePaths;
}

function uniqueFeatureFileName(featureName: string, usedFileNames: Set<string>): string {
  const baseName = safeFeatureName(featureName);
  let fileName = `${baseName}.feature`;
  let suffix = 2;

  while (usedFileNames.has(fileName.toLowerCase())) {
    fileName = `${baseName}_${suffix}.feature`;
    suffix += 1;
  }

  usedFileNames.add(fileName.toLowerCase());
  return fileName;
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

export async function resolveWritableTmpDir(
  primaryPath: string = PATHS.TMP,
  fallbackPath: string = path.join(os.tmpdir(), "coverit-regression"),
  assertWritable: (directoryPath: string) => Promise<void> = assertWritableDirectory,
): Promise<string> {
  try {
    await fs.mkdir(primaryPath, { recursive: true });
    await assertWritable(primaryPath);
    return primaryPath;
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    await fs.mkdir(fallbackPath, { recursive: true });
    await assertWritable(fallbackPath);
    return fallbackPath;
  }
}

async function assertWritableDirectory(directoryPath: string): Promise<void> {
  const probePath = path.join(directoryPath, `.coverit-write-probe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(probePath);
  await fs.rm(probePath, { recursive: true, force: true });
}

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}
