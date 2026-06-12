// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";

import { EXIT_CODE_SUCCESS, EXIT_CODE_FAILURE } from "@constants/common";
import { PATHS } from "@constants/paths";
import { GeneratorOptions } from "@/types/generator";

class Parser {
  static parseArguments(argv: string[], cwd: string): GeneratorOptions {
    const options: Partial<GeneratorOptions> = {
      outputPath: PATHS.OUTPUT,
      dryRun: false,
      check: false,
      logToFile: true,
    };

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--output") options.outputPath = path.resolve(cwd, this.readValue(argv, ++i, "--output"));
      else if (arg === "--dry-run") options.dryRun = true;
      else if (arg === "--check") options.check = true;
      else if (arg === "--silent") options.logToFile = false;
      else if (arg === "--help" || arg === "-h") {
        this.printHelp();
        process.exit(EXIT_CODE_SUCCESS);
      } else if (arg.startsWith("--")) {
        console.error(`Unknown option: ${arg}`);
        this.printHelp();
        process.exit(EXIT_CODE_FAILURE);
      } else throw new Error(`Unknown argument: ${arg}`);
    }

    return options as GeneratorOptions;
  }

  static readValue(argv: string[], index: number, optionName: string): string {
    if (index >= argv.length) throw new Error(`Missing value for ${optionName}.`);
    const value = argv[index];
    if (!value) throw new Error(`Missing value for ${optionName}.`);
    return value;
  }

  static printHelp() {
    console.log(`Usage: node dist/cli/main.js [options]

Options:
  --output <path>   Specify the output directory (default: ${PATHS.OUTPUT})
  --dry-run         Run the generator without making any changes
  --check           Check if the generated files are up to date
  --no-log          Disable logging to file
  --help, -h        Show this help message
    `);
  }
}

export default Parser;
