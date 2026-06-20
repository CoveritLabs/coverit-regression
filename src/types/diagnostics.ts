// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

export enum DiagnosticSeverity {
  Warning = "warning",
  Error = "error",
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  filePath?: string;
  details?: string;
}

