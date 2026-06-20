// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { Logger } from "winston";

import { Diagnostic, DiagnosticSeverity } from "@/types/diagnostics";

class Diagnostics {
  private readonly diagnostics: Diagnostic[] = [];

  clear(): void {
    this.diagnostics.length = 0;
  }

  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  warning(code: string, message: string, filePath?: string, details?: string): void {
    this.add({ severity: DiagnosticSeverity.Warning, code, message, filePath, details });
  }

  error(code: string, message: string, filePath?: string, details?: string): void {
    this.add({ severity: DiagnosticSeverity.Error, code, message, filePath, details });
  }

  all(): Diagnostic[] {
    return [...this.diagnostics];
  }

  hasErrors(): boolean {
    return this.diagnostics.some((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error);
  }

  print(logger: Logger): void {
    if (this.diagnostics.length === 0) {
      logger.info("[Diagnostics] No diagnostics reported.");
      return;
    }

    logger.warn(`[Diagnostics] Reported ${this.diagnostics.length} diagnostic(s).`);
    for (const diagnostic of this.diagnostics) {
      const location = diagnostic.filePath ? ` (${diagnostic.filePath})` : "";
      const details = diagnostic.details ? ` ${diagnostic.details}` : "";
      const message = `[${diagnostic.code}] ${diagnostic.message}${location}.${details}`;
      if (diagnostic.severity === DiagnosticSeverity.Error) logger.error(message);
      else logger.warn(message);
    }
  }
}

export const diagnostics = new Diagnostics();

