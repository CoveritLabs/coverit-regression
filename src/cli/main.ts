// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.
import dotenv from "dotenv";
dotenv.config();

import { EXIT_CODE_SUCCESS, EXIT_CODE_FAILURE } from "@constants/common";
import { logger, setupLogger } from "@utils/logger";
import Parser from "@utils/parser";
import Generator from "@generator/generator";
import { PATHS } from "@constants/paths";
import GitWorkflowRunner from "@workflow/gitWorkflowRunner";

export const main = async (argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> => {
  const options = Parser.parseArguments(argv, cwd);

  setupLogger({
    logToFile: options.generatorOptions.logToFile,
    logPath: PATHS.LOG_FILE,
  });

  const workflowRunner = new GitWorkflowRunner(options.gitWorkflowOptions);
  const preparedWorkflow = await workflowRunner.prepare();
  const generator = new Generator(options.generatorOptions);
  await generator.generate();
  const result = await workflowRunner.finalize(preparedWorkflow);
  logger.info(
    `[Git Workflow] Completed. noChanges=${result.noChanges}, pushed=${result.pushed}, branch=${result.branchName}` +
      `${result.pullRequest ? `, pr=${result.pullRequest.url}` : ""}`,
  );
  return EXIT_CODE_SUCCESS;
};

if (require.main === module) {
  main()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      logger.error(error);
      process.exit(EXIT_CODE_FAILURE);
    });
}
