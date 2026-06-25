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
  const apiKey = trimOptional(context.regressionCodebase?.apiKey);
  const prTargetBranch = trimOptional(codegenConfig.prTargetBranch);

  if (!repositoryUrl) throw new Error("[Worker] regressionCodebase.repositoryUrl is required.");

  void cwd;
  const outputPath = path.join(materializedInput.jobRootPath, "output");

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
      localArtifactsEnabled: codegenConfig.localArtifactsEnabled,
      artifactRoot: codegenConfig.artifactRoot,
      healingEnabled: codegenConfig.healingEnabled,
      healingThreshold: codegenConfig.healingThreshold,
      githubActionsEnabled: codegenConfig.githubActionsEnabled,
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
        githubActionsEnabled: codegenConfig.githubActionsEnabled,
      },
      commitMessage: codegenConfig.commitMessage,
      commitAuthorName: codegenConfig.commitAuthorName,
      commitAuthorEmail: codegenConfig.commitAuthorEmail,
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
    commitAuthorName: trimOptional(config.commitAuthorName),
    commitAuthorEmail: trimOptional(config.commitAuthorEmail),
    outputPath: trimOptional(config.outputPath),
    artifactRoot: trimOptional(config.artifactRoot),
  };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
