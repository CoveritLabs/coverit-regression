// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import Generator from "@generator/generator";
import { PATHS } from "@constants/paths";
import { logger, setupLogger } from "@utils/logger";
import GitWorkflowRunner from "@workflow/gitWorkflowRunner";

import { materializeBddInput } from "./bddInputMaterializer";
import { buildWorkerCliOptions } from "./workerOptionsBuilder";
import BddOutputPayloadValidator from "@/validate/bddOutputPayloadValidator";
import type {
  BddOutputPayload,
  CrawlSessionCodegenContext,
  CrawlSessionRepository,
  GeneratorLike,
  GitWorkflowRunnerLike,
  MaterializedBddInput,
  WorkerCliOptions,
} from "@/types/worker";
import type { GeneratorOptions } from "@/types/generator";
import type { GitWorkflowOptions, GitWorkflowResult } from "@/types/gitWorkflow";

export interface ProcessBddOutputJobOptions {
  jobId?: string;
  data: unknown;
}

export interface ProcessBddOutputJobResult {
  success: true;
  sessionId: string;
  flowIds: string[];
  inputPath: string;
  outputPath: string;
  git: GitWorkflowResult;
}

export interface ProcessBddOutputJobDependencies {
  sessionRepository: CrawlSessionRepository;
  materializeInput?: typeof materializeBddInput;
  buildOptions?: typeof buildWorkerCliOptions;
  payloadValidator?: BddOutputPayloadValidator;
  createGenerator?: (options: GeneratorOptions) => GeneratorLike;
  createGitWorkflowRunner?: (options: GitWorkflowOptions) => GitWorkflowRunnerLike;
  setupLog?: (options: { logToFile?: boolean; logPath?: string }) => void;
}

export async function processBddOutputJob(
  job: ProcessBddOutputJobOptions,
  dependencies: ProcessBddOutputJobDependencies,
): Promise<ProcessBddOutputJobResult> {
  const payload = (dependencies.payloadValidator ?? new BddOutputPayloadValidator()).parse(job.data);
  logger.info(`[Worker] Processing BDD output for crawl session ${payload.session_id}.`);

  const materializedInput = await (dependencies.materializeInput ?? materializeBddInput)(payload, { jobId: job.jobId });
  const context = await dependencies.sessionRepository.findCodegenContext(payload.session_id);
  const generationContext = await applyPayloadOverrides(context, payload, dependencies.sessionRepository);
  const options = (dependencies.buildOptions ?? buildWorkerCliOptions)(generationContext, materializedInput, PATHS.ROOT);

  configureLogger(dependencies, options);

  const workflowRunner = (dependencies.createGitWorkflowRunner ?? defaultGitWorkflowRunnerFactory)(
    options.gitWorkflowOptions,
  );
  const preparedWorkflow = await workflowRunner.prepare();

  const generator = (dependencies.createGenerator ?? defaultGeneratorFactory)(options.generatorOptions);
  await generator.generate();

  const git = await workflowRunner.finalize(preparedWorkflow);
  logger.info(
    `[Worker] Completed crawl session ${payload.session_id}. noChanges=${git.noChanges}, pushed=${git.pushed}, branch=${git.branchName}` +
      `${git.pullRequest ? `, pr=${git.pullRequest.url}` : ""}`,
  );

  return {
    success: true,
    sessionId: payload.session_id,
    flowIds: payload.flow_ids ?? [],
    inputPath: materializedInput.inputPath,
    outputPath: options.generatorOptions.outputPath,
    git,
  };
}

async function applyPayloadOverrides(
  context: CrawlSessionCodegenContext,
  payload: BddOutputPayload,
  sessionRepository: CrawlSessionRepository,
): Promise<CrawlSessionCodegenContext> {
  const regressionCodebase = payload.regression_codebase_id
    ? await resolveRegressionCodebaseOverride(context, payload.regression_codebase_id, sessionRepository)
    : context.regressionCodebase;

  return {
    ...context,
    regressionCodebase,
    sessionCodegenConfig: {
      ...(context.sessionCodegenConfig ?? {}),
      ...(payload.codegen_config ?? {}),
    },
  };
}

async function resolveRegressionCodebaseOverride(
  context: CrawlSessionCodegenContext,
  regressionCodebaseId: string,
  sessionRepository: CrawlSessionRepository,
): Promise<CrawlSessionCodegenContext["regressionCodebase"]> {
  if (!sessionRepository.findRegressionCodebase) {
    throw new Error("[Worker] Regression codebase override is not supported by this repository.");
  }
  return sessionRepository.findRegressionCodebase(context.targetApplication.id, regressionCodebaseId);
}

function configureLogger(dependencies: ProcessBddOutputJobDependencies, options: WorkerCliOptions): void {
  (dependencies.setupLog ?? setupLogger)({
    logToFile: options.generatorOptions.logToFile,
    logPath: PATHS.LOG_FILE,
  });
}

function defaultGeneratorFactory(options: GeneratorOptions): GeneratorLike {
  return new Generator(options);
}

function defaultGitWorkflowRunnerFactory(options: GitWorkflowOptions): GitWorkflowRunnerLike {
  return new GitWorkflowRunner(options);
}

export type { MaterializedBddInput };
