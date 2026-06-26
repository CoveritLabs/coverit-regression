// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import { processBddOutputJob } from "@/workerFlow/processor";
import type { CrawlSessionCodegenContext } from "@/types/worker";

test("processBddOutputJob applies per-payload codebase and codegen overrides", async () => {
  const baseContext: CrawlSessionCodegenContext = {
    sessionId: "session-1",
    appVersionId: "version-1",
    sessionCodegenConfig: {
      codegenBranch: "old-branch",
      prTargetBranch: "develop",
    },
    targetApplication: {
      id: "app-1",
      name: "Shop",
      baseUrl: "https://shop.example.com",
    },
    creator: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
    },
    regressionCodebase: {
      id: "old-codebase",
      frameworkName: "Playwright",
      repositoryUrl: "https://github.com/acme/old",
    },
  };
  let optionsContext: CrawlSessionCodegenContext | undefined;

  const result = await processBddOutputJob(
    {
      jobId: "job-1",
      data: {
        session_id: "session-1",
        features: [
          {
            feature_name: "Feature",
            feature_text: "Feature: Feature\n",
          },
        ],
        states: {},
        transitions: {},
        assertions: {},
        action_hooks: {},
        flow_ids: ["flow-1"],
        regression_codebase_id: "new-codebase",
        codegen_config: {
          codegenBranch: "new-branch",
          prTargetBranch: "main",
          prDraft: true,
        },
      },
    },
    {
      sessionRepository: {
        findCodegenContext: async () => baseContext,
        findRegressionCodebase: async (appId, codebaseId) => {
          assert.equal(appId, "app-1");
          assert.equal(codebaseId, "new-codebase");
          return {
            id: "new-codebase",
            frameworkName: "Playwright",
            repositoryUrl: "https://github.com/acme/new",
          };
        },
      },
      materializeInput: async () => ({
        jobRootPath: "job-root",
        inputPath: "input",
        featurePaths: ["feature"],
        mappingPath: "mapping",
      }),
      buildOptions: (context) => {
        optionsContext = context;
        return {
          generatorOptions: {
            outputPath: "output",
            logToFile: false,
          } as any,
          gitWorkflowOptions: {} as any,
        };
      },
      createGitWorkflowRunner: () => ({
        prepare: async () => undefined,
        finalize: async () => ({
          branchName: "new-branch",
          changedFiles: [],
          noChanges: true,
          pushed: false,
        }),
      }),
      createGenerator: () => ({
        generate: async () => true,
      }),
      setupLog: () => undefined,
    },
  );

  assert.equal(optionsContext?.regressionCodebase?.id, "new-codebase");
  assert.equal(optionsContext?.sessionCodegenConfig?.codegenBranch, "new-branch");
  assert.equal(optionsContext?.sessionCodegenConfig?.prTargetBranch, "main");
  assert.equal(optionsContext?.sessionCodegenConfig?.prDraft, true);
  assert.deepEqual(result.flowIds, ["flow-1"]);
});
