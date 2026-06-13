// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import crypto from "crypto";

export function hashText(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

