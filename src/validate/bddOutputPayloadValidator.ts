// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { BddOutputPayload } from "@/types/worker";

class BddOutputPayloadValidator {
  parse(data: unknown): BddOutputPayload {
    if (!this.isRecord(data)) throw new Error("[Worker] BDD payload must be an object.");

    const payload = data as Record<string, unknown>;
    return {
      status: typeof payload.status === "string" ? payload.status : undefined,
      session_id: this.requireString(payload, "session_id"),
      feature_name: this.requireString(payload, "feature_name"),
      feature_text: this.requireString(payload, "feature_text"),
      states: this.requireRecord(payload, "states"),
      transitions: this.requireRecord(payload, "transitions"),
      assertions: this.optionalRecord(payload, "assertions") ?? {},
      action_hooks: this.optionalRecord(payload, "action_hooks") ?? {},
      design_class: this.optionalRecord(payload, "design_class"),
      flow_ids: this.optionalStringArray(payload, "flow_ids"),
      regression_codebase_id: this.optionalString(payload, "regression_codebase_id"),
      codegen_config: this.optionalRecord(payload, "codegen_config") as BddOutputPayload["codegen_config"],
    };
  }

  private requireString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`[Worker] BDD payload is missing required string field "${key}".`);
    }
    return value;
  }

  private requireRecord(payload: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = this.optionalRecord(payload, key);
    if (!value) throw new Error(`[Worker] BDD payload is missing required object field "${key}".`);
    return value;
  }

  private optionalRecord(payload: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = payload[key];
    return this.isRecord(value) ? value : undefined;
  }

  private optionalString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private optionalStringArray(payload: Record<string, unknown>, key: string): string[] | undefined {
    const value = payload[key];
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

export default BddOutputPayloadValidator;
