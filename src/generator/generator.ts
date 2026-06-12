// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileOperation } from "@/types/files";
import { GeneratorOptions } from "@/types/generator";
import BddReader from "@input/bddReader";
import ManifestReader from "@input/manifestReader";
import TemplateHandler from "@input/templateHandler";
import Planner from "@planner/planner";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

class Generator {
  private options: GeneratorOptions;
  private bddReader: BddReader;
  private templateHandler: TemplateHandler;
  private manifestReader: ManifestReader;

  constructor(options: GeneratorOptions) {
    this.options = options;
    this.bddReader = new BddReader();
    this.templateHandler = new TemplateHandler();
    this.manifestReader = new ManifestReader();
  }

  createPlan(): FileOperation[] {
    const manifest = this.manifestReader.read();
    const features = this.bddReader.scan();
    const templates = this.templateHandler.scan();
    const operations: FileOperation[] = new Planner()
      .setManifest(manifest)
      .setFeatures(features)
      .setTemplates(templates)
      .plan();

    logger.info(`[Generator] Planned ${operations.length} file operation(s):`);
    for (const operation of operations) {
      const relativeSrcPath = FileHandler.toRelativePath(operation.sourcePath);
      const relativeTargetPath = FileHandler.toRelativePath(operation.targetPath);

      logger.info(
        `'${operation.kind}' ${relativeSrcPath} -> ${relativeTargetPath}` +
          ` (Mode: ${operation.mode}, Reason: ${operation.reason})`,
      );
    }

    return operations;
  }

  async generate(): Promise<boolean> {
    logger.info("[Generator] Starting generation process...");
    const operations = this.createPlan();
    return true;
  }
}

export default Generator;
