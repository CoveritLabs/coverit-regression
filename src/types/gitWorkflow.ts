// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { GeneratorOptions } from "@/types/generator";

export interface RegressionCodebase {
  frameworkName?: string;
  repositoryUrl: string;
  apiKey?: string;
}

export interface CodegenConfig {
  codegenBranch?: string;
  prTargetBranch?: string;
  prTitle?: string;
  prBody?: string;
  prDraft?: boolean;
  githubActionsEnabled?: boolean;
}

export interface GitWorkflowOptions {
  generatorOptions: GeneratorOptions;
  regressionCodebase: RegressionCodebase;
  codegenConfig: CodegenConfig;
  commitMessage?: string;
  commitAuthorName?: string;
  commitAuthorEmail?: string;
}

export interface GitCommitAuthor {
  name: string;
  email: string;
}

export interface PullRequestRequest {
  repositoryUrl: string;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  isDraft: boolean;
  apiKey?: string;
}

export interface PullRequestResponse {
  url: string;
  number: number;
}

export interface GitWorkflowResult {
  branchName: string;
  changedFiles: string[];
  noChanges: boolean;
  pushed: boolean;
  pullRequest?: PullRequestResponse;
}

export interface PreparedGitWorkflow {
  branchName: string;
  repositoryUrl: string;
  repositoryPath: string;
  apiKey?: string;
  targetBranch?: string;
  baseBranch: string;
  configuredBranch: boolean;
}
