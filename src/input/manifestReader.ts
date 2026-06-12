// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { Manifest } from "@/types/manifest";
import { PATHS } from "@constants/paths";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

class ManifestReader {
  private manifestPath: string;

  constructor() {
    const existingManifest = FileHandler.join(PATHS.OUTPUT, "manifest.json");
    if (FileHandler.exists(existingManifest)) this.manifestPath = existingManifest;
    else this.manifestPath = FileHandler.join(PATHS.TEMPLATES, "manifest.json");
  }

  read(): Manifest {
    logger.info(`[Manifest Reader] Reading manifest.json from ${this.manifestPath}...`);
    const manifestContent = FileHandler.readFile(this.manifestPath);
    const manifest = JSON.parse(manifestContent) as Manifest;
    logger.info(`[Manifest Reader] Successfully read manifest.json with templateVersion: ${manifest.templateVersion}`);
    return manifest;
  }
}

export default ManifestReader;
