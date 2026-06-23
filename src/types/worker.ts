// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { CodegenConfig, GitWorkflowOptions, GitWorkflowResult, PreparedGitWorkflow } from "@/types/gitWorkflow";
import type { GeneratorOptions } from "@/types/generator";

export interface BddOutputPayload {
  status?: string;
  session_id: string;
  features: BddOutputFeature[];
  states: Record<string, unknown>;
  transitions: Record<string, unknown>;
  assertions: Record<string, unknown>;
  action_hooks: Record<string, unknown>;
  design_class?: Record<string, unknown>;
  flow_ids?: string[];
  regression_codebase_id?: string;
  codegen_config?: WorkerCodegenConfig;
}

export interface BddOutputFeature {
  id?: string;
  feature_name: string;
  feature_text: string;
  scenario_names?: string[];
}

export interface MaterializedBddInput {
  jobRootPath: string;
  inputPath: string;
  featurePaths: string[];
  mappingPath: string;
}

export interface CrawlSessionCodegenContext {
  sessionId: string;
  appVersionId: string;
  baseUrlSnapshot?: string;
  sessionCodegenConfig?: WorkerCodegenConfig;
  targetApplication: {
    id: string;
    name?: string;
    baseUrl: string;
  };
  creator: {
    id: string;
    email: string;
    name: string;
  };
  regressionCodebase?: {
    id?: string;
    frameworkName?: string;
    repositoryUrl?: string;
    apiKey?: string;
  };
}

export type WorkerCodegenConfig = Partial<Pick<CodegenConfig, "codegenBranch" | "prTargetBranch" | "prTitle" | "prBody" | "prDraft">> & {
  commitMessage?: string;
  commitAuthorName?: string;
  commitAuthorEmail?: string;
  outputPath?: string;
  logToFile?: boolean;
  coveritApiBaseUrl?: string;
  localArtifactsEnabled?: boolean;
  artifactRoot?: string;
  healingEnabled?: boolean;
  healingThreshold?: number;
  githubActionsEnabled?: boolean;
};

export interface CrawlSessionRepository {
  findCodegenContext(sessionId: string): Promise<CrawlSessionCodegenContext>;
  findRegressionCodebase?(
    targetApplicationId: string,
    regressionCodebaseId: string,
  ): Promise<CrawlSessionCodegenContext["regressionCodebase"]>;
  close?(): Promise<void>;
}

export interface GeneratorLike {
  generate(): Promise<boolean>;
}

export interface GitWorkflowRunnerLike {
  prepare(): Promise<PreparedGitWorkflow | undefined>;
  finalize(preparedWorkflow?: PreparedGitWorkflow): Promise<GitWorkflowResult>;
}

export interface WorkerCliOptions {
  generatorOptions: GeneratorOptions;
  gitWorkflowOptions: GitWorkflowOptions;
}
