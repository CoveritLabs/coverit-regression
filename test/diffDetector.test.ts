// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { diagnostics } from "@/diagnostics/diagnostics";
import { GenerationRecord } from "@/types/generationRecord";
import { FileOperationKind, FileOwnershipMode, type FileOperation } from "@/types/files";
import DiffDetector from "@planner/diffDetector";
import GenerationRecordStore from "@planner/generationRecordStore";
import { hashText } from "@planner/fileHash";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coverit-diff-"));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function generated(version: string): string {
  return [
    'import { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
    "",
    "export class HomePageState extends BaseGeneratedState {",
    "  constructor() {",
    `    super("${version}");`,
    "  }",
    "}",
    "",
  ].join("\n");
}

function withCustomMember(source: string): string {
  return source.replace("\n}", '\n\n  customLabel(): string {\n    return "mine";\n  }\n}');
}

function recordFor(relativePath: string, content: string): GenerationRecord {
  return {
    version: 1,
    files: {
      [relativePath]: {
        hash: hashText(content),
        mode: FileOwnershipMode.Dynamic,
      },
    },
    snapshots: {
      [relativePath]: content,
    },
  };
}

test("DiffDetector creates missing dynamic target", () => {
  diagnostics.clear();
  const root = createTempDir();
  const sourcePath = path.join(root, "source.ts");
  const targetPath = path.join(root, "target.ts");
  writeFile(sourcePath, generated("v1"));

  const operation = new DiffDetector().detect(
    "src/states/generated/HomePageState.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    { version: 1, files: {}, snapshots: {} },
  );

  assert.equal(operation.kind, FileOperationKind.Create);
  assert.equal(operation.generatedContent, generated("v1"));
});

test("DiffDetector reports unchanged when current target equals next generated content", () => {
  diagnostics.clear();
  const root = createTempDir();
  const sourcePath = path.join(root, "source.ts");
  const targetPath = path.join(root, "target.ts");
  writeFile(sourcePath, generated("v1"));
  writeFile(targetPath, generated("v1"));

  const operation = new DiffDetector().detect(
    "src/states/generated/HomePageState.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    recordFor("src/states/generated/HomePageState.ts", generated("v1")),
  );

  assert.equal(operation.kind, FileOperationKind.Unchanged);
});

test("DiffDetector updates generated files when no user edits exist", () => {
  diagnostics.clear();
  const root = createTempDir();
  const sourcePath = path.join(root, "source.ts");
  const targetPath = path.join(root, "target.ts");
  writeFile(sourcePath, generated("v2"));
  writeFile(targetPath, generated("v1"));

  const operation = new DiffDetector().detect(
    "src/states/generated/HomePageState.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    recordFor("src/states/generated/HomePageState.ts", generated("v1")),
  );

  assert.equal(operation.kind, FileOperationKind.Update);
  assert.equal(operation.content, undefined);
});

test("DiffDetector merges user-added class members into next generated output", () => {
  diagnostics.clear();
  const root = createTempDir();
  const sourcePath = path.join(root, "source.ts");
  const targetPath = path.join(root, "target.ts");
  const previous = generated("v1");
  const current = withCustomMember(previous);
  writeFile(sourcePath, generated("v2"));
  writeFile(targetPath, current);

  const operation = new DiffDetector().detect(
    "src/states/generated/HomePageState.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    recordFor("src/states/generated/HomePageState.ts", previous),
  );

  assert.equal(operation.kind, FileOperationKind.Update);
  assert.match(operation.content ?? "", /super\("v2"\)/);
  assert.match(operation.content ?? "", /customLabel/);
});

test("DiffDetector preserves current file when generated member was edited by the user", () => {
  diagnostics.clear();
  const root = createTempDir();
  const sourcePath = path.join(root, "source.ts");
  const targetPath = path.join(root, "target.ts");
  const previous = generated("v1");
  const edited = previous.replace('super("v1")', 'super("user-edit")');
  writeFile(sourcePath, generated("v2"));
  writeFile(targetPath, edited);

  const operation = new DiffDetector().detect(
    "src/states/generated/HomePageState.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    recordFor("src/states/generated/HomePageState.ts", previous),
  );

  assert.equal(operation.kind, FileOperationKind.Preserve);
  assert.equal(diagnostics.all().some((diagnostic) => diagnostic.code === "UNMERGEABLE_USER_CHANGES"), true);
});

