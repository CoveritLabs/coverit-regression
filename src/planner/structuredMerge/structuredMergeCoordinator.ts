// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { StructuredMergeContext, StructuredMergeDecision, StructuredMergeResult } from "@/types/planner";
import GeneratedIndexMerger from "./generatedIndexMerger";
import MetadataObjectMerger from "./metadataObjectMerger";
import TypeScriptClassMemberMerger from "./typeScriptClassMemberMerger";

interface StructuredMergeHandler {
  diagnosticCode: string;
  successReason: string;
  preserveOnFailure: boolean;
  merge(context: StructuredMergeContext): StructuredMergeResult;
}

class StructuredMergeCoordinator {
  private readonly classMemberMerger = new TypeScriptClassMemberMerger();
  private readonly metadataObjectMerger = new MetadataObjectMerger();
  private readonly generatedIndexMerger = new GeneratedIndexMerger();

  merge(context: StructuredMergeContext): StructuredMergeDecision {
    for (const handler of this.handlers()) {
      const result = handler.merge(context);
      if (!result.applicable) continue;
      return {
        ...result,
        diagnosticCode: handler.diagnosticCode,
        successReason: handler.successReason,
        preserveOnFailure: handler.preserveOnFailure,
      };
    }

    return { applicable: false };
  }

  private handlers(): StructuredMergeHandler[] {
    return [
      {
        diagnosticCode: "METADATA_MERGE_SKIPPED",
        successReason: "Merged overwritable metadata entries.",
        preserveOnFailure: true,
        merge: (context) =>
          this.metadataObjectMerger.merge(context.relativePath, context.currentContent, context.nextContent),
      },
      {
        diagnosticCode: "GENERATED_INDEX_MERGE_SKIPPED",
        successReason: "Merged preserved generated class index entries.",
        preserveOnFailure: true,
        merge: (context) =>
          this.generatedIndexMerger.merge(
            context.relativePath,
            context.targetPath,
            context.currentContent,
            context.nextContent,
          ),
      },
      {
        diagnosticCode: "CUSTOM_CODE_MERGE_SKIPPED",
        successReason: "Merged user-added class members into regenerated file.",
        preserveOnFailure: false,
        merge: (context) => this.mergeClassMembers(context),
      },
    ];
  }

  private mergeClassMembers(context: StructuredMergeContext): StructuredMergeResult {
    if (!context.previousGeneratedContent || !context.relativePath.endsWith(".ts")) return { applicable: false };
    return {
      applicable: true,
      ...this.classMemberMerger.merge(context.previousGeneratedContent, context.currentContent, context.nextContent),
    };
  }
}

export default StructuredMergeCoordinator;
