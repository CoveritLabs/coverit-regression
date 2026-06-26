// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import StructuredMergeCoordinator from "@planner/structuredMerge/structuredMergeCoordinator";
import type { StructuredMergeContext } from "@/types/planner";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coverit-structured-merge-"));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function context(overrides: Partial<StructuredMergeContext>): StructuredMergeContext {
  return {
    relativePath: "src/generated/example.ts",
    sourcePath: "source.ts",
    targetPath: "target.ts",
    currentContent: "",
    nextContent: "",
    ...overrides,
  };
}

test("StructuredMergeCoordinator applies metadata merge before class member merge", () => {
  const currentContent = [
    "export const STATE_INFO = {",
    '  S_HOME: { className: "CurrentHomeState", id: "S_HOME", label: "Home", overwritable: true, url: "/" }',
    "} satisfies Record<string, unknown>;",
    "",
  ].join("\n");
  const nextContent = [
    "export const STATE_INFO = {",
    '  S_HOME: { className: "NextHomeState", id: "S_HOME", label: "Home", overwritable: true, url: "/" }',
    "} satisfies Record<string, unknown>;",
    "",
  ].join("\n");

  const result = new StructuredMergeCoordinator().merge(
    context({
      relativePath: "src/metadata/states.ts",
      currentContent,
      nextContent,
      previousGeneratedContent: currentContent,
    }),
  );

  assert.equal(result.applicable, true);
  assert.equal(result.successReason, "Merged overwritable metadata entries.");
  assert.match(result.merged ?? "", /NextHomeState/);
});

test("StructuredMergeCoordinator keeps generated index preservation centralized", () => {
  const root = createTempDir();
  const outputRoot = path.join(root, "output");
  const targetPath = path.join(outputRoot, "src", "states", "generated", "index.ts");
  writeFile(path.join(outputRoot, "src", "states", "generated", "ProtectedState.ts"), "export class ProtectedState {}\n");
  writeFile(
    path.join(outputRoot, "src", "metadata", "states.ts"),
    [
      "export const STATE_INFO = {",
      '  S_PROTECTED: { className: "ProtectedState", id: "S_PROTECTED" }',
      "} satisfies Record<string, unknown>;",
      "",
    ].join("\n"),
  );

  const currentContent = [
    'import { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
    'import { ProtectedState } from "@/states/generated/ProtectedState";',
    "",
    "export const generatedStateFactories: Record<string, () => BaseGeneratedState> = {",
    '  "S_PROTECTED": () => new ProtectedState(),',
    "};",
    "",
    'export { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
    'export { ProtectedState } from "@/states/generated/ProtectedState";',
    "",
  ].join("\n");
  const nextContent = [
    'import { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
    'import { NextProtectedState } from "@/states/generated/NextProtectedState";',
    'import { NewState } from "@/states/generated/NewState";',
    "",
    "export const generatedStateFactories: Record<string, () => BaseGeneratedState> = {",
    '  "S_NEW": () => new NewState(),',
    '  "S_PROTECTED": () => new NextProtectedState(),',
    "};",
    "",
    'export { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
    'export { NextProtectedState } from "@/states/generated/NextProtectedState";',
    'export { NewState } from "@/states/generated/NewState";',
    "",
  ].join("\n");

  const result = new StructuredMergeCoordinator().merge(
    context({
      relativePath: "src/states/generated/index.ts",
      targetPath,
      currentContent,
      nextContent,
    }),
  );

  assert.equal(result.successReason, "Merged preserved generated class index entries.");
  assert.match(result.merged ?? "", /"S_PROTECTED": \(\) => new ProtectedState\(\)/);
  assert.match(result.merged ?? "", /"S_NEW": \(\) => new NewState\(\)/);
});

test("StructuredMergeCoordinator routes class member preservation through the shared merge boundary", () => {
  const previousGeneratedContent = [
    "export class Example {",
    "  generated(): string {",
    '    return "v1";',
    "  }",
    "}",
    "",
  ].join("\n");
  const currentContent = [
    "export class Example {",
    "  generated(): string {",
    '    return "v1";',
    "  }",
    "",
    "  custom(): string {",
    '    return "mine";',
    "  }",
    "}",
    "",
  ].join("\n");
  const nextContent = [
    "export class Example {",
    "  generated(): string {",
    '    return "v2";',
    "  }",
    "}",
    "",
  ].join("\n");

  const result = new StructuredMergeCoordinator().merge(
    context({
      currentContent,
      nextContent,
      previousGeneratedContent,
    }),
  );

  assert.equal(result.successReason, "Merged user-added class members into regenerated file.");
  assert.match(result.merged ?? "", /return "v2"/);
  assert.match(result.merged ?? "", /custom\(\): string/);
});
