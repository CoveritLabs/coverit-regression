// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { EXIT_CODE_SUCCESS, EXIT_CODE_FAILURE } from "@constants/common";
import { logger, setupLogger } from "@utils/logger";
import Parser from "@utils/parser";
import Generator from "@/generator/generator";
import { PATHS } from "@/constants/paths";

export const main = (argv = process.argv.slice(2), cwd = process.cwd()): number => {
  const options = Parser.parseArguments(argv, cwd);

  setupLogger({
    logToFile: options.logToFile,
    logPath: PATHS.LOG_FILE,
  });

  const generator = new Generator(options);
  generator.generate();
  return EXIT_CODE_SUCCESS;
};

if (require.main === module) {
  const exitCode = main();
  process.exit(exitCode);
}
