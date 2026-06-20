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
