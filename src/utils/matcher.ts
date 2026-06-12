// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { PATH_SEPARATOR } from "@constants/common";

class Matcher {
  static matches(pattern: string, relativePath: string): boolean {
    const normalizedPattern = this.normalize(pattern);
    const normalizedPath = this.normalize(relativePath);

    if (normalizedPattern === normalizedPath) return true;
    if (normalizedPattern.includes("*")) {
      return this.toRegExp(normalizedPattern).test(normalizedPath);
    }

    if (normalizedPattern.endsWith("/**")) {
      const prefix = normalizedPattern.slice(0, -3);
      return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
    }

    if (normalizedPattern.endsWith("/*")) {
      const prefix = normalizedPattern.slice(0, -2);
      if (!normalizedPath.startsWith(`${prefix}/`)) return false;
      return !normalizedPath.slice(prefix.length + 1).includes(PATH_SEPARATOR);
    }

    return false;
  }

  private static normalize(value: string): string {
    return value.replace(/\\/g, PATH_SEPARATOR).replace(/^.\//, "");
  }

  private static toRegExp(pattern: string): RegExp {
    let regex = "";

    for (let index = 0; index < pattern.length; index += 1) {
      const character = pattern[index];
      const next = pattern[index + 1];

      if (character === "*" && next === "*") {
        regex += ".*";
        index += 1;
        continue;
      }

      if (character === "*") {
        regex += "[^/]*";
        continue;
      }

      regex += this.escapeRegExp(character);
    }

    return new RegExp(`^${regex}$`);
  }

  private static escapeRegExp(character: string): string {
    return /[.+?^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
  }
}

export default Matcher;
