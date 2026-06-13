// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { GeneratorOptions } from "@/types/generator";
import type { GitWorkflowOptions } from "@/types/gitWorkflow";

export interface CliOptions {
  generatorOptions: GeneratorOptions;
  gitWorkflowOptions?: GitWorkflowOptions;
}
