// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import ts from "typescript";

import type { StructuredMergeResult } from "@/types/planner";

type JsonRecord = Record<string, unknown>;

interface ExportedObject {
  name: string;
  expression: ts.ObjectLiteralExpression;
}

const RECORD_EXPORTS = new Set([
  "STATE_INFO",
  "TRANSITION_INFO",
  "ASSERTION_INFO",
  "ACTION_HOOK_INFO",
  "STATE_LOCATORS",
  "TRANSITION_LOCATORS",
]);

class MetadataObjectMerger {
  merge(relativePath: string, currentContent: string, nextContent: string): StructuredMergeResult {
    if (relativePath.endsWith(".json")) return this.mergeJson(currentContent, nextContent);
    if (this.isMetadataModule(relativePath)) return this.mergeTypeScriptMetadata(currentContent, nextContent);
    return { applicable: false };
  }

  parseExportedRecord(content: string, exportName: string): JsonRecord | undefined {
    const sourceFile = ts.createSourceFile("metadata.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const exported = this.findExportedObjects(sourceFile).get(exportName);
    if (!exported) return undefined;
    const value = this.evaluateExpression(exported.expression);
    return this.isRecord(value) ? value : undefined;
  }

  private isMetadataModule(relativePath: string): boolean {
    return /^src\/metadata\/.+\.ts$/.test(relativePath.replace(/\\/g, "/"));
  }

  private mergeJson(currentContent: string, nextContent: string): StructuredMergeResult {
    try {
      const current = JSON.parse(currentContent) as unknown;
      const next = JSON.parse(nextContent) as unknown;
      if (!this.isRecord(current) || !this.isRecord(next)) return { applicable: false };
      return { applicable: true, merged: `${JSON.stringify(this.mergeRecord(current, next), null, 2)}\n` };
    } catch (error) {
      return { applicable: true, reason: `JSON metadata could not be merged. ${(error as Error).message}` };
    }
  }

  private mergeTypeScriptMetadata(currentContent: string, nextContent: string): StructuredMergeResult {
    const currentSource = ts.createSourceFile("current.ts", currentContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const nextSource = ts.createSourceFile("next.ts", nextContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const currentExports = this.findExportedObjects(currentSource);
    const nextExports = this.findExportedObjects(nextSource);
    if (nextExports.size === 0) return { applicable: false };

    const replacements: Array<{ start: number; end: number; text: string }> = [];
    for (const [name, nextExport] of nextExports) {
      const currentExport = currentExports.get(name);
      if (!currentExport) continue;

      const currentValue = this.evaluateExpression(currentExport.expression);
      const nextValue = this.evaluateExpression(nextExport.expression);
      if (!this.isRecord(currentValue) || !this.isRecord(nextValue)) {
        return { applicable: true, reason: `Metadata export "${name}" is not a JSON-like object.` };
      }

      const mergedValue = this.mergeExportValue(name, currentValue, nextValue);
      replacements.push({
        start: nextExport.expression.getStart(nextSource),
        end: nextExport.expression.getEnd(),
        text: this.emit(mergedValue),
      });
    }

    if (replacements.length === 0) return { applicable: true, merged: nextContent };

    let merged = nextContent;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      merged = `${merged.slice(0, replacement.start)}${replacement.text}${merged.slice(replacement.end)}`;
    }
    return { applicable: true, merged };
  }

  private mergeExportValue(name: string, current: JsonRecord, next: JsonRecord): JsonRecord {
    if (name === "ASSERTION_INFO" || name === "ACTION_HOOK_INFO") return next;
    if (RECORD_EXPORTS.has(name)) return this.mergeRecord(current, next);
    if (name === "GENERATED_REGISTRY") return this.mergeRegistry(current, next);
    if (name === "DESIGN_CLASS_INFO") return this.isOverwritable(current) ? next : current;
    return this.mergeRecord(current, next);
  }

  private mergeRegistry(current: JsonRecord, next: JsonRecord): JsonRecord {
    const merged: JsonRecord = {};
    const nextKeys = new Set(Object.keys(next));

    for (const [key, currentValue] of Object.entries(current)) {
      const nextValue = next[key];
      if (key === "assertions" || key === "actionHooks") {
        merged[key] = nextValue;
      } else if (this.isRegistryMapKey(key) && this.isRecord(currentValue) && this.isRecord(nextValue)) {
        merged[key] = this.mergeRecord(currentValue, nextValue);
      } else if (key === "designClass" && this.isRecord(currentValue) && this.isRecord(nextValue)) {
        merged[key] = this.isOverwritable(currentValue) ? nextValue : currentValue;
      } else if (nextKeys.has(key)) {
        merged[key] = this.isRecord(currentValue) && this.isOverwritable(currentValue) ? nextValue : currentValue;
      } else {
        merged[key] = currentValue;
      }
    }

    for (const [key, nextValue] of Object.entries(next)) {
      if (!(key in merged)) merged[key] = nextValue;
    }

    return merged;
  }

  private isRegistryMapKey(key: string): boolean {
    return key === "states" || key === "transitions";
  }

  private mergeRecord(current: JsonRecord, next: JsonRecord): JsonRecord {
    const merged: JsonRecord = {};
    const nextKeys = new Set(Object.keys(next));

    for (const [key, currentValue] of Object.entries(current)) {
      if (nextKeys.has(key)) {
        merged[key] = this.isRecord(currentValue) && this.isOverwritable(currentValue) ? next[key] : currentValue;
      } else {
        merged[key] = currentValue;
      }
    }

    for (const [key, nextValue] of Object.entries(next)) {
      if (!(key in merged)) merged[key] = nextValue;
    }

    return merged;
  }

  private isOverwritable(value: JsonRecord): boolean {
    return value.overwritable === true;
  }

  private findExportedObjects(sourceFile: ts.SourceFile): Map<string, ExportedObject> {
    const exports = new Map<string, ExportedObject>();

    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const expression = this.unwrapObjectExpression(declaration.initializer);
        if (expression) exports.set(declaration.name.text, { name: declaration.name.text, expression });
      }
    }

    return exports;
  }

