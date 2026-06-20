// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { diagnostics } from "@/diagnostics/diagnostics";
import { GenerationRecord } from "@/types/generationRecord";
import { FileOperation, FileOperationKind, FileOwnershipMode } from "@/types/files";
import FileHandler from "@utils/files";
import { hashText } from "./fileHash";
import TypeScriptClassMemberMerger from "./typeScriptClassMemberMerger";

class DiffDetector {
  private readonly classMemberMerger = new TypeScriptClassMemberMerger();

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

    const merge = this.tryMerge(relativePath, previousGenerated, currentContent, nextContent);
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

  private tryMerge(
    relativePath: string,
    previousGenerated: string,
    currentContent: string,
    nextContent: string,
  ): string | undefined {
    if (!relativePath.endsWith(".ts")) return undefined;
    const result = this.classMemberMerger.merge(previousGenerated, currentContent, nextContent);
    if (result.merged !== undefined) return result.merged;
    diagnostics.warning("CUSTOM_CODE_MERGE_SKIPPED", result.reason ?? "Custom code could not be merged.", relativePath);
    return undefined;
  }
}

export default DiffDetector;

