// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";

import type { StructuredMergeResult } from "@/types/planner";
import FileHandler from "@utils/files";
import MetadataObjectMerger from "./metadataObjectMerger";

interface IndexEntry {
  id: string;
  className: string;
}

interface IndexConfig {
  baseClassName: string;
  baseImportPath: string;
  classImportRoot: string;
  factoryName: string;
  metadataPath: string;
  metadataExportName: string;
}

const INDEX_CONFIGS: Record<string, IndexConfig> = {
  "src/states/generated/index.ts": {
    baseClassName: "BaseGeneratedState",
    baseImportPath: "@/states/generated/BaseGeneratedState",
    classImportRoot: "@/states/generated",
    factoryName: "generatedStateFactories",
    metadataPath: path.join("src", "metadata", "states.ts"),
    metadataExportName: "STATE_INFO",
  },
  "src/transitions/generated/index.ts": {
    baseClassName: "BaseGeneratedTransition",
    baseImportPath: "@/transitions/generated/BaseGeneratedTransition",
    classImportRoot: "@/transitions/generated",
    factoryName: "generatedTransitionFactories",
    metadataPath: path.join("src", "metadata", "transitions.ts"),
    metadataExportName: "TRANSITION_INFO",
  },
};

class GeneratedIndexMerger {
  private readonly metadataMerger = new MetadataObjectMerger();

  merge(relativePath: string, targetPath: string, currentContent: string, nextContent: string): StructuredMergeResult {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const config = INDEX_CONFIGS[normalizedPath];
    if (!config) return { applicable: false };

    const currentEntries = this.parseEntries(currentContent);
    const nextEntries = this.parseEntries(nextContent);
    if (nextEntries.length === 0) return { applicable: true, reason: "Generated index has no factory entries." };

    const metadata = this.readCurrentMetadata(targetPath, config);
    const merged = this.mergeEntries(currentEntries, nextEntries, targetPath, metadata);
    return { applicable: true, merged: this.renderIndex(config, merged) };
  }

  private mergeEntries(
    currentEntries: IndexEntry[],
    nextEntries: IndexEntry[],
    targetPath: string,
    metadata: Record<string, unknown> | undefined,
  ): IndexEntry[] {
    const nextById = new Map(nextEntries.map((entry) => [entry.id, entry]));
    const merged: IndexEntry[] = [];
    const usedIds = new Set<string>();

    for (const current of currentEntries) {
      const next = nextById.get(current.id);
      if (next && this.isCurrentMetadataOverwritable(metadata, current.id)) {
        merged.push(next);
        usedIds.add(next.id);
        continue;
      }

      if (this.classFileExists(targetPath, current.className)) {
        merged.push(current);
        usedIds.add(current.id);
        continue;
      }

      if (next) {
        merged.push(next);
        usedIds.add(next.id);
      }
    }

    for (const next of nextEntries) {
      if (!usedIds.has(next.id)) merged.push(next);
    }

    return merged;
  }

  private isCurrentMetadataOverwritable(metadata: Record<string, unknown> | undefined, id: string): boolean {
    if (!metadata) return true;
    const entry = metadata[id];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    return (entry as { overwritable?: unknown }).overwritable === true;
  }

  private classFileExists(targetPath: string, className: string): boolean {
    return FileHandler.exists(path.join(path.dirname(targetPath), `${className}.ts`));
  }

  private readCurrentMetadata(targetPath: string, config: IndexConfig): Record<string, unknown> | undefined {
    const outputRoot = path.resolve(path.dirname(targetPath), "..", "..", "..");
    const metadataPath = path.join(outputRoot, config.metadataPath);
    if (!FileHandler.exists(metadataPath)) return undefined;
    return this.metadataMerger.parseExportedRecord(FileHandler.readFile(metadataPath), config.metadataExportName);
  }

  private parseEntries(content: string): IndexEntry[] {
    const entries: IndexEntry[] = [];
    const entryPattern = /["']([^"']+)["']\s*:\s*\(\)\s*=>\s*new\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\)/g;
    for (const match of content.matchAll(entryPattern)) {
      entries.push({ id: match[1], className: match[2] });
    }
    return entries;
  }

  private renderIndex(config: IndexConfig, entries: IndexEntry[]): string {
    const uniqueEntries = [...new Map(entries.map((entry) => [entry.id, entry])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const uniqueClassNames = [...new Set(uniqueEntries.map((entry) => entry.className))].sort((a, b) =>
      a.localeCompare(b),
    );

    return [
      `import { ${config.baseClassName} } from "${config.baseImportPath}";`,
      ...uniqueClassNames.map((className) => `import { ${className} } from "${config.classImportRoot}/${className}";`),
      "",
      `export const ${config.factoryName}: Record<string, () => ${config.baseClassName}> = {`,
      ...uniqueEntries.map((entry) => `  ${JSON.stringify(entry.id)}: () => new ${entry.className}(),`),
      "};",
      "",
      `export { ${config.baseClassName} } from "${config.baseImportPath}";`,
      ...uniqueClassNames.map((className) => `export { ${className} } from "${config.classImportRoot}/${className}";`),
      "",
    ].join("\n");
  }
}

export default GeneratedIndexMerger;
