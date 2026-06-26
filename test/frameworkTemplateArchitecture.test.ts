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

test("BDD runtime template stores design class as scenario event metadata instead of executable flow", () => {
  const parser = readTemplate("src/bdd/bddParser.ts.ejs");
  const types = readTemplate("src/types/bdd.ts.ejs");
  const runner = readTemplate("src/core/regressionRunner.ts.ejs");

  assert.match(parser, /currentScenario\.designClassId = designClassId/);
  assert.match(parser, /currentScenario\.designClassStep = \{ type: "DESIGN_CLASS", id: designClassId, keyword, rawText: line \}/);
  assert.match(types, /designClassStep\?:\s*\{/);
  assert.match(types, /type:\s*"DESIGN_CLASS"/);
  assert.match(runner, /designClassStep:\s*scenario\.designClassStep/);
  assert.doesNotMatch(runner, /for \(const step of scenario\.steps\)[\s\S]*DESIGN_CLASS/);
});

test("generated reporter includes readable BDD step text in step and assertion events", () => {
  const reporter = readTemplate("src/reporting/runReporter.ts.ejs");
  const runner = readTemplate("src/core/regressionRunner.ts.ejs");
  const runtimeTypes = readTemplate("src/types/runtime.ts.ejs");
  const reportingTypes = readTemplate("src/types/reporting.ts.ejs");

  assert.match(reportingTypes, /stepText\?:\s*string/);
  assert.match(reportingTypes, /stepKeyword\?:\s*string/);
  assert.match(runtimeTypes, /bddStep\?:\s*\{/);
  assert.match(reporter, /stepText:\s*report\.stepText/);
  assert.match(reporter, /stepKeyword:\s*report\.stepKeyword/);
  assert.match(reporter, /bddStep:\s*\{\s*type:\s*report\.stepType/);
  assert.match(reporter, /parentStepText:\s*report\.stepText/);
  assert.match(runner, /stepText:\s*step\.rawText/);
  assert.match(runner, /stepKeyword:\s*step\.keyword/);
  assert.match(runner, /private withBddStep\(result: AssertionResult, step: RuntimeStepPlan/);
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

test("runtime reporting config uses current application identity fields", () => {
  const templatePaths = listTemplateFiles("src");
  const configJson = readTemplate("coverit.config.json.ejs");
  const configTypes = readTemplate("src/types/config.ts.ejs");
  const reportingTypes = readTemplate("src/types/reporting.ts.ejs");
  const runReporter = readTemplate("src/reporting/runReporter.ts.ejs");
  const localArtifactStore = readTemplate("src/reporting/localArtifactStore.ts.ejs");
  const config = readTemplate("src/config/coveritConfig.ts.ejs");

  for (const templatePath of templatePaths) {
    const source = readTemplate(templatePath);
    assert.doesNotMatch(source, /projectId|apiKeyEnv|idEnv|eventPath|completionPath/, `${templatePath} should not use removed reporting config fields`);
  }
  assert.doesNotMatch(configJson, /projectId|apiKeyEnv|idEnv|eventPath|completionPath/);

  assert.match(configJson, /"applicationId"/);
  assert.match(configJson, /"versionId"/);
  assert.match(configJson, /"name":\s*"Run"/);
  assert.doesNotMatch(configJson, /"api"\s*:/);
  assert.doesNotMatch(configJson, /"baseUrl":\s*"<%- config\.coveritApiBaseUrl/);
  assert.doesNotMatch(configJson, /"enabled":\s*<%- config\.apiReportingEnabled/);
  assert.doesNotMatch(configJson, /"apiKey"/);
  assert.match(config, /COVERIT_API_REPORTING_ENABLED/);
  assert.match(config, /COVERIT_API_KEY/);
  assert.match(config, /COVERIT_API_BASE_URL/);
  assert.match(configJson, /"artifactRoot"/);
  assert.match(configTypes, /run:\s*\{\s*name:\s*string;\s*applicationId:\s*string;\s*versionId\?:\s*string\s*\}/);
  assert.match(configTypes, /export interface ApiReportingConfig/);
  assert.match(configTypes, /apiReporting:\s*ApiReportingConfig/);
  assert.doesNotMatch(configTypes, /\n\s*api:\s*\{/);
  assert.match(configTypes, /reporting:\s*\{\s*localArtifactsEnabled:\s*boolean;\s*artifactRoot:\s*string\s*\}/);
  assert.match(configTypes, /healing:\s*\{\s*enabled:\s*boolean;\s*threshold:\s*number\s*\}/);
  assert.doesNotMatch(configJson, /artifactPath/);
  assert.doesNotMatch(configTypes, /artifactPath/);
  assert.match(reportingTypes, /runName:\s*string/);
  assert.match(reportingTypes, /applicationId:\s*string/);
  assert.match(reportingTypes, /versionId\?:\s*string/);
  assert.match(runReporter, /runName:\s*config\.run\.name/);
  assert.match(runReporter, /applicationId:\s*config\.run\.applicationId/);
  assert.match(runReporter, /versionId:\s*config\.run\.versionId/);
  assert.match(localArtifactStore, /getArtifactPaths\(config,\s*runId\)/);
  assert.doesNotMatch(config, /must define run\.applicationId/);
  assert.doesNotMatch(config, /must define api settings/);
  assert.doesNotMatch(config, /config\.api\b/);
  assert.match(config, /apiDisabledReasonFor/);
  assert.match(config, /API reporting disabled/);
});

test("generated reporter posts events and completion to CoverIt API when enabled", () => {
  const runReporter = readTemplate("src/reporting/runReporter.ts.ejs");
  const apiClient = readTemplate("src/reporting/coveritApiClient.ts.ejs");
  const logger = readTemplate("src/utils/logger.ts.ejs");
  const regressionRunner = readTemplate("src/core/regressionRunner.ts.ejs");

  assert.match(runReporter, /new CoveritApiClient\(config\.apiReporting\)/);
  assert.match(runReporter, /config\.apiReporting\.enabled/);
  assert.match(runReporter, /config\.apiReporting\.disabledReason/);
  assert.doesNotMatch(runReporter, /config\.api\b/);
  assert.match(runReporter, /loadConfigOrFallback/);
  assert.match(runReporter, /createApiClient/);
  assert.match(runReporter, /createArtifactStore/);
  assert.match(runReporter, /Could not load CoverIt config/);
  assert.match(runReporter, /Could not initialize API client/);
  assert.match(runReporter, /Could not initialize local artifact store/);
  assert.match(runReporter, /sendEvent\(event\)/);
  assert.match(runReporter, /completeRun\(this\.identity,\s*summary\)/);
  assert.match(runReporter, /Could not send run completion/);
  assert.match(runReporter, /private safeLocalArtifact/);
  assert.match(runReporter, /Could not capture failure artifacts/);
  assert.match(regressionRunner, /finally\s*\{/);
  assert.match(regressionRunner, /saveSummary\(this\.buildSummary\(status,\s*reports\)\)/);
  assert.match(regressionRunner, /if \(scenarioError\) throw scenarioError/);
  assert.match(runReporter, /logger\.warn/);
  assert.doesNotMatch(runReporter, /console\.warn/);
  assert.doesNotMatch(runReporter, /already uploaded/);
  assert.match(runReporter, /maxDurationMs/);
  assert.match(runReporter, /skipped/);
  assert.match(logger, /export class Logger/);
  assert.match(logger, /forScenario/);
  assert.match(logger, /logFilePaths/);
  assert.match(logger, /forScenario\(options:\s*LoggerOptions\s*=\s*\{\}\):\s*Logger/);
  assert.doesNotMatch(logger, /_legacy|backward|compat|\|\s*string/);
  assert.doesNotMatch(logger, /scenarioLabel/);
  assert.match(logger, /\\u2713/);
  assert.match(logger, /\\u00d7/);
  assert.match(logger, /logFilePath/);
  assert.match(logger, /WARN /);
  assert.match(logger, /NO_COLOR/);
  assert.match(apiClient, /ApiReportingConfig/);
  assert.doesNotMatch(apiClient, /config\.api\b/);
  assert.match(apiClient, /X-CoverIt-Api-Key/);
  assert.match(apiClient, /\/api\/v1\/regression\/runs\/\$\{encodeURIComponent\(event\.runId\)\}\/events/);
  assert.match(apiClient, /\/api\/v1\/regression\/runs\/\$\{encodeURIComponent\(identity\.runId\)\}\/complete/);
  assert.match(apiClient, /\/api\/v1\/regression\/runs\/\$\{encodeURIComponent\(identity\.runId\)\}\/artifacts/);
  assert.match(apiClient, /runName:\s*identity\.runName/);
  assert.match(apiClient, /form\.append\("runName",\s*identity\.runName\)/);
  assert.match(apiClient, /scenarioArtifactName/);
  assert.match(apiClient, /applicationId:\s*identity\.applicationId/);
  assert.match(runReporter, /uploadArtifacts\(scope:/);
  assert.match(runReporter, /uploadArtifact\(this\.identity,\s*artifact\)/);
  assert.match(apiClient, /artifactUploadTimeoutMs\s*=\s*60_000/);
  assert.doesNotMatch(apiClient, /DagsHub|dagshub/);
});

test("generated framework centralizes logging and artifact roots", () => {
  const templatePaths = listTemplateFiles("src");
  const playwrightConfig = readTemplate("playwright.config.ts");
  const packageJson = readTemplate("package.json");
  const configJson = readTemplate("coverit.config.json.ejs");
  const artifactPaths = readTemplate("src/utils/artifactPaths.ts.ejs");
  const loggerPath = "src/utils/logger.ts.ejs";

  for (const templatePath of templatePaths) {
    if (templatePath === loggerPath) continue;
    const source = readTemplate(templatePath);
    assert.doesNotMatch(source, /console\.(log|warn|error)/, `${templatePath} should log through Logger`);
  }

  assert.match(artifactPaths, /runRoot/);
  assert.match(artifactPaths, /runLog:\s*path\.join\(runRoot,\s*"run\.log"\)/);
  assert.match(artifactPaths, /events:\s*path\.join\(runRoot,\s*"events\.ndjson"\)/);
  assert.match(artifactPaths, /summary:\s*path\.join\(runRoot,\s*"summary\.json"\)/);
  assert.match(artifactPaths, /healing:\s*path\.join\(runRoot,\s*"healing\.md"\)/);
  assert.match(artifactPaths, /playwrightResults/);
  assert.match(artifactPaths, /playwrightReport/);
  assert.match(artifactPaths, /"output"/);
  assert.match(artifactPaths, /"scenarios"/);
  assert.match(artifactPaths, /getPlaywrightScenarioLogPath/);
  assert.match(artifactPaths, /sanitizeArtifactFolderName/);
  assert.match(playwrightConfig, /outputDir:\s*artifactPaths\.playwrightResults/);
  assert.match(playwrightConfig, /outputFolder:\s*artifactPaths\.playwrightReport/);
  assert.match(playwrightConfig, /video:\s*"retain-on-failure"/);
  assert.match(configJson, /"artifactRoot":[\s\S]*artifacts/);
  assert.doesNotMatch(artifactPaths, /framework\.log|events\/log\.txt|events\.jsonl|runner-summary|healing-events|test-results|"raw"/);
  assert.doesNotMatch(playwrightConfig, /reports\/playwright-report/);
  assert.doesNotMatch(playwrightConfig, /test-results/);
  assert.doesNotMatch(packageJson, /reports\/playwright-report/);

  const regressionSpec = readTemplate("tests/regression.spec.ts");
  assert.match(regressionSpec, /scenarioIndex/);
  assert.match(regressionSpec, /scenarioNameOccurrences/);
  assert.match(regressionSpec, /scenarioArtifactName/);
  assert.match(regressionSpec, /uploadArtifacts\("scenario",\s*\{\s*maxDurationMs:\s*10_000\s*\}\)/);
  assert.match(regressionSpec, /test\.setTimeout\(120_000\)/);
  assert.match(regressionSpec, /uploadArtifacts\("run",\s*\{\s*maxDurationMs:\s*25_000\s*\}\)/);

  const localArtifactStore = readTemplate("src/reporting/localArtifactStore.ts.ejs");
  assert.doesNotMatch(localArtifactStore, /scenario\.json/);
  assert.match(localArtifactStore, /saveScenarioInfo/);
  assert.match(localArtifactStore, /appendScenarioLog/);
  assert.match(localArtifactStore, /scenario\.log/);
  assert.match(localArtifactStore, /playwright\/scenarios\//);
  assert.match(localArtifactStore, /canonicalizeRunArtifactPath/);
  assert.match(localArtifactStore, /playwright\/output/);
  assert.doesNotMatch(localArtifactStore, /scenario_\d/);
  assert.match(localArtifactStore, /isUploadCandidate/);
  assert.match(localArtifactStore, /\.playwright-artifacts-/);

  const runReporter = readTemplate("src/reporting/runReporter.ts.ejs");
  assert.match(runReporter, /scenarioArtifactMappings/);
  assert.match(runReporter, /private scenarioStartedAt\?:\s*string/);
  assert.match(runReporter, /startedAt:\s*this\.scenarioStartedAt/);
  assert.match(runReporter, /finishedAt:\s*timestamp/);
  assert.match(runReporter, /durationMs:\s*Math\.max\(0,\s*new Date\(timestamp\)\.getTime\(\)\s*-\s*new Date\(this\.scenarioStartedAt\)\.getTime\(\)\)/);
  assert.match(runReporter, /this\.event\("scenario\.status",\s*\{\s*status,\s*\.\.\.timing,\s*\.\.\.designClassPayload\s*\}\)/);
  assert.match(runReporter, /appendScenarioLog/);
  assert.match(runReporter, /listArtifacts\(scope,\s*this\.identity\.scenarioIndex,\s*this\.identity\.scenarioArtifactName,\s*\[\.\.\.RunReporter\.scenarioArtifactMappings\.values\(\)\]\)/);

  const regressionRunner = readTemplate("src/core/regressionRunner.ts.ejs");
  assert.match(regressionRunner, /logger\.forScenario\(\)/);
  assert.doesNotMatch(regressionRunner, /logger\.forScenario\([^)]*,/);
  assert.match(regressionRunner, /warnings:\s*results\.filter\(\(result\)\s*=>\s*result\.healingInfo\?\.wasHealed\s*\|\|\s*\(!result\.passed\s*&&\s*result\.severity\s*!==\s*"blocking"\)\)\.length/);
  assert.match(regressionRunner, /failed:\s*results\.filter\(\(result\)\s*=>\s*!result\.passed\s*&&\s*result\.severity\s*===\s*"blocking"\)\.length/);
});

test("generated framework includes GitHub CI for added flows and runtime filters", () => {
  const workflow = readTemplate(".github/workflows/coverit-regression.yml");
  const envExample = readTemplate(".env.example");
  const detector = readTemplate("scripts/detect-added-flows.js");
  const packageJson = readTemplate("package.json");
  const regressionSpec = readTemplate("tests/regression.spec.ts");
  const parser = readTemplate("src/bdd/bddParser.ts.ejs");
  const bddTypes = readTemplate("src/types/bdd.ts.ejs");
  const manifest = readTemplate("manifest.json");
  const fileEmitter = fs.readFileSync(path.join(root, "src", "generator", "fileEmitter.ts"), "utf8");
  const generatorTypes = fs.readFileSync(path.join(root, "src", "types", "generator.ts"), "utf8");

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /pull_request/);
  assert.match(workflow, /opened, synchronize, reopened, ready_for_review/);
  assert.doesNotMatch(workflow, /draft\s*==\s*false|!\s*github\.event\.pull_request\.draft/);
  assert.match(workflow, /featureRegex/);
  assert.match(workflow, /scenarioRegex/);
  assert.match(workflow, /marks/);
  assert.match(workflow, /npm run ci:added-flows/);
  assert.match(workflow, /COVERIT_API_REPORTING_ENABLED:\s*\$\{\{\s*vars\.COVERIT_API_REPORTING_ENABLED\s*\}\}/);
  assert.match(workflow, /COVERIT_API_BASE_URL:\s*\$\{\{\s*vars\.COVERIT_API_BASE_URL\s*\}\}/);
  assert.doesNotMatch(workflow, /COVERIT_API_URL/);
  assert.match(workflow, /COVERIT_API_KEY:\s*\$\{\{\s*secrets\.COVERIT_API_KEY\s*\}\}/);
  assert.match(envExample, /COVERIT_API_REPORTING_ENABLED=false/);
  assert.match(envExample, /COVERIT_API_BASE_URL=/);
  assert.match(envExample, /COVERIT_API_KEY=/);

  assert.match(packageJson, /"test":\s*"playwright test"/);
  assert.match(packageJson, /"test:filtered":\s*"playwright test"/);
  assert.match(packageJson, /"ci:added-flows":\s*"node scripts\/detect-added-flows\.js"/);

  assert.match(regressionSpec, /FEATURE_REGEX/);
  assert.match(regressionSpec, /SCENARIO_REGEX/);
  assert.match(regressionSpec, /MARKS/);
  assert.match(regressionSpec, /matchesFeature/);
  assert.match(regressionSpec, /matchesScenario/);

  assert.match(parser, /extractMarks/);
  assert.match(parser, /featureMarks/);
  assert.match(bddTypes, /marks\?:\s*string\[\]/);
  assert.match(detector, /detectAddedFlows/);
  assert.match(detector, /parseFeatureDiff/);
  assert.match(detector, /\["run", "test:filtered"\]/);
  assert.match(manifest, /\.github\/workflows\/\*\*/);
  assert.match(manifest, /scripts\/\*\*/);
  assert.match(manifest, /\.env\.example/);
  assert.match(generatorTypes, /githubActionsEnabled\?:\s*boolean/);
  assert.match(fileEmitter, /githubActionsEnabled !== false/);
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

test("transition runtime executes normalized action lists", () => {
  const transitionTypes = readTemplate("src/types/transition.ts.ejs");
  const baseTransition = readTemplate("src/core/baseTransition.ts.ejs");

  assert.match(transitionTypes, /actions\?:\s*TransitionActionInfo\[\]/);
  assert.match(transitionTypes, /action\?:\s*TransitionActionInfo\s*\|\s*TransitionActionInfo\[\]/);
  assert.match(baseTransition, /readonly actions:\s*TransitionActionInfo\[\]/);
  assert.match(baseTransition, /for \(const \[index, action\] of this\.actions\.entries\(\)\)/);
  assert.match(baseTransition, /private normalizeActions\(definition:\s*TransitionInfo\):\s*TransitionActionInfo\[\]/);
  assert.match(baseTransition, /Array\.isArray\(definition\.action\)/);
  assert.doesNotMatch(baseTransition, /this\.action\.type/);
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

  assert.deepEqual(exampleNames.sort(), ["broken-dummy-site", "dummy-site", "updated-dummy-site"]);
  for (const exampleName of exampleNames) {
    const exampleRoot = path.join(examplesRoot, exampleName);
    assert.ok(fs.existsSync(path.join(exampleRoot, "package.json")));
    assert.ok(fs.existsSync(path.join(exampleRoot, "server.js")));
    assert.ok(fs.existsSync(path.join(exampleRoot, "public", "index.html")));
  }
});
