// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import path from "path";
import fs from "fs";

import { PATH_SEPARATOR } from "@constants/common";
import { PATHS } from "@constants/paths";
import { FileEntry } from "@/types/files";

class FileHandler {
  static scanDirectory(root: string): FileEntry[] {
    const absoluteRoot = path.resolve(root);
    const fileEntries: FileEntry[] = [];

    if (!this.isDirectory(absoluteRoot)) return [];

    this.walkDirectory(absoluteRoot, absoluteRoot, fileEntries);
    return fileEntries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  static toRelativePath(absolutePath: string, root: string = PATHS.ROOT): string {
    return path.relative(root, absolutePath).split(path.sep).join(PATH_SEPARATOR);
  }

  static exists(absolutePath: string): boolean {
    return fs.existsSync(absolutePath);
  }

  static isDirectory(absolutePath: string): boolean {
    return this.exists(absolutePath) && fs.statSync(absolutePath).isDirectory();
  }

  static isFile(absolutePath: string): boolean {
    return this.exists(absolutePath) && fs.statSync(absolutePath).isFile();
  }

  static filterByExtension(fileEntries: FileEntry[], extension: string): FileEntry[] {
    return fileEntries.filter((entry) => entry.absolutePath.endsWith(extension));
  }

  static join(...segments: string[]): string {
    return path.join(...segments);
  }

  static readFile(absolutePath: string): string {
    if (!this.isFile(absolutePath)) return "";
    return fs.readFileSync(absolutePath, "utf-8");
  }

  private static walkDirectory(root: string, current: string, fileEntries: FileEntry[] = []): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        this.walkDirectory(root, absolutePath, fileEntries);
        continue;
      } else if (entry.isFile()) {
        fileEntries.push({
          relativePath: this.toRelativePath(absolutePath, root),
          absolutePath,
        });
      }
    }
  }
}

export default FileHandler;