test("GenerationRecordStore saves generated snapshots under .coverit", () => {
  const root = createTempDir();
  const targetPath = path.join(root, "src", "states", "generated", "HomePageState.ts");
  const generatedContent = generated("v1");
  writeFile(targetPath, generatedContent);

  const operation: FileOperation = {
    kind: FileOperationKind.Create,
    mode: FileOwnershipMode.Dynamic,
    relativePath: "src/states/generated/HomePageState.ts",
    sourcePath: targetPath,
    targetPath,
    generatedContent,
    reason: "test",
  };

  const store = new GenerationRecordStore();
  store.save(root, [operation]);
  const reloaded = store.load(root);

  assert.equal(fs.existsSync(path.join(root, ".coverit", "generation-record.json")), true);
  assert.equal(reloaded.snapshots["src/states/generated/HomePageState.ts"], generatedContent);
  assert.equal(reloaded.files["src/states/generated/HomePageState.ts"].hash, hashText(generatedContent));
});

test("DiffDetector merges metadata TS exports by overwritable entries", () => {
  diagnostics.clear();
  const root = createTempDir();
  const sourcePath = path.join(root, "source", "states.ts");
  const targetPath = path.join(root, "output", "src", "metadata", "states.ts");
  const current = [
    'import { StateInfo } from "@/types";',
    "",
    "export const STATE_INFO = {",
    "  S_CURRENT_ONLY: {",
    '    className: "CurrentOnlyState",',
    '    id: "S_CURRENT_ONLY",',
    '    label: "Current only",',
    '    url: "/"',
    "  },",
    "  S_LOCKED: {",
    '    className: "LockedState",',
    '    id: "S_LOCKED",',
    '    label: "Locked",',
    '    url: "/locked"',
    "  },",
    "  S_OPEN: {",
    '    className: "OldOpenState",',
    '    id: "S_OPEN",',
    '    label: "Old open",',
    "    overwritable: true,",
    '    url: "/old"',
    "  }",
    "} satisfies Record<string, StateInfo>;",
    "",
  ].join("\n");
  const next = [
    'import { StateInfo } from "@/types";',
    "",
    "export const STATE_INFO = {",
    "  S_LOCKED: {",
    '    className: "NewLockedState",',
    '    id: "S_LOCKED",',
    '    label: "New locked",',
    "    overwritable: true,",
    '    url: "/new-locked"',
    "  },",
    "  S_NEW: {",
    '    className: "NewState",',
    '    id: "S_NEW",',
    '    label: "New",',
    "    overwritable: true,",
    '    url: "/new"',
    "  },",
    "  S_OPEN: {",
    '    className: "NewOpenState",',
    '    id: "S_OPEN",',
    '    label: "New open",',
    "    overwritable: true,",
    '    url: "/new-open"',
    "  }",
    "} satisfies Record<string, StateInfo>;",
    "",
  ].join("\n");
  writeFile(sourcePath, next);
  writeFile(targetPath, current);

  const operation = new DiffDetector().detect(
    "src/metadata/states.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    { version: 1, files: {}, snapshots: {} },
  );

  assert.equal(operation.kind, FileOperationKind.Update);
  assert.match(operation.content ?? "", /S_CURRENT_ONLY/);
  assert.match(operation.content ?? "", /NewOpenState/);
  assert.match(operation.content ?? "", /NewState/);
  assert.doesNotMatch(operation.content ?? "", /NewLockedState/);
  assert.equal(operation.generatedContent, operation.content);

  new GenerationRecordStore().save(root, [operation]);
  assert.equal(new GenerationRecordStore().load(root).snapshots["src/metadata/states.ts"], operation.content);
});

