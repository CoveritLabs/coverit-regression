// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileEntry, FileOperation, FileOwnershipMode, FileOperationKind } from "@/types/files";
import { Manifest, ManifestFileRule } from "@/types/manifest";
import { PATH_SEPARATOR } from "@constants/common";
import { PATHS } from "@constants/paths";
import FileHandler from "@utils/files";
import Matcher from "@utils/matcher";

class Planner {
  private templates: FileEntry[] = [];
  private features: FileEntry[] = [];
  private manifest: Manifest | null = null;

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

  plan(): FileOperation[] {
    const operations: FileOperation[] = [];
    operations.push(...this.createOperations(this.templates));
    operations.push(
      ...this.createOperations(this.features, FileOwnershipMode.INPUT, FileHandler.join(PATHS.OUTPUT, "features")),
    );
    return operations;
  }

  private createOperations(
    files: FileEntry[],
    defaultMode: FileOwnershipMode = FileOwnershipMode.Static,
    rootPath: string = PATHS.OUTPUT,
  ): FileOperation[] {
    const operations: FileOperation[] = [];
    for (const file of files) {
      const rule = this.findMatchingRule(file.relativePath);
      const mode = rule ? rule.mode : defaultMode;
      const targetPath = this.getTargetPath(file.relativePath, rootPath);
      const operation = this.createOperation(file.absolutePath, targetPath, file.relativePath, mode);
      operations.push(operation);
    }

    return operations;
  }

  private getTargetPath(relativePath: string, rootPath: string = PATHS.OUTPUT): string {
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
  ): FileOperation {
    const targetExists = FileHandler.exists(targetPath);

    if (!targetExists) {
      return {
        kind: FileOperationKind.Create,
        mode,
        sourcePath,
        targetPath,
        reason: "Target file does not exist.",
      };
    }

    if (mode === FileOwnershipMode.UserExtension) {
      return {
        kind: FileOperationKind.Preserve,
        mode,
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
        sourcePath,
        targetPath,
        reason: "Target file already exists and is unchanged.",
      };
    }

    return {
      kind: FileOperationKind.Update,
      mode,
      sourcePath,
      targetPath,
      reason: "Target file exists and will be updated.",
    };
  }
}

export default Planner;
