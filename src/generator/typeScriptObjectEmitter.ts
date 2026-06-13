// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

class TypeScriptObjectEmitter {
  emit(value: unknown, indent = 0): string {
    const spacing = " ".repeat(indent);
    const childSpacing = " ".repeat(indent + 2);

    if (value === null || typeof value !== "object") return JSON.stringify(value);

    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      return `[\n${value.map((item) => `${childSpacing}${this.emit(item, indent + 2)}`).join(",\n")}\n${spacing}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return "{}";

    return `{\n${entries
      .map(([key, entryValue]) => `${childSpacing}${this.propertyName(key)}: ${this.emit(entryValue, indent + 2)}`)
      .join(",\n")}\n${spacing}}`;
  }

  private propertyName(key: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
  }
}

export default TypeScriptObjectEmitter;
