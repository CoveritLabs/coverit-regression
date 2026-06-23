// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileOperation, FileEntry } from "@/types/files";
import { GeneratorOptions } from "@/types/generator";
import { Feature } from "@/types/feature";
import { Manifest } from "@/types/manifest";
import BddReader from "@input/bddReader";
import FileEmitter from "./fileEmitter";
import FrameworkMappingReader from "@input/frameworkMappingReader";
import ManifestReader from "@input/manifestReader";
import TemplateHandler from "@input/templateHandler";
import Planner from "@planner/planner";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";
import TemplateContextBuilder from "./templateContextBuilder";
import { diagnostics } from "@/diagnostics/diagnostics";
import GenerationRecordStore from "@planner/generationRecordStore";
import BddMappingValidator from "@/validate/bddMappingValidator";
import FeatureFilePatcher from "./featureFilePatcher";

class Generator {
  private readonly options: GeneratorOptions;
  private bddReader: BddReader;
  private fileEmitter: FileEmitter;
  private frameworkMappingReader: FrameworkMappingReader;
  private templateHandler: TemplateHandler;
  private templateContextBuilder: TemplateContextBuilder;
  private manifestReader: ManifestReader;
  private generationRecordStore: GenerationRecordStore;
  private bddMappingValidator: BddMappingValidator;
  private featureFilePatcher: FeatureFilePatcher;

  constructor(options: GeneratorOptions) {
    this.options = options;
    this.bddReader = new BddReader(FileHandler.join(options.inputPath, "features"));
    this.fileEmitter = new FileEmitter();
    this.frameworkMappingReader = new FrameworkMappingReader(FileHandler.join(options.inputPath, "framework-mapping"));
    this.templateHandler = new TemplateHandler();
    this.templateContextBuilder = new TemplateContextBuilder();
    this.manifestReader = new ManifestReader(options.outputPath);
    this.generationRecordStore = new GenerationRecordStore();
    this.bddMappingValidator = new BddMappingValidator();
    this.featureFilePatcher = new FeatureFilePatcher();
  }

  createPlan(manifest: Manifest, features: FileEntry[], templates: FileEntry[]): FileOperation[] {
    const operations: FileOperation[] = new Planner()
      .setOutputPath(this.options.outputPath)
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
    diagnostics.clear();
    const manifest = this.manifestReader.read();

    logger.info(`[Generator] Validating input features and framework mapping...`);
    const features = this.bddReader.scan();
    const parsedFeatures = this.parseFeatures(features);

    const mapping = this.frameworkMappingReader.read();
    this.bddMappingValidator.validate(parsedFeatures, mapping);
    const model = this.frameworkMappingReader.buildGeneratedFrameworkModel(mapping);

    const templateContext = this.templateContextBuilder.build(model, this.options.generatedConfig);
    const templates = this.templateHandler.scan();
    const materializedTemplates = await this.fileEmitter.materialize(templates, { context: templateContext });

    logger.info("[Generator] Starting generation process...");
    const patchedFeatures = this.patchFeatures(features);
    const operations = this.createPlan(manifest, patchedFeatures, materializedTemplates);
    const hasChanges = this.fileEmitter.applyOperations(operations, this.options.dryRun, this.options.check);

    if (!this.options.dryRun && !this.options.check)
      this.generationRecordStore.save(this.options.outputPath, operations);

    diagnostics.print(logger);
    logger.info(`[Generator] Generation process completed. Changes detected: ${hasChanges}.`);
    return hasChanges;
  }

  private parseFeatures(features: FileEntry[]): Feature[] {
    logger.info(`[Generator] Parsing ${features.length} feature file(s)...`);
    const parsedFeatures: Feature[] = features.map((featureFile) => this.bddReader.parse(featureFile));
    logger.info(`[Generator] Parsed ${parsedFeatures.length} feature(s).`);
    for (const feature of parsedFeatures) this.bddReader.printFeature(feature);
    return parsedFeatures;
  }

  private patchFeatures(features: FileEntry[]): FileEntry[] {
    logger.info(`[Generator] Patching ${features.length} feature(s)...`);
    const existingFeaturesPath = FileHandler.join(this.options.outputPath, "features");
    const patchedFeatures: FileEntry[] = this.featureFilePatcher.patch(features, existingFeaturesPath);
    logger.info(`[Generator] Patched ${patchedFeatures.length} feature(s).`);
    return patchedFeatures;
  }
}

export default Generator;
