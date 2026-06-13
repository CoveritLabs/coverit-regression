// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileEntry, FileOperation, FileOwnershipMode, FileOperationKind } from "@/types/files";
import { Manifest, ManifestFileRule } from "@/types/manifest";
import { PATH_SEPARATOR } from "@constants/common";
import { PATHS } from "@constants/paths";
import FileHandler from "@utils/files";
import Matcher from "@utils/matcher";
import { GenerationRecord } from "@/types/generationRecord";
import DiffDetector from "./diffDetector";
import GenerationRecordStore from "./generationRecordStore";

class Planner {
  private templates: FileEntry[] = [];
  private features: FileEntry[] = [];
  private manifest: Manifest | null = null;
  private outputPath: string = PATHS.OUTPUT;
  private readonly diffDetector = new DiffDetector();
  private readonly generationRecordStore = new GenerationRecordStore();

  constructor() {}

  setTemplates(templates: FileEntry[]): Planner {
    this.templates = templates;
    return this;
  }

  setFeatures(features: FileEntry[]): Planner {
    this.features = features;
    return this;
  }

  setManifest(manifest: Manifest): Planner {
    this.manifest = manifest;
    return this;
  }

  setOutputPath(outputPath: string): Planner {
    this.outputPath = outputPath;
    return this;
  }

  plan(): FileOperation[] {
    const operations: FileOperation[] = [];
    const generationRecord = this.generationRecordStore.load(this.outputPath);
    operations.push(...this.createOperations(this.templates, generationRecord, FileOwnershipMode.Static, this.outputPath));
    operations.push(
      ...this.createOperations(
        this.features,
        generationRecord,
        FileOwnershipMode.INPUT,
        FileHandler.join(this.outputPath, "features"),
      ),
    );
    return operations;
  }

  private createOperations(
    files: FileEntry[],
    generationRecord: GenerationRecord,
    defaultMode: FileOwnershipMode = FileOwnershipMode.Static,
    rootPath: string = this.outputPath,
  ): FileOperation[] {
    const operations: FileOperation[] = [];
    for (const file of files) {
      const rule = this.findMatchingRule(file.relativePath);
      const mode = rule ? rule.mode : defaultMode;
      const targetPath = this.getTargetPath(file.relativePath, rootPath);
      const operation = this.createOperation(file.absolutePath, targetPath, file.relativePath, mode, generationRecord);
      operations.push(operation);
    }

    return operations;
  }

  private getTargetPath(relativePath: string, rootPath: string = this.outputPath): string {
    return FileHandler.join(rootPath, ...relativePath.split(PATH_SEPARATOR));
  }

  private findMatchingRule(relativePath: string): ManifestFileRule {
    return this.manifest?.files.find((rule) => Matcher.matches(rule.path, relativePath))!;
  }

  private createOperation(
    sourcePath: string,
    targetPath: string,
    relativePath: string,
    mode: FileOwnershipMode,
    generationRecord: GenerationRecord,
  ): FileOperation {
    if (mode === FileOwnershipMode.Dynamic) {
      return this.diffDetector.detect(relativePath, sourcePath, targetPath, mode, generationRecord);
    }

    const targetExists = FileHandler.exists(targetPath);

    if (!targetExists) {
      return {
        kind: FileOperationKind.Create,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        reason: "Target file does not exist.",
      };
    }

    if (mode === FileOwnershipMode.UserExtension) {
      return {
        kind: FileOperationKind.Preserve,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        reason: "User extension file already exists and is preserved.",
      };
    }

    const source = FileHandler.readFile(sourcePath);
    const target = FileHandler.readFile(targetPath);
    if (Buffer.from(source).equals(Buffer.from(target))) {
      return {
        kind: FileOperationKind.Unchanged,
        mode,
        relativePath,
        sourcePath,
        targetPath,
        generatedContent: source,
        reason: "Target file already exists and is unchanged.",
      };
    }

    return {
      kind: FileOperationKind.Update,
      mode,
      relativePath,
      sourcePath,
      targetPath,
      generatedContent: source,
      reason: "Target file exists and will be updated.",
    };
  }
}

export default Planner;
