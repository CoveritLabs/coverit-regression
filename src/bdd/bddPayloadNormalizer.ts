// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import type { BddOutputPayload } from "@/types/worker";

export const DEFAULT_DESIGN_CLASS = {
  id: "scenarioData",
  label: "Scenario Data",
  description: "Single scenario data store for generated regression flows.",
  store: {},
  extracts: {},
  expressions: {},
  functions: {},
};

interface LocatorAliasContext {
  states: Record<string, unknown>;
  assertionElements: Record<string, { alias: string; stateId: string; attribute?: string }>;
  designElements: Record<string, { alias: string; stateId: string; attribute?: string }>;
  hookElements: Record<string, { alias: string; stateId: string; attribute?: string }>;
}

export function normalizeBddOutputPayload(payload: BddOutputPayload): BddOutputPayload {
  const aliases = buildLocatorAliases(payload);

  return {
    ...payload,
    states: aliases.states,
    assertions: buildAssertionsMapping(payload.assertions ?? {}, aliases),
    action_hooks: {},
    design_class: buildDesignClassMapping(payload),
  };
}

export function buildBddFormattingPayload(payload: BddOutputPayload): BddOutputPayload {
  const aliases = buildLocatorAliases(payload);

  return {
    ...payload,
    states: aliases.states,
    assertions: decorateAssertionsForFormatting(payload.assertions ?? {}, aliases),
    action_hooks: buildFormattingActionHooks(payload, aliases),
    design_class: buildFormattingDesignClass(payload, aliases),
  };
}

function buildLocatorAliases(payload: BddOutputPayload): LocatorAliasContext {
  const states = cloneRecord(payload.states);
  const usedByState = new Map<string, Set<string>>();
  const assertionElements: LocatorAliasContext["assertionElements"] = {};
  const designElements: LocatorAliasContext["designElements"] = {};
  const hookElements: LocatorAliasContext["hookElements"] = {};

  for (const stateId of Object.keys(states)) {
    const elements = stateElements(states[stateId]);
    usedByState.set(stateId, new Set(Object.keys(elements)));
  }

  for (const [id, rawValue] of Object.entries(payload.assertions ?? {})) {
    const record = asRecord(rawValue);
    const stateId = stringValue(record.stateId) || stringValue(asRecord(record.definition).stateId);
    const locator = locatorFromAssertion(record);
    if (!stateId || !locator) continue;

    const alias = addStateLocator(states, usedByState, stateId, `E_${safeAliasPart(id)}`, locator);
    assertionElements[id] = {
      alias,
      stateId,
      attribute: assertionAttribute(asRecord(record.definition)),
    };
  }

  for (const [id, rawValue] of Object.entries(payload.design_classes ?? {})) {
    const record = asRecord(rawValue);
    const definition = asRecord(record.definition);
    const value = asRecord(definition.value);
    if (value.source !== "element") continue;

    const stateId = stringValue(record.stateId) || stringValue(definition.stateId);
    const locator = locatorFromElementValue(value, record);
    if (!stateId || !locator) continue;

    const token = stripToken(stringValue(value.token));
    const alias = addStateLocator(
      states,
      usedByState,
      stateId,
      compactAlias(["E", id, token].map(safeAliasPart)),
      locator,
    );
    designElements[id] = {
      alias,
      stateId,
      attribute: stringValue(value.attribute) || "text",
    };
  }

  for (const [id, rawValue] of Object.entries(payload.action_hooks ?? {})) {
    const record = asRecord(rawValue);
    const definition = asRecord(record.definition);
    const locator = locatorFromHook(record);
    if (!locator) continue;

    const stateId = stringValue(record.stateId) || stringValue(definition.stateId);
    if (!stateId) continue;

    const token = stripToken(stringValue(asRecord(definition.value).token));
    const alias = addStateLocator(
      states,
      usedByState,
      stateId,
      compactAlias(["E", id, token].map(safeAliasPart)),
      locator,
    );
    hookElements[id] = {
      alias,
      stateId,
      attribute: stringValue(asRecord(definition.value).attribute) || stringValue(definition.attribute) || "text",
    };
  }

  return { states, assertionElements, designElements, hookElements };
}

