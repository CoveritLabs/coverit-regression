// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

export interface GeneratorOptions {
  inputPath: string;
  outputPath: string;
  dryRun: boolean;
  check: boolean;
  logToFile: boolean;
  generatedConfig?: GeneratedProjectConfig;
}

export interface GeneratedProjectConfig {
  applicationBaseUrl?: string;
  applicationId?: string;
  versionId?: string;
  coveritApiBaseUrl?: string;
  localArtifactsEnabled?: boolean;
  artifactRoot?: string;
  healingEnabled?: boolean;
  healingThreshold?: number;
  githubActionsEnabled?: boolean;
}
