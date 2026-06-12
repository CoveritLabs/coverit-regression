// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

export enum FileOperationKind {
  Create = "create",
  Update = "update",
  Unchanged = "unchanged",
  Preserve = "preserve",
  Conflict = "conflict",
}

export enum FileOwnershipMode {
  Static = "static",
  Dynamic = "dynamic",
  UserExtension = "user-extension",
}

export interface FileEntry {
  relativePath: string;
  absolutePath: string;
}

export interface FileOperation {
  kind: FileOperationKind;
  mode: FileOwnershipMode;
  sourcePath: string;
  targetPath: string;
  reason: string;
}
