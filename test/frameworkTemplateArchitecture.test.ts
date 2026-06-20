// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readTemplate(relativePath: string): string {
  return fs.readFileSync(path.join(root, "templates", relativePath), "utf8");
}

function listTemplateFiles(relativePath: string): string[] {
  const absolutePath = path.join(root, "templates", relativePath);
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return listTemplateFiles(childPath);
    return childPath.replace(/\\/g, "/");
  });
}

test("BDD runtime template stores design class as scenario context instead of a step", () => {
  const parser = readTemplate("src/bdd/bddParser.ts.ejs");
  const types = readTemplate("src/types/bdd.ts.ejs");

  assert.match(parser, /currentScenario\.designClassId = designClassId/);
  assert.doesNotMatch(types, /DESIGN_CLASS/);
  assert.doesNotMatch(parser, /type:\s*"DESIGN_CLASS"/);
});

test("runtime templates keep contracts in src/types and constants in src/constants", () => {
  const templatePaths = listTemplateFiles("src");

  assert.deepEqual(
    templatePaths.filter((templatePath) => templatePath.endsWith("/types.ts.ejs")),
    [],
  );
  assert.deepEqual(
    templatePaths.filter((templatePath) => templatePath.endsWith("/models.ts.ejs")),
    [],
  );

  for (const templatePath of templatePaths) {
    if (templatePath.startsWith("src/types/")) continue;
    const source = readTemplate(templatePath);
    assert.doesNotMatch(source, /export\s+(interface|type)\s+/, `${templatePath} should import contracts from src/types`);
  }
});

test("BDD runtime template consumes centralized constants and config reads coverit.config.json directly", () => {
  const parser = readTemplate("src/bdd/bddParser.ts.ejs");
  const config = readTemplate("src/config/coveritConfig.ts.ejs");

  assert.match(parser, /@\/constants\/bddPatterns/);
  assert.doesNotMatch(config, /defaultConfig|DEFAULT_CONFIG/);
  assert.match(config, /coverit\.config\.json/);
  assert.equal(fs.existsSync(path.join(root, "templates", "src", "constants", "defaultConfig.ts.ejs")), false);
});

test("healing runtime keeps contracts in src/types and behavior in src/healing", () => {
  const runtimeTypes = readTemplate("src/types/runtime.ts.ejs");
  const healingEngine = readTemplate("src/healing/healingEngine.ts.ejs");

  assert.match(runtimeTypes, /export interface HealingContext/);
  assert.match(runtimeTypes, /export interface HealingCandidate/);
  assert.match(runtimeTypes, /export interface HealingResult/);
  assert.match(healingEngine, /class HealingEngine/);
  assert.doesNotMatch(healingEngine, /export\s+(interface|type)\s+/);
  assert.match(healingEngine, /Update mapping selector manually if this healing is accepted/);
});

test("registry runtime template resolves generated classes from metadata without hardcoded class lists", () => {
  const registry = readTemplate("src/registry/registry.ts.ejs");

  assert.match(registry, /GENERATED_REGISTRY\.states/);
  assert.match(registry, /GENERATED_REGISTRY\.transitions/);
  assert.match(registry, /generatedStates as unknown as Record/);
  assert.match(registry, /generatedTransitions as unknown as Record/);
  assert.doesNotMatch(registry, /HomePageState|CartPageState|OpenCartTransition|CompoundStateTransition/);
});

test("example applications are available for generated framework verification", () => {
  const examplesRoot = path.join(root, "examples");
  const exampleNames = fs.readdirSync(examplesRoot).filter((entry) => fs.statSync(path.join(examplesRoot, entry)).isDirectory());

  assert.deepEqual(exampleNames.sort(), ["dummy-site", "updated-dummy-site"]);
  for (const exampleName of exampleNames) {
    const exampleRoot = path.join(examplesRoot, exampleName);
    assert.ok(fs.existsSync(path.join(exampleRoot, "package.json")));
    assert.ok(fs.existsSync(path.join(exampleRoot, "server.js")));
    assert.ok(fs.existsSync(path.join(exampleRoot, "public", "index.html")));
  }
});