test("DiffDetector merges dynamic JSON object entries by overwritable flag", () => {
  const root = createTempDir();
  const sourcePath = path.join(root, "source.json");
  const targetPath = path.join(root, "target.json");
  writeFile(
    sourcePath,
    JSON.stringify(
      {
        locked: { value: "new", overwritable: true },
        nextOnly: { value: "new", overwritable: true },
        open: { value: "new", overwritable: true },
      },
      null,
      2,
    ),
  );
  writeFile(
    targetPath,
    JSON.stringify(
      {
        currentOnly: { value: "current" },
        locked: { value: "current" },
        open: { value: "current", overwritable: true },
      },
      null,
      2,
    ),
  );

  const operation = new DiffDetector().detect(
    "src/metadata/custom.json",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    { version: 1, files: {}, snapshots: {} },
  );
  const merged = JSON.parse(operation.content ?? "{}") as Record<string, { value: string }>;

  assert.equal(merged.currentOnly.value, "current");
  assert.equal(merged.locked.value, "current");
  assert.equal(merged.open.value, "new");
  assert.equal(merged.nextOnly.value, "new");
  assert.equal(operation.generatedContent, operation.content);
});

test("DiffDetector preserves generated index entries when protected metadata class files still exist", () => {
  const root = createTempDir();
  const outputRoot = path.join(root, "output");
  const sourcePath = path.join(root, "source", "index.ts");
  const targetPath = path.join(outputRoot, "src", "states", "generated", "index.ts");
  writeFile(path.join(outputRoot, "src", "states", "generated", "ProtectedState.ts"), "export class ProtectedState {}\n");
  writeFile(path.join(outputRoot, "src", "states", "generated", "ReplaceState.ts"), "export class ReplaceState {}\n");
  writeFile(
    path.join(outputRoot, "src", "metadata", "states.ts"),
    [
      "export const STATE_INFO = {",
      "  S_PROTECTED: { className: \"ProtectedState\", id: \"S_PROTECTED\" },",
      "  S_REPLACE: { className: \"ReplaceState\", id: \"S_REPLACE\", overwritable: true }",
      "} satisfies Record<string, unknown>;",
      "",
    ].join("\n"),
  );
  writeFile(
    targetPath,
    [
      'import { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
      'import { ProtectedState } from "@/states/generated/ProtectedState";',
      'import { ReplaceState } from "@/states/generated/ReplaceState";',
      "",
      "export const generatedStateFactories: Record<string, () => BaseGeneratedState> = {",
      '  "S_PROTECTED": () => new ProtectedState(),',
      '  "S_REPLACE": () => new ReplaceState(),',
      "};",
      "",
      'export { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
      'export { ProtectedState } from "@/states/generated/ProtectedState";',
      'export { ReplaceState } from "@/states/generated/ReplaceState";',
      "",
    ].join("\n"),
  );
  writeFile(
    sourcePath,
    [
      'import { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
      'import { NewProtectedState } from "@/states/generated/NewProtectedState";',
      'import { NewReplaceState } from "@/states/generated/NewReplaceState";',
      'import { NewState } from "@/states/generated/NewState";',
      "",
      "export const generatedStateFactories: Record<string, () => BaseGeneratedState> = {",
      '  "S_NEW": () => new NewState(),',
      '  "S_PROTECTED": () => new NewProtectedState(),',
      '  "S_REPLACE": () => new NewReplaceState(),',
      "};",
      "",
      'export { BaseGeneratedState } from "@/states/generated/BaseGeneratedState";',
      'export { NewProtectedState } from "@/states/generated/NewProtectedState";',
      'export { NewReplaceState } from "@/states/generated/NewReplaceState";',
      'export { NewState } from "@/states/generated/NewState";',
      "",
    ].join("\n"),
  );

  const operation = new DiffDetector().detect(
    "src/states/generated/index.ts",
    sourcePath,
    targetPath,
    FileOwnershipMode.Dynamic,
    { version: 1, files: {}, snapshots: {} },
  );

  assert.match(operation.content ?? "", /"S_PROTECTED": \(\) => new ProtectedState\(\)/);
  assert.match(operation.content ?? "", /"S_REPLACE": \(\) => new NewReplaceState\(\)/);
  assert.match(operation.content ?? "", /"S_NEW": \(\) => new NewState\(\)/);
});