function buildAssertionsMapping(
  records: Record<string, unknown>,
  aliases: LocatorAliasContext,
): Record<string, unknown> {
  const elements: Record<string, unknown> = {};
  const functions: Record<string, unknown> = {};

  for (const [id, rawValue] of Object.entries(records)) {
    const record = asRecord(rawValue);
    const definition = asRecord(record.definition);
    const type = stringValue(definition.type);

    const element = aliases.assertionElements[id];
    if (element) {
      elements[element.alias] = {
        stateId: element.stateId,
        locatorKey: element.alias,
        attribute: element.attribute,
      };
    }

    if (type === "function" || type === "user-assertion" || definition.code) {
      const functionId = stringValue(definition.functionId) || id;
      functions[functionId] = compactRecord({
        implementationId: functionId,
        code: definition.code,
        input: definition.input,
        output: definition.output,
        severity: record.severity,
        description: definition.description,
      });
    }
  }

  return compactRecord({ elements, functions });
}

function buildDesignClassMapping(payload: BddOutputPayload): Record<string, unknown> {
  const current = asRecord(payload.design_class);
  const functions = { ...asRecord(current.functions) };

  for (const [id, rawValue] of Object.entries(payload.design_classes ?? {})) {
    const definition = asRecord(asRecord(rawValue).definition);
    const type = stringValue(definition.type);
    if (type !== "function" && type !== "hook-function" && !definition.code) continue;

    const functionId = stringValue(definition.functionId) || id;
    functions[functionId] = compactRecord({
      ...asRecord(functions[functionId]),
      implementationId: functionId,
      code: definition.code,
      input: definition.input,
      output: definition.output,
      description: definition.description,
    });
  }

  return compactRecord({
    ...DEFAULT_DESIGN_CLASS,
    ...current,
    functions,
    operations: undefined,
    assertionFunctions: undefined,
  });
}

function decorateAssertionsForFormatting(
  records: Record<string, unknown>,
  aliases: LocatorAliasContext,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(records).map(([id, rawValue]) => {
      const alias = aliases.assertionElements[id];
      if (!alias) return [id, rawValue];

      const record = asRecord(rawValue);
      const definition = asRecord(record.definition);
      return [
        id,
        {
          ...record,
          definition: {
            ...definition,
            locatorKey: alias.alias,
            stateId: alias.stateId,
            elementAlias: alias.alias,
          },
          elementAlias: alias.alias,
        },
      ];
    }),
  );
}

function buildFormattingActionHooks(
  payload: BddOutputPayload,
  aliases: LocatorAliasContext,
): Record<string, unknown> {
  const actionHooks: Record<string, unknown> = {};

  for (const [id, rawValue] of Object.entries(payload.action_hooks ?? {})) {
    const alias = aliases.hookElements[id];
    const record = asRecord(rawValue);
    const definition = asRecord(record.definition);
    actionHooks[id] = {
      ...record,
      id,
      timing: timingFromRecord(record),
      targetId: targetTransitionId(record, payload.transitions),
      definition: decorateHookDefinitionForFormatting(definition, alias),
    };
  }

  for (const [id, rawValue] of Object.entries(payload.design_classes ?? {})) {
    const record = asRecord(rawValue);
    const definition = asRecord(record.definition);
    const operation = toFormattingDesignOperation(id, definition, aliases.designElements[id]);
    if (!operation) continue;

    actionHooks[id] = {
      id,
      label: stringValue(record.label) || id,
      timing: timingFromRecord(record),
      targetId: targetTransitionId(record, payload.transitions),
      contextId: stringValue(record.stateId) || undefined,
      definition: {
        type: "design-operation",
        operationId: id,
      },
    };
  }

  return actionHooks;
}

function buildFormattingDesignClass(payload: BddOutputPayload, aliases: LocatorAliasContext): Record<string, unknown> {
  const designClass = buildDesignClassMapping(payload);
  const operations: Record<string, unknown> = {};

  for (const [id, rawValue] of Object.entries(payload.design_classes ?? {})) {
    const operation = toFormattingDesignOperation(id, asRecord(asRecord(rawValue).definition), aliases.designElements[id]);
    if (operation) operations[id] = operation;
  }

  return {
    ...designClass,
    operations,
  };
}

function decorateHookDefinitionForFormatting(
  definition: Record<string, unknown>,
  element?: { alias: string; stateId: string; attribute?: string },
): Record<string, unknown> {
  if (!element) return definition;

  const value = asRecord(definition.value);
  const decoratedValue =
    value.source === "element"
      ? {
          ...value,
          id: element.alias,
          token: undefined,
          selector: undefined,
          locatorKey: element.alias,
          stateId: element.stateId,
          attribute: element.attribute,
        }
      : definition.value;

  return {
    ...definition,
    locatorKey: element.alias,
    stateId: element.stateId,
    elementAlias: element.alias,
    value: decoratedValue,
  };
}

