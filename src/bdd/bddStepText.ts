// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

export interface BddStepTextMappings {
  assertions?: Record<string, unknown>;
  actionHooks?: Record<string, unknown>;
  designClass?: Record<string, unknown>;
}

type StepKind = "assertion" | "actionHook";

interface AliasIndex {
  byId: Map<string, string>;
  byText: Map<string, string>;
}

interface FormatValueOptions {
  fallbackElementId?: string;
}

const OPERATION_TYPES = new Set([
  "set",
  "append",
  "prepend",
  "merge",
  "remove",
  "pop",
  "increment",
  "decrement",
  "toggle",
  "delete",
  "clear",
  "putMap",
  "assert-expression",
  "call-function",
]);

export class BddStepTextResolver {
  private readonly assertionAliases: AliasIndex;
  private readonly actionHookAliases: AliasIndex;

  constructor(private readonly mappings: BddStepTextMappings) {
    this.assertionAliases = this.buildAliases("assertion", mappings.assertions ?? {});
    this.actionHookAliases = this.buildAliases("actionHook", mappings.actionHooks ?? {});
  }

  formatAssertion(id: string): string | undefined {
    return this.assertionAliases.byId.get(id);
  }

  formatActionHook(id: string): string | undefined {
    return this.actionHookAliases.byId.get(id);
  }

  getActionHookTiming(id: string): "pre" | "post" | undefined {
    const timing = stringValue(asRecord(this.mappings.actionHooks?.[id]).timing);
    if (timing === "pre" || timing === "post") return timing;
    return undefined;
  }

  resolveAssertion(text: string): string | undefined {
    return this.resolve(text, this.assertionAliases, this.mappings.assertions ?? {});
  }

  resolveActionHook(text: string): string | undefined {
    return this.resolve(text, this.actionHookAliases, this.mappings.actionHooks ?? {});
  }

  private buildAliases(kind: StepKind, records: Record<string, unknown>): AliasIndex {
    const baseById = new Map<string, string>();
    const idsByBaseText = new Map<string, string[]>();

    for (const [id, value] of Object.entries(records)) {
      const text = kind === "assertion" ? this.formatAssertionBase(id, value) : this.formatActionHookBase(id, value);
      if (!text) continue;
      baseById.set(id, text);
      idsByBaseText.set(text, [...(idsByBaseText.get(text) ?? []), id]);
    }

    const byId = new Map<string, string>();
    const byText = new Map<string, string>();
    for (const [id, baseText] of baseById.entries()) {
      const ids = idsByBaseText.get(baseText) ?? [];
      const preferredId = preferredAliasId(ids);
      byId.set(id, baseText);
      byText.set(normalizeStepText(`${baseText} using ${quote(id)}`), id);
      if (ids.length === 1 || preferredId === id) byText.set(normalizeStepText(baseText), id);
    }

    return { byId, byText };
  }

  private resolve(text: string, aliases: AliasIndex, records: Record<string, unknown>): string | undefined {
    const normalized = normalizeStepText(text);
    const explicitId = extractUsingId(normalized);
    if (explicitId && records[explicitId]) return explicitId;
    return aliases.byText.get(normalized);
  }

  private formatAssertionBase(id: string, value: unknown): string | undefined {
    const record = asRecord(value);
    const definition = asRecord(record.definition);
    const type = stringValue(definition.type);

    if (type === "function" || type === "user-assertion") {
      return `call ${quote(stringValue(definition.functionId) || id)}`;
    }

    if (type === "design-operation") {
      const operationId = stringValue(definition.operationId);
      const operation = operationId ? asRecord(asRecord(this.mappings.designClass?.operations)[operationId]) : undefined;
      return this.formatDesignOperation(operationId || id, operation) ?? `assert ${quote(operationId || id)}`;
    }

    if (type === "page") {
      const assertion = stringValue(definition.assertion) || "page";
      const expected = firstDefined(definition.expected, definition.expectedText, definition.expectedUrl, definition.expectedFragment);
      return compactParts(["assert page", assertion, formatValue(expected)]);
    }

    if (type === "state") {
      return compactParts(["assert state", stringValue(definition.assertion) || quote(id)]);
    }

    const assertion = stringValue(definition.assertion) || "exists";
    const expected = assertionNeedsExpected(assertion) ? firstDefined(definition.expected, definition.expectedText, definition.expectedValue, definition.expectedCount) : undefined;

    if (type === "variable" || isStoreValue(definition.target)) {
      return compactParts(["assert", formatValue(definition.target), assertion, formatValue(expected)]);
    }

    if (type === "element" || definition.locator || definition.locatorKey) {
      return compactParts(["assert", elementAssertionRef(id, record, definition, assertion), assertion, formatValue(expected)]);
    }

    return record.label ? `assert ${quote(id)}` : undefined;
  }

