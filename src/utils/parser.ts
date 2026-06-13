// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";
import yaml from "js-yaml";

import { EXIT_CODE_SUCCESS, EXIT_CODE_FAILURE } from "@constants/common";
import { CLI_DEFAULTS } from "@constants/config";
import { PATHS } from "@constants/paths";
import type { CliOptions } from "@/types/cli";
import type { GeneratorOptions } from "@/types/generator";
import type { GitWorkflowOptions, CodegenConfig, RegressionCodebase } from "@/types/gitWorkflow";
import FileHandler from "./files";

class Parser {
  static parseArguments(argv: string[], cwd: string): CliOptions {
    const configPath = PATHS.CONFIG_FILE;
    let yamlConfig: any = {};

    if (FileHandler.exists(configPath)) {
      try {
        yamlConfig = yaml.load(FileHandler.readFile(configPath)) || {};
      } catch (error) {
        console.error(`Error parsing YAML configuration: ${(error as Error).message}`);
        process.exit(EXIT_CODE_FAILURE);
      }
    }

    const options: Partial<GeneratorOptions> = {
      ...CLI_DEFAULTS,
      ...(yamlConfig.generator || {}),
    };

    const gitYaml = yamlConfig.gitWorkflow || {};
    const yamlRegression = gitYaml.regressionCodebase || {};
    const yamlCodegen = gitYaml.codegenConfig || {};

    const workflowOptions: Partial<GitWorkflowOptions> = {
      commitMessage: gitYaml.commitMessage || undefined,
    };

    const codegenConfig: NonNullable<CodegenConfig> = {
      prTargetBranch: yamlCodegen.prTargetBranch || "",
      codegenBranch: yamlCodegen.codegenBranch || undefined,
      prTitle: yamlCodegen.prTitle || undefined,
      prBody: yamlCodegen.prBody || undefined,
      prDraft: yamlCodegen.prDraft || undefined,
    };

    const regressionCodebase: NonNullable<RegressionCodebase> = {
      repositoryUrl: yamlRegression.repositoryUrl || "",
      apiKey: yamlRegression.apiKey || undefined,
      frameworkName: yamlRegression.frameworkName || undefined,
    };

    let gitWorkflowRequested = Object.keys(gitYaml).length > 0;

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--output") {
        options.outputPath = this.readValue(argv, ++i, "--output");
      } else if (arg === "--dry-run") {
        options.dryRun = true;
      } else if (arg === "--check") {
        options.check = true;
      } else if (arg === "--silent") {
        options.logToFile = false;
      } else if (arg === "--repo-url") {
        regressionCodebase.repositoryUrl = this.readValue(argv, ++i, "--repo-url");
        gitWorkflowRequested = true;
      } else if (arg === "--api-key") {
        regressionCodebase.apiKey = this.readValue(argv, ++i, "--api-key");
        gitWorkflowRequested = true;
      } else if (arg === "--framework-name") {
        regressionCodebase.frameworkName = this.readValue(argv, ++i, "--framework-name");
        gitWorkflowRequested = true;
      } else if (arg === "--codegen-branch") {
        codegenConfig.codegenBranch = this.readValue(argv, ++i, "--codegen-branch");
        gitWorkflowRequested = true;
      } else if (arg === "--target-branch") {
        codegenConfig.prTargetBranch = this.readValue(argv, ++i, "--target-branch");
        gitWorkflowRequested = true;
      } else if (arg === "--pr-title") {
        codegenConfig.prTitle = this.readValue(argv, ++i, "--pr-title");
        gitWorkflowRequested = true;
      } else if (arg === "--pr-body") {
        codegenConfig.prBody = this.readValue(argv, ++i, "--pr-body");
        gitWorkflowRequested = true;
      } else if (arg === "--pr-draft") {
        codegenConfig.prDraft = true;
        gitWorkflowRequested = true;
      } else if (arg === "--commit-message") {
        workflowOptions.commitMessage = this.readValue(argv, ++i, "--commit-message");
        gitWorkflowRequested = true;
      } else if (arg === "--help" || arg === "-h") {
        this.printHelp();
        process.exit(EXIT_CODE_SUCCESS);
      } else if (arg.startsWith("--")) {
        console.error(`Unknown option: ${arg}`);
        this.printHelp();
        process.exit(EXIT_CODE_FAILURE);
      } else {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }

    if (options.outputPath && !path.isAbsolute(options.outputPath)) {
      options.outputPath = path.resolve(cwd, options.outputPath);
    }

    const parsedOptions: CliOptions = {
      generatorOptions: options as GeneratorOptions,
    };

    if (gitWorkflowRequested) {
      if (!regressionCodebase.repositoryUrl) throw new Error("Missing value for --repo-url.");
      if (!regressionCodebase.apiKey) throw new Error("Missing value for --api-key.");
      if (!codegenConfig.prTargetBranch) throw new Error("Missing value for --target-branch.");

      parsedOptions.gitWorkflowOptions = {
        generatorOptions: parsedOptions.generatorOptions,
        regressionCodebase,
        codegenConfig,
        commitMessage: workflowOptions.commitMessage,
      };
    }

    return parsedOptions;
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
  --output <path>         Specify the output directory (default: ${CLI_DEFAULTS.outputPath})
  --dry-run               Run the generator without making any changes
  --check                 Check if the generated files are up to date
  --silent                Disable logging to file
  --repo-url <url>        Enable git workflow mode with the target repository URL
  --api-key <token>       GitHub HTTPS token used for clone/push/PR creation
  --framework-name <id>   Optional regression framework name
  --codegen-branch <name> Branch to create or reuse for generated changes
  --target-branch <name>  Base branch to checkout from and open the PR into
  --pr-title <text>       Optional pull request title
  --pr-body <text>        Optional pull request body
  --pr-draft              Create the pull request as a draft
  --commit-message <msg>  Optional git commit message override
  --help, -h              Show this help message
    `);
  }
}

export default Parser;