function toFormattingDesignOperation(
  id: string,
  definition: Record<string, unknown>,
  element?: { alias: string; stateId: string; attribute?: string },
): Record<string, unknown> | undefined {
  const type = stringValue(definition.type);

  if (type === "function" || type === "hook-function" || definition.code) {
    return {
      type: "call-function",
      functionId: stringValue(definition.functionId) || id,
      args: definition.args,
    };
  }

  if (!type) return undefined;
  const value = asRecord(definition.value);
  return {
    ...definition,
    value:
      value.source === "element" && element
        ? {
            ...value,
            id: element.alias,
            token: undefined,
            selector: undefined,
            locatorKey: element.alias,
            stateId: element.stateId,
            attribute: element.attribute,
          }
        : definition.value,
  };
}

function addStateLocator(
  states: Record<string, unknown>,
  usedByState: Map<string, Set<string>>,
  stateId: string,
  preferredAlias: string,
  locator: Record<string, unknown>,
): string {
  const state = asRecord(states[stateId]);
  const dom = asRecord(state.dom);
  const elements = { ...asRecord(dom.elements) };
  const used = usedByState.get(stateId) ?? new Set<string>(Object.keys(elements));
  const alias = uniqueAlias(preferredAlias, used, elements, locator);

  elements[alias] = locator;
  used.add(alias);
  usedByState.set(stateId, used);
  states[stateId] = {
    ...state,
    dom: {
      ...dom,
      elements,
    },
  };
  return alias;
}

function uniqueAlias(
  preferredAlias: string,
  used: Set<string>,
  elements: Record<string, unknown>,
  locator: Record<string, unknown>,
): string {
  const base = preferredAlias || "E_ELEMENT";
  if (!used.has(base) || sameLocator(asRecord(elements[base]), locator)) return base;

  let suffix = 2;
  while (used.has(`${base}_${suffix}`) && !sameLocator(asRecord(elements[`${base}_${suffix}`]), locator)) suffix += 1;
  return `${base}_${suffix}`;
}

function locatorFromAssertion(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const definition = asRecord(record.definition);
  if (stringValue(definition.type) !== "element") return undefined;
  return firstLocator(definition.locator, definition.locatorKey, record.element);
}

function locatorFromHook(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const definition = asRecord(record.definition);
  return firstLocator(definition.locator, definition.locatorKey, record.element, asRecord(definition.value));
}

function locatorFromElementValue(value: Record<string, unknown>, record: Record<string, unknown>): Record<string, unknown> | undefined {
  return firstLocator(value.locator, value.selector, record.element);
}

function firstLocator(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return { cssSelector: value.trim() };

    const record = asRecord(value);
    if (record.cssSelector || record.xpath || record.testId || record.text || record.role || record.id || record.className) return compactRecord(record);
    if (typeof record.selector === "string" && record.selector.trim()) return { cssSelector: record.selector.trim() };
  }
  return undefined;
}

function stateElements(value: unknown): Record<string, unknown> {
  return asRecord(asRecord(asRecord(value).dom).elements);
}

function assertionAttribute(definition: Record<string, unknown>): string {
  const assertion = stringValue(definition.assertion);
  if (assertion === "value") return "value";
  if (assertion === "attribute") return stringValue(definition.attributeName) || "attribute";
  return "text";
}

function timingFromRecord(record: Record<string, unknown>): "pre" | "post" | undefined {
  const timing = stringValue(record.timing);
  if (timing === "pre" || timing === "post") return timing;

  const edge = stringValue(asRecord(record.position).edge);
  if (edge === "before") return "pre";
  if (edge === "after") return "post";
  return undefined;
}

function targetTransitionId(
  record: Record<string, unknown>,
  transitions: Record<string, unknown>,
): string | undefined {
  const directTransitionId = stringValue(record.transitionId);
  if (directTransitionId) return directTransitionId;

  const positionedTransitionId = stringValue(asRecord(record.position).transitionId);
  if (!positionedTransitionId) return undefined;
  return transitions[positionedTransitionId] ? positionedTransitionId : undefined;
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function sameLocator(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(compactRecord(left)) === JSON.stringify(compactRecord(right));
}

function compactAlias(parts: string[]): string {
  return parts.filter(Boolean).join("_") || "E_ELEMENT";
}

function safeAliasPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^\{\{\s*(.+?)\s*\}\}$/, "$1")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function stripToken(value: string): string {
  return value.trim().match(/^\{\{\s*(.+?)\s*\}\}$/)?.[1] ?? value.trim();
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
