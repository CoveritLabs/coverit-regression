// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { FeatureScenarioBlock, ParsedFeatureFile } from "@/types/feature";
import type { FileEntry } from "@/types/files";
import FileHandler from "@utils/files";

interface GeneratedScenario {
  document: ParsedFeatureFile;
  scenario: FeatureScenarioBlock;
}

interface ExistingFlowLocation {
  document: ParsedFeatureFile;
  scenario: FeatureScenarioBlock;
}

interface TargetFeaturePlan {
  relativePath: string;
  baseDocument?: ParsedFeatureFile;
  generatedDocument?: ParsedFeatureFile;
  generatedScenarios: GeneratedScenario[];
}

const SCENARIO_PATTERN = /^\s*Scenario(?: Outline)?:\s*(.+)$/;
const FLOW_ID_PATTERN = /^\s*#\s*(?:Flow|Test\s*Flow|Testflow)\s*ID:\s*(.+?)\s*$/i;

class FeatureFilePatcher {
  patch(inputFeatures: FileEntry[], outputFeaturesPath: string): FileEntry[] {
    const generatedDocuments = inputFeatures.map((feature) => this.parseFeatureFile(feature));
    const existingDocuments = this.scanExistingFeatures(outputFeaturesPath);
    const existingByRelativePath = new Map(existingDocuments.map((document) => [document.relativePath, document]));
    const existingByFlowId = this.indexExistingFlowIds(existingDocuments);
    const generatedFlowIds = new Map<string, string>();
    const targets = new Map<string, TargetFeaturePlan>();

    for (const generatedDocument of generatedDocuments) {
      for (const scenario of generatedDocument.scenarios) {
        if (scenario.flowId) {
          const previousSource = generatedFlowIds.get(scenario.flowId);
          if (previousSource) {
            throw new Error(
              `[Feature patcher] Duplicate generated Flow ID "${scenario.flowId}" in ${previousSource} and ${generatedDocument.relativePath}.`,
            );
          }
          generatedFlowIds.set(scenario.flowId, generatedDocument.relativePath);
        }

        const existingLocation = scenario.flowId ? existingByFlowId.get(scenario.flowId) : undefined;
        const targetRelativePath = existingLocation?.document.relativePath ?? generatedDocument.relativePath;
        const target = this.getTarget(targets, targetRelativePath, existingByRelativePath, generatedDocument);
        target.generatedScenarios.push({ document: generatedDocument, scenario });
      }
    }

    return [...targets.values()]
      .map((target) => this.renderTarget(target))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private scanExistingFeatures(outputFeaturesPath: string): ParsedFeatureFile[] {
    if (!FileHandler.isDirectory(outputFeaturesPath)) return [];
    return FileHandler.filterByExtension(FileHandler.scanDirectory(outputFeaturesPath), ".feature").map((feature) =>
      this.parseFeatureFile(feature),
    );
  }

  private indexExistingFlowIds(documents: ParsedFeatureFile[]): Map<string, ExistingFlowLocation> {
    const index = new Map<string, ExistingFlowLocation>();

    for (const document of documents) {
      for (const scenario of document.scenarios) {
        if (!scenario.flowId) continue;
        const previous = index.get(scenario.flowId);
        if (previous) {
          throw new Error(
            `[Feature patcher] Duplicate existing Flow ID "${scenario.flowId}" in ${previous.document.relativePath} and ${document.relativePath}.`,
          );
        }
        index.set(scenario.flowId, { document, scenario });
      }
    }

    return index;
  }

  private getTarget(
    targets: Map<string, TargetFeaturePlan>,
    relativePath: string,
    existingByRelativePath: Map<string, ParsedFeatureFile>,
    generatedDocument: ParsedFeatureFile,
  ): TargetFeaturePlan {
    const existing = targets.get(relativePath);
    if (existing) {
      if (!existing.generatedDocument) existing.generatedDocument = generatedDocument;
      return existing;
    }

    const target = {
      relativePath,
      baseDocument: existingByRelativePath.get(relativePath),
      generatedDocument,
      generatedScenarios: [],
    };
    targets.set(relativePath, target);
    return target;
  }

  private renderTarget(target: TargetFeaturePlan): FileEntry {
    const replacementsByFlowId = new Map<string, GeneratedScenario>();
    const usedGeneratedScenarios = new Set<GeneratedScenario>();

    for (const generated of target.generatedScenarios) {
      if (generated.scenario.flowId) replacementsByFlowId.set(generated.scenario.flowId, generated);
    }

    const scenarios: FeatureScenarioBlock[] = [];
    if (target.baseDocument) {
      for (const existingScenario of target.baseDocument.scenarios) {
        const replacement = existingScenario.flowId ? replacementsByFlowId.get(existingScenario.flowId) : undefined;
        if (replacement) {
          scenarios.push(replacement.scenario);
          usedGeneratedScenarios.add(replacement);
        } else {
          scenarios.push(existingScenario);
        }
      }
    }

    for (const generated of target.generatedScenarios) {
      if (usedGeneratedScenarios.has(generated)) continue;
      scenarios.push(generated.scenario);
    }

    const sourceDocument = target.generatedScenarios[0]?.document ?? target.generatedDocument;
    const preamble = target.baseDocument?.preamble ?? target.generatedDocument?.preamble ?? "Feature: Generated";
    return {
      relativePath: target.relativePath,
      absolutePath: sourceDocument?.absolutePath ?? target.relativePath,
      content: this.renderFeature(preamble, scenarios),
    };
  }

  private parseFeatureFile(feature: FileEntry): ParsedFeatureFile {
    const raw = feature.content ?? FileHandler.readFile(feature.absolutePath);
    const lines = this.splitLines(raw);
    const scenarioLines = this.findScenarioLines(lines);
    const blockStarts = scenarioLines.map((lineIndex) => this.findScenarioBlockStart(lines, lineIndex));
    const preambleLines = this.trimTrailingBlankLines(lines.slice(0, blockStarts[0] ?? lines.length));
    const scenarios = scenarioLines.map((lineIndex, index) => {
      const start = blockStarts[index];
      const end = blockStarts[index + 1] ?? lines.length;
      const blockLines = this.trimTrailingBlankLines(lines.slice(start, end));
      const scenarioName = lines[lineIndex].match(SCENARIO_PATTERN)?.[1]?.trim() ?? "";
      return {
        name: scenarioName,
        flowId: this.extractFlowId(blockLines),
        text: blockLines.join("\n").trimEnd(),
      };
    });

    return {
      ...feature,
      content: raw,
      preamble: preambleLines.join("\n").trimEnd(),
      scenarios,
    };
  }

  private splitLines(content: string): string[] {
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  private findScenarioLines(lines: string[]): number[] {
    const scenarioLines: number[] = [];
    for (const [index, line] of lines.entries()) {
      if (SCENARIO_PATTERN.test(line)) scenarioLines.push(index);
    }
    return scenarioLines;
  }

  private findScenarioBlockStart(lines: string[], scenarioLineIndex: number): number {
    let start = scenarioLineIndex;
    while (start > 0) {
      const previous = lines[start - 1].trim();
      if (!previous) break;
      if (!previous.startsWith("@") && !previous.startsWith("#")) break;
      start -= 1;
    }
    return start;
  }

  private extractFlowId(lines: string[]): string | undefined {
    for (const line of lines) {
      const match = line.match(FLOW_ID_PATTERN);
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return undefined;
  }

  private renderFeature(preamble: string, scenarios: FeatureScenarioBlock[]): string {
    return [preamble.trimEnd(), ...scenarios.map((scenario) => scenario.text.trimEnd()).filter(Boolean)]
      .filter(Boolean)
      .join("\n\n")
      .concat("\n");
  }

  private trimTrailingBlankLines(lines: string[]): string[] {
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === "") end -= 1;
    return lines.slice(0, end);
  }
}

export default FeatureFilePatcher;
