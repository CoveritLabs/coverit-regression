// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileOwnershipMode } from "./files";

export interface ManifestFileRule {
  path: string;
  mode: FileOwnershipMode;
  createIfMissing?: boolean;
  description?: string;
}

export interface Manifest {
  templateVersion: string;
  include: string[];
  exclude: string[];
  files: ManifestFileRule[];
}