  private formatActionHookBase(id: string, value: unknown): string | undefined {
    const record = asRecord(value);
    const definition = asRecord(record.definition);
    const type = stringValue(definition.type);

    if (type === "utility") {
      const action = stringValue(definition.action) || "wait";
      if (action === "wait") return compactParts(["wait", formatValue(definition.durationMs)]);
      if (action === "wait-for-url") return compactParts(["wait-for-url", formatValue(definition.url)]);
      if (action === "wait-for-load-state") return compactParts(["wait-for-load-state", formatValue(definition.loadState)]);
      return action;
    }

    if (type === "element-interaction") {
      const action = stringValue(definition.action) || "click";
      return compactParts([
        action,
        elementRef({ elementAlias: definition.elementAlias || definition.locatorKey }, generatedElementId(id)),
        formatValue(definition.value, { fallbackElementId: generatedElementId(id) }),
      ]);
    }

    if (type === "extract") {
      return compactParts(["assign", quote(stringValue(definition.extractId) || id), "to", variableRef(stringValue(definition.storeKey) || id)]);
    }

    if (type === "design-operation") {
      const operationId = stringValue(definition.operationId);
      const operation = operationId ? asRecord(asRecord(this.mappings.designClass?.operations)[operationId]) : undefined;
      return this.formatDesignOperation(operationId || id, operation);
    }

    if (OPERATION_TYPES.has(type)) return this.formatDesignOperation(id, definition);

    if (type === "function" || type === "hook-function") return `call ${quote(stringValue(definition.functionId) || id)}`;

    return record.label ? `call ${quote(id)}` : undefined;
  }

  private formatDesignOperation(operationId: string, operation: Record<string, unknown> | undefined): string | undefined {
    if (!operation) return undefined;
    const type = stringValue(operation.type);
    if (!type) return undefined;

    const valueOptions = { fallbackElementId: generatedElementId(operationId) };

    if (type === "set") return compactParts(["assign", formatValue(operation.value, valueOptions), "to", variableRef(stringValue(operation.key) || operationId)]);
    if (type === "append") return compactParts(["append", formatValue(operation.value, valueOptions), "to", variableRef(stringValue(operation.key) || operationId)]);
    if (type === "putMap") {
      return compactParts([
        "put",
        formatValue(operation.value, valueOptions),
        "into",
        `${variableRef(stringValue(operation.key) || operationId)}[${formatValue(operation.mapKey, valueOptions) ?? "key"}]`,
      ]);
    }
    if (type === "assert-expression") return compactParts(["assert", variableRef(stringValue(operation.expressionId) || operationId)]);
    if (type === "call-function") {
      const call = `call ${quote(stringValue(operation.functionId) || operationId)}`;
      const assignTo = stringValue(operation.assignTo);
      return assignTo ? compactParts(["assign", call, "to", variableRef(assignTo)]) : call;
    }

    const key = stringValue(operation.key);
    if (key) return compactParts([type, formatValue(operation.value, valueOptions), "to", variableRef(key)]);
    return `${type} ${quote(operationId)}`;
  }
}

