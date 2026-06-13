// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { PATHS } from "@constants/paths";
import {
  ActionHookStepMapping,
  AssertionStepMapping,
  BaseStepMapping,
  DesignClassMapping,
  FrameworkMappingFileSet,
  GeneratedFrameworkModel,
  StateStepMapping,
  TransitionStepMapping,
} from "@/types/framework";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

class FrameworkMappingReader {
  private readonly mappingPath: string;

  constructor(mappingPath: string = PATHS.FRAMEWORK_MAPPING) {
    this.mappingPath = mappingPath;
  }

  read(): FrameworkMappingFileSet {
    logger.info(`[Framework Mapping Reader] Reading framework mapping from ${this.mappingPath}...`);

    const mapping = {
      states: this.readJson<Record<string, StateStepMapping>>("states.json"),
      transitions: this.readJson<Record<string, TransitionStepMapping>>("transitions.json"),
      assertions: this.readJson<Record<string, AssertionStepMapping>>("assertions.json"),
      actionHooks: this.readJson<Record<string, ActionHookStepMapping>>("action-hooks.json"),
      designClass: this.readJson<DesignClassMapping>("design-class.json"),
    };

    logger.info(
      `[Framework Mapping Reader] Loaded ${Object.keys(mapping.states).length} state(s), ` +
        `${Object.keys(mapping.transitions).length} transition(s), ` +
        `${Object.keys(mapping.assertions).length} assertion(s), ` +
        `${Object.keys(mapping.actionHooks).length} action hook(s), ` +
        `and design class "${mapping.designClass.id}".`,
    );

    return mapping;
  }

  readModel(): GeneratedFrameworkModel {
    return this.buildGeneratedFrameworkModel(this.read());
  }

  buildGeneratedFrameworkModel(mapping: FrameworkMappingFileSet): GeneratedFrameworkModel {
    return {
      states: this.sortMappings(Object.values(mapping.states)),
      transitions: this.sortMappings(Object.values(mapping.transitions)),
      assertions: this.sortMappings(Object.values(mapping.assertions)),
      actionHooks: this.sortMappings(Object.values(mapping.actionHooks)),
      designClass: mapping.designClass,
    };
  }

  private readJson<T>(fileName: string): T {
    const filePath = FileHandler.join(this.mappingPath, fileName);
    if (!FileHandler.exists(filePath)) {
      throw new Error(`[Framework Mapping Reader] Missing required mapping file: ${filePath}`);
    }

    return JSON.parse(FileHandler.readFile(filePath)) as T;
  }

  private sortMappings<T extends BaseStepMapping>(mappings: T[]): T[] {
    return mappings.sort((a, b) => a.id.localeCompare(b.id));
  }
}

export default FrameworkMappingReader;
