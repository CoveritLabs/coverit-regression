// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { FileOwnershipMode } from "./files";

export interface GenerationRecordFile {
  hash: string;
  mode: FileOwnershipMode;
}

export interface GenerationRecord {
  version: 1;
  files: Record<string, GenerationRecordFile>;
  snapshots: Record<string, string>;
}