export function normalizeStepText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function extractUsingId(text: string): string | undefined {
  return text.match(/\susing\s'((?:\\'|[^'])+)'$/)?.[1]?.replace(/\\'/g, "'");
}

function compactParts(parts: Array<string | undefined>): string | undefined {
  const compacted = parts.filter((part): part is string => Boolean(part && part.trim()));
  return compacted.length ? compacted.join(" ") : undefined;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isStoreValue(value: unknown): boolean {
  const record = asRecord(value);
  return record.source === "store" && typeof record.path === "string";
}

function assertionNeedsExpected(assertion: string): boolean {
  return !["exists", "visibility", "enabled", "disabled", "checked", "unchecked", "editable", "focused"].includes(assertion);
}

function formatValue(value: unknown, options: FormatValueOptions = {}): string | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value);

  if ("literal" in record) return formatLiteral(record.literal);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return formatLiteral(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null) return "null";

  if (typeof record.from === "string") return variableRef(record.from);
  if (record.source === "extract" && typeof record.id === "string") return variableRef(record.id);
  if ((record.source === "store" || record.source === "arg" || record.source === "context" || record.source === "env") && typeof record.path === "string") {
    return variableRef(record.path);
  }
  if (record.source === "element") return elementRef(record, options.fallbackElementId);
  if (typeof record.expressionId === "string") return variableRef(record.expressionId);
  if (typeof record.functionId === "string") return `call ${quote(record.functionId)}`;
  if (isRecordMap(record.fields)) {
    return `{ ${Object.entries(record.fields).map(([key, child]) => `${key}: ${formatValue(child) ?? "undefined"}`).join(", ")} }`;
  }
  if (Array.isArray(record.list)) return `[${record.list.map((item) => formatValue(item) ?? "undefined").join(", ")}]`;

  return undefined;
}

function isRecordMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementAssertionRef(
  id: string,
  record: Record<string, unknown>,
  definition: Record<string, unknown>,
  assertion: string,
): string {
  const value = firstElementValue(definition.value, definition.target, definition.element, record.element);
  const attribute =
    stringValue(value.attribute) ||
    stringValue(definition.attribute) ||
    stringValue(definition.attributeName) ||
    attributeForAssertion(assertion);

  return elementRef({ ...value, elementAlias: definition.elementAlias || record.elementAlias, attribute }, generatedElementId(id));
}

function firstElementValue(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    const record = asRecord(value);
    if (record.source === "element" || record.token || record.id || record.selector || record.attribute) return record;
  }
  return {};
}

function attributeForAssertion(assertion: string): string {
  if (assertion === "value") return "value";
  if (assertion === "attribute") return "attribute";
  return "text";
}

function generatedElementId(ownerId: string): string {
  return ownerId.startsWith("E_") ? ownerId : `E_${ownerId}`;
}

function elementRef(value: Record<string, unknown>, fallbackElementId?: string): string {
  const alias = stringValue(value.elementAlias) || stringValue(value.alias) || stringValue(value.id);
  const token = stripToken(stringValue(value.token));
  const tokenAlias = fallbackElementId && token ? `${fallbackElementId}_${safeAliasPart(token)}` : "";
  const selectorAlias = fallbackElementId || stringValue(value.selector) || "element";
  const tokenOrAlias = alias || tokenAlias || token || selectorAlias;
  const attribute = stringValue(value.attribute) || "text";
  return `${quote(tokenOrAlias)}.${attribute}`;
}

function stripToken(value: string): string {
  const token = value.trim().match(/^\{\{\s*(.+?)\s*\}\}$/)?.[1];
  return token ?? value.trim();
}

function preferredAliasId(ids: string[]): string | undefined {
  const semanticIds = ids.filter((id) => !isUuid(id));
  return semanticIds.length === 1 ? semanticIds[0] : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeAliasPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function variableRef(value: string): string {
  return `{{ ${value.trim()} }}`;
}

function formatLiteral(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value === null) return "null";
  return quote(JSON.stringify(value));
}

function quote(value: unknown): string {
  return `'${String(value).replace(/'/g, "\\'")}'`;
}