  private unwrapObjectExpression(expression: ts.Expression): ts.ObjectLiteralExpression | undefined {
    if (ts.isObjectLiteralExpression(expression)) return expression;
    if (ts.isSatisfiesExpression(expression)) return this.unwrapObjectExpression(expression.expression);
    if (ts.isAsExpression(expression)) return this.unwrapObjectExpression(expression.expression);
    return undefined;
  }

  private evaluateExpression(expression: ts.Expression): unknown {
    if (ts.isObjectLiteralExpression(expression)) {
      const record: JsonRecord = {};
      for (const property of expression.properties) {
        if (!ts.isPropertyAssignment(property)) throw new Error("Only property assignments are supported.");
        const key = this.propertyName(property.name);
        if (key === undefined) throw new Error("Only static property names are supported.");
        record[key] = this.evaluateExpression(property.initializer);
      }
      return record;
    }

    if (ts.isArrayLiteralExpression(expression)) {
      return expression.elements.map((element) => this.evaluateExpression(element));
    }

    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isNumericLiteral(expression)) return Number(expression.text);
    if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
      const value = Number(expression.operand.text);
      return expression.operator === ts.SyntaxKind.MinusToken ? -value : value;
    }

    throw new Error(`Unsupported metadata expression: ${ts.SyntaxKind[expression.kind]}.`);
  }

  private propertyName(name: ts.PropertyName): string | undefined {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return undefined;
  }

  private emit(value: unknown, indent = 0): string {
    const spacing = " ".repeat(indent);
    const childSpacing = " ".repeat(indent + 2);

    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      return `[\n${value.map((item) => `${childSpacing}${this.emit(item, indent + 2)}`).join(",\n")}\n${spacing}]`;
    }

    const entries = Object.entries(value as JsonRecord).filter(([, entryValue]) => entryValue !== undefined);
    if (entries.length === 0) return "{}";

    return `{\n${entries
      .map(([key, entryValue]) => `${childSpacing}${this.propertyLiteral(key)}: ${this.emit(entryValue, indent + 2)}`)
      .join(",\n")}\n${spacing}}`;
  }

  private propertyLiteral(key: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

export default MetadataObjectMerger;
