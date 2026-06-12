// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileEntry } from "@/types/files";
import { PATHS } from "@constants/paths";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

class TemplateHandler {
  templates: FileEntry[] = [];

  scan(): FileEntry[] {
    logger.info(`[Template Handler] Scanning for .template files in ${PATHS.TEMPLATES}...`);
    this.templates = FileHandler.scanDirectory(PATHS.TEMPLATES);
    logger.info(`[Template Handler] Found ${this.templates.length} .template file(s).`);
    return this.templates;
  }
}

export default TemplateHandler;
