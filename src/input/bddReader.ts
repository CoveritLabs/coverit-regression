// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { PATHS } from "@constants/paths";
import { FileEntry } from "@/types/files";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

class BddReader {
  features: FileEntry[] = [];

  constructor() {
    if (!FileHandler.exists(PATHS.BDD_FEATURES)) {
      throw new Error(
        `${PATHS.BDD_FEATURES} does not exist. Please create the directory and add your .feature files there.`,
      );
    }
  }

  scan(): FileEntry[] {
    logger.info(`[BDD Reader] Scanning for .feature files in ${PATHS.BDD_FEATURES}...`);
    const files = FileHandler.scanDirectory(PATHS.BDD_FEATURES);
    this.features = FileHandler.filterByExtension(files, ".feature");
    logger.info(`[BDD Reader] Found ${this.features.length} .feature file(s).`);
    return this.features;
  }
}

export default BddReader;
