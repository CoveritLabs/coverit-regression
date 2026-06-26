// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { diagnostics } from "@/diagnostics/diagnostics";
import { GenerationRecord } from "@/types/generationRecord";
import { FileOperation, FileOperationKind, FileOwnershipMode } from "@/types/files";
import type { StructuredMergeContext, StructuredMergeDecision } from "@/types/planner";
import FileHandler from "@utils/files";
import { hashText } from "./fileHash";
import StructuredMergeCoordinator from "./structuredMerge/structuredMergeCoordinator";

class DiffDetector {
  private readonly structuredMergeCoordinator = new StructuredMergeCoordinator();

  detect(
    relativePath: string,
    sourcePath: string,
    targetPath: string,
    mode: FileOwnershipMode,
    record: GenerationRecord,
  ): FileOperation {
    const nextContent = FileHandler.readFile(sourcePath);

    if (!FileHandler.exists(targetPath)) {
      return {
        kind: FileOperationKind.Create,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        generatedContent: nextContent,
        reason: "Target file does not exist.",
      };
    }

    const currentContent = FileHandler.readFile(targetPath);
    if (hashText(currentContent) === hashText(nextContent)) {
      return {
        kind: FileOperationKind.Unchanged,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        generatedContent: nextContent,
        reason: "Target file already exists and is unchanged.",
      };
    }

    const context: StructuredMergeContext = {
      relativePath,
      sourcePath,
      targetPath,
      currentContent,
      nextContent,
    };

    const structuredMerge = this.tryStructuredMerge(context);
    if (structuredMerge) return structuredMerge;

    const previousRecord = record.files[relativePath];
    const previousGenerated = record.snapshots[relativePath];

    if (!previousRecord || !previousGenerated) {
      const message = "Existing generated file has no generation record; preserving it to avoid overwriting user changes.";
      diagnostics.warning("MISSING_GENERATION_RECORD", message, targetPath);
      return {
        kind: FileOperationKind.Preserve,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        generatedContent: nextContent,
        reason: message,
      };
    }

    if (previousRecord.hash === hashText(currentContent) && hashText(currentContent) === hashText(previousGenerated)) {
      return {
        kind: FileOperationKind.Update,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        generatedContent: nextContent,
        reason: "Generated file changed since the last generation run.",
      };
    }

    const merge = this.tryMerge({
      ...context,
      previousGeneratedContent: previousGenerated,
    });
    if (merge) {
      if (hashText(merge) === hashText(currentContent)) {
        return {
          kind: FileOperationKind.Unchanged,
          mode,
          relativePath,
          sourcePath,
          targetPath,
          content: merge,
          generatedContent: nextContent,
          reason: "Generated file is current after preserving custom class members.",
        };
      }

      return {
        kind: FileOperationKind.Update,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        content: merge,
        generatedContent: nextContent,
        reason: "Merged user-added class members into regenerated file.",
      };
    }

    const message = "Generated file contains user changes that cannot be merged safely; preserving existing file.";
    diagnostics.warning("UNMERGEABLE_USER_CHANGES", message, targetPath);
    return {
      kind: FileOperationKind.Preserve,
      mode,
      relativePath,
      sourcePath,
      targetPath,
      generatedContent: nextContent,
      reason: message,
    };
  }

  private tryMerge(context: StructuredMergeContext): string | undefined {
    const result = this.structuredMergeCoordinator.merge(context);
    if (!result.applicable) return undefined;
    if (result.merged !== undefined) return result.merged;
    diagnostics.warning(
      result.diagnosticCode ?? "CUSTOM_CODE_MERGE_SKIPPED",
      result.reason ?? "Custom code could not be merged.",
      context.relativePath,
    );
    return undefined;
  }

  private tryStructuredMerge(context: StructuredMergeContext): FileOperation | undefined {
    const result = this.structuredMergeCoordinator.merge(context);
    if (!result.applicable) return undefined;
    if (!result.merged) return this.operationForFailedStructuredMerge(context, result);
    return this.operationForMergedContent(context, result.merged, result.successReason ?? "Merged structured generated content.");
  }

  private operationForFailedStructuredMerge(
    context: StructuredMergeContext,
    result: StructuredMergeDecision,
  ): FileOperation | undefined {
    diagnostics.warning(
      result.diagnosticCode ?? "STRUCTURED_MERGE_SKIPPED",
      result.reason ?? "Structured merge could not be merged.",
      context.targetPath,
    );
    if (!result.preserveOnFailure) return undefined;
    return {
      kind: FileOperationKind.Preserve,
      mode: FileOwnershipMode.Dynamic,
      relativePath: context.relativePath,
      sourcePath: context.sourcePath,
      targetPath: context.targetPath,
      generatedContent: context.nextContent,
      reason: result.reason ?? "Structured merge could not be merged safely; preserving existing file.",
    };
  }

  private operationForMergedContent(
    context: StructuredMergeContext,
    mergedContent: string,
    reason: string,
  ): FileOperation {
    const unchanged = hashText(context.currentContent) === hashText(mergedContent);
    return {
      kind: unchanged ? FileOperationKind.Unchanged : FileOperationKind.Update,
      mode: FileOwnershipMode.Dynamic,
      relativePath: context.relativePath,
      sourcePath: context.sourcePath,
      targetPath: context.targetPath,
      content: mergedContent,
      generatedContent: mergedContent,
      reason: unchanged ? "Target file already contains merged generated content." : reason,
    };
  }
}

export default DiffDetector;
