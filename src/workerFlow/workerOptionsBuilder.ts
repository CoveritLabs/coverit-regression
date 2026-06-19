// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";

import { CLI_DEFAULTS } from "@constants/config";
import { PATHS } from "@constants/paths";
import type {
  MaterializedBddInput,
  CrawlSessionCodegenContext,
  WorkerCliOptions,
  WorkerCodegenConfig,
} from "@/types/worker";

export function buildWorkerCliOptions(
  context: CrawlSessionCodegenContext,
  materializedInput: MaterializedBddInput,
  cwd: string = PATHS.ROOT,
): WorkerCliOptions {
  const codegenConfig = normalizeConfig(context.sessionCodegenConfig ?? {});
  const repositoryUrl = context.regressionCodebase?.repositoryUrl?.trim() ?? "";
  const apiKey = context.regressionCodebase?.apiKey?.trim() ?? "";
  const prTargetBranch = codegenConfig.prTargetBranch?.trim() ?? "";

  if (!repositoryUrl) throw new Error("[Worker] regressionCodebase.repositoryUrl is required.");
  if (!apiKey) throw new Error("[Worker] regressionCodebase.apiKey is required for repository workflow execution.");
  if (!prTargetBranch) throw new Error("[Worker] codegenConfig.prTargetBranch is required.");

  const outputPath = resolvePath(codegenConfig.outputPath ?? CLI_DEFAULTS.outputPath, cwd);

  const generatorOptions = {
    ...CLI_DEFAULTS,
    inputPath: materializedInput.inputPath,
    outputPath,
    dryRun: false,
    check: false,
    logToFile: codegenConfig.logToFile ?? CLI_DEFAULTS.logToFile,
    generatedConfig: {
      applicationBaseUrl: context.baseUrlSnapshot || context.targetApplication.baseUrl,
      applicationId: context.targetApplication.id,
      versionId: context.appVersionId,
      coveritApiBaseUrl: codegenConfig.coveritApiBaseUrl,
      localArtifactsEnabled: codegenConfig.localArtifactsEnabled,
      artifactRoot: codegenConfig.artifactRoot,
      healingEnabled: codegenConfig.healingEnabled,
      healingThreshold: codegenConfig.healingThreshold,
    },
  };

  return {
    generatorOptions,
    gitWorkflowOptions: {
      generatorOptions,
      regressionCodebase: {
        repositoryUrl,
        apiKey,
        frameworkName: context.regressionCodebase?.frameworkName,
      },
      codegenConfig: {
        prTargetBranch,
        codegenBranch: codegenConfig.codegenBranch,
        prTitle: codegenConfig.prTitle,
        prBody: codegenConfig.prBody,
        prDraft: codegenConfig.prDraft,
      },
      commitMessage: codegenConfig.commitMessage,
    },
  };
}

function normalizeConfig(config: WorkerCodegenConfig): WorkerCodegenConfig {
  return {
    ...config,
    codegenBranch: trimOptional(config.codegenBranch),
    prTargetBranch: trimOptional(config.prTargetBranch),
    prTitle: trimOptional(config.prTitle),
    prBody: trimOptional(config.prBody),
    commitMessage: trimOptional(config.commitMessage),
    outputPath: trimOptional(config.outputPath),
    coveritApiBaseUrl: trimOptional(config.coveritApiBaseUrl),
    artifactRoot: trimOptional(config.artifactRoot),
  };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolvePath(value: string, cwd: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}
