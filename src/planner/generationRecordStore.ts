// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { GenerationRecord } from "@/types/generationRecord";
import { FileOperation, FileOperationKind, FileOwnershipMode } from "@/types/files";
import FileHandler from "@utils/files";
import { hashText } from "./fileHash";

const RECORD_DIR = ".coverit";
const RECORD_FILE = "generation-record.json";

class GenerationRecordStore {
  load(outputPath: string): GenerationRecord {
    const recordPath = this.recordPath(outputPath);
    if (!FileHandler.exists(recordPath)) return this.emptyRecord();

    try {
      const parsed = JSON.parse(FileHandler.readFile(recordPath)) as GenerationRecord;
      return {
        version: 1,
        files: parsed.files ?? {},
        snapshots: parsed.snapshots ?? {},
      };
    } catch {
      return this.emptyRecord();
    }
  }

  save(outputPath: string, operations: FileOperation[]): void {
    const next = this.load(outputPath);

    for (const operation of operations) {
      if (!operation.relativePath || !this.shouldRecord(operation.mode)) continue;
      if (
        operation.kind !== FileOperationKind.Create &&
        operation.kind !== FileOperationKind.Update &&
        operation.kind !== FileOperationKind.Unchanged
      ) {
        continue;
      }

      const generatedContent = operation.generatedContent ?? operation.content ?? FileHandler.readFile(operation.targetPath);
      const currentContent = FileHandler.exists(operation.targetPath)
        ? FileHandler.readFile(operation.targetPath)
        : generatedContent;
      next.files[operation.relativePath] = {
        hash: hashText(currentContent),
        mode: operation.mode,
      };
      next.snapshots[operation.relativePath] = generatedContent;
    }

    FileHandler.writeFile(this.recordPath(outputPath), `${JSON.stringify(next, null, 2)}\n`);
  }

  recordPath(outputPath: string): string {
    return FileHandler.join(outputPath, RECORD_DIR, RECORD_FILE);
  }

  private emptyRecord(): GenerationRecord {
    return { version: 1, files: {}, snapshots: {} };
  }

  private shouldRecord(mode: FileOwnershipMode): boolean {
    return mode === FileOwnershipMode.Dynamic;
  }
}

export default GenerationRecordStore;

