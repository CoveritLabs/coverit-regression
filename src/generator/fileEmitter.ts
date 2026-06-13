// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import ejs from "ejs";

import { PATH_SEPARATOR } from "@constants/common";
import { PATHS } from "@constants/paths";
import { FileEntry } from "@/types/files";
import { TemplateRenderContext } from "@/types/templates";
import FileHandler from "@utils/files";
import { logger } from "@utils/logger";

interface FileEmitterOptions {
  context?: TemplateRenderContext;
}

class FileEmitter {
  async materialize(templates: FileEntry[], options: FileEmitterOptions = {}): Promise<FileEntry[]> {
    const context = options.context ?? {};
    const emitted: FileEntry[] = [];

    for (const template of templates) {
      emitted.push(...(await this.materializeTemplate(template, context)));
    }

    logger.info(`[File Emitter] Materialized ${emitted.length} template file(s) in ${PATHS.MATERIALIZED_TEMPLATES}.`);
    return emitted.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private async materializeTemplate(template: FileEntry, context: TemplateRenderContext | {}): Promise<FileEntry[]> {
    if (this.isStateRepeatTemplate(template.relativePath)) {
      return this.materializeRepeatedTemplate(template, context, this.requireContext(context).metadata.stateClasses, "state");
    }

    if (this.isTransitionRepeatTemplate(template.relativePath)) {
      return this.materializeRepeatedTemplate(
        template,
        context,
        this.requireContext(context).metadata.transitionClasses,
        "transition",
      );
    }

    const relativePath = this.getOutputRelativePath(template.relativePath);
    const absolutePath = FileHandler.join(PATHS.MATERIALIZED_TEMPLATES, ...relativePath.split(PATH_SEPARATOR));

    if (this.isEjsTemplate(template.relativePath)) {
      const content = await this.renderEjs(template.absolutePath, context);
      FileHandler.writeFile(absolutePath, content);
    } else {
      FileHandler.copyFile(template.absolutePath, absolutePath);
    }

    return [{ relativePath, absolutePath }];
  }

  private async materializeRepeatedTemplate<T extends { className: string }>(
    template: FileEntry,
    context: TemplateRenderContext | {},
    items: T[],
    variableName: "state" | "transition",
  ): Promise<FileEntry[]> {
    const emitted: FileEntry[] = [];

    for (const item of items) {
      const relativePath = this.getOutputRelativePath(
        template.relativePath
          .replace("__state.className__", item.className)
          .replace("__transition.className__", item.className),
      );
      const absolutePath = FileHandler.join(PATHS.MATERIALIZED_TEMPLATES, ...relativePath.split(PATH_SEPARATOR));
      const content = await this.renderEjs(template.absolutePath, {
        ...context,
        [variableName]: item,
      });
      FileHandler.writeFile(absolutePath, content);
      emitted.push({ relativePath, absolutePath });
    }

    return emitted;
  }

  private isEjsTemplate(relativePath: string): boolean {
    return relativePath.endsWith(".ejs");
  }

  private isStateRepeatTemplate(relativePath: string): boolean {
    return relativePath.includes("__state.className__");
  }

  private isTransitionRepeatTemplate(relativePath: string): boolean {
    return relativePath.includes("__transition.className__");
  }

  private getOutputRelativePath(relativePath: string): string {
    if (!this.isEjsTemplate(relativePath)) return relativePath;
    return relativePath.slice(0, -".ejs".length);
  }

  private requireContext(context: TemplateRenderContext | {}): TemplateRenderContext {
    if (!("metadata" in context)) {
      throw new Error("[File Emitter] Repeat templates require a template render context.");
    }

    return context as TemplateRenderContext;
  }

  private renderEjs(templatePath: string, context: TemplateRenderContext | Record<string, unknown>): Promise<string> {
    return new Promise((resolve, reject) => {
      ejs.renderFile(templatePath, context, (error, content) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(content);
      });
    });
  }
}

export default FileEmitter;
