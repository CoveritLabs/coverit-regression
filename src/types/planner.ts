// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

export interface StructuredMergeContext {
  relativePath: string;
  sourcePath: string;
  targetPath: string;
  currentContent: string;
  nextContent: string;
  previousGeneratedContent?: string;
}

export interface StructuredMergeResult {
  applicable: boolean;
  merged?: string;
  reason?: string;
}

export interface StructuredMergeDecision extends StructuredMergeResult {
  diagnosticCode?: string;
  successReason?: string;
  preserveOnFailure?: boolean;
}

export interface ClassMemberMergeResult {
  merged?: string;
  reason?: string;
}
