import { StepType } from "./feature";

export enum AssertionSeverity {
  BLOCKING = "blocking",
  WARNING = "warning",
  INFO = "info",
}

export enum HookTiming {
  PRE = "pre",
  POST = "post",
}

export enum UtilityHookAction {
  WAIT = "wait",
  REFRESH = "refresh",
  RELOAD = "reload",
}

export enum ElementInteractionAction {
  CLICK = "click",
  FILL = "fill",
  HOVER = "hover",
  SELECT = "select",
  CHECK = "check",
  UNCHECK = "uncheck",
}

export enum ExtractSource {
  TEXT = "text",
  ATTRIBUTE = "attribute",
  VALUE = "value",
  LIST = "list",
}

export enum ValueType {
  STRING = "string",
  NUMBER = "number",
  CURRENCY = "currency",
  BOOLEAN = "boolean",
}

export enum DesignOperationType {
  SET = "set",
  APPEND = "append",
  PUT_MAP = "putMap",
  ASSERT_EXPRESSION = "assert-expression",
  CALL_FUNCTION = "call-function",
}

export interface Locator {
  id?: string;
  className?: string;
  cssSelector?: string;
  xpath?: string;
  text?: string;
  role?: string;
  testId?: string;
}

export interface FrameworkMappingFileSet {
  states: Record<string, StateStepMapping>;
  transitions: Record<string, TransitionStepMapping>;
  assertions: Record<string, AssertionStepMapping>;
  actionHooks: Record<string, ActionHookStepMapping>;
  designClass: DesignClassMapping;
}

export interface GeneratedFrameworkModel {
  states: StateStepMapping[];
  transitions: TransitionStepMapping[];
  assertions: AssertionStepMapping[];
  actionHooks: ActionHookStepMapping[];
  designClass: DesignClassMapping;
}

export type FrameworkStepMapping =
  | StateStepMapping
  | TransitionStepMapping
  | AssertionStepMapping
  | ActionHookStepMapping;

export interface BaseStepMapping {
  id: string;
  dbId?: string;
  label?: string;
  description?: string;
}

export interface StateStepMapping extends BaseStepMapping {
  type: StepType.STATE;
  url: string;
  className: string;
  baselineDir?: string;
  snapshotPath?: string;
  dom?: StateDomMapping;
}

export interface StateDomMapping {
  root?: Locator;
  landmarks?: Record<string, Locator>;
  elements?: Record<string, Locator>;
}

export interface TransitionStepMapping extends BaseStepMapping {
  type: StepType.TRANSITION;
  className: string;
  action: TransitionActionMapping;
}

export interface TransitionActionMapping {
  type: string;
  stateId?: string;
  locatorKey?: string;
  locator?: Locator;
  value?: string;
  url?: string;
}

export interface AssertionStepMapping extends BaseStepMapping {
  type: StepType.ASSERTION;
  targetId?: string;
  contextId?: string;
  severity?: AssertionSeverity;
  definition: AssertionDefinition;
}

export type AssertionDefinition =
  | ElementAssertionDefinition
  | PageAssertionDefinition
  | StateAssertionDefinition
  | DesignOperationCallDefinition
  | UserAssertionFunctionCallDefinition;

export type ElementAssertionDefinition =
  | {
      type: "element";
      assertion: "text";
      stateId?: string;
      locatorKey?: string;
      locator?: Locator;
      expectedText: string;
    }
  | {
      type: "element";
      assertion: "visibility";
      stateId?: string;
      locatorKey?: string;
      locator?: Locator;
      visible: boolean;
    }
  | {
      type: "element";
      assertion: "attribute";
      stateId?: string;
      locatorKey?: string;
      locator?: Locator;
      attributeName: string;
      expectedValue: string;
    }
  | {
      type: "element";
      assertion: "value";
      stateId?: string;
      locatorKey?: string;
      locator?: Locator;
      expectedValue: string;
    };

export type PageAssertionDefinition =
  | { type: "page"; assertion: "title"; expectedText: string }
  | { type: "page"; assertion: "url"; expectedUrl: string }
  | { type: "page"; assertion: "url-fragment"; expectedFragment: string };

export type StateAssertionDefinition =
  | { type: "state"; assertion: "dom-hash"; stateId: string }
  | { type: "state"; assertion: "screenshot"; stateId: string };

export interface DesignOperationCallDefinition {
  type: "design-operation";
  operationId: string;
  args?: Record<string, unknown>;
}

export interface UserAssertionFunctionCallDefinition {
  type: "user-assertion";
  functionId: string;
  args?: Record<string, unknown>;
}

export interface ActionHookStepMapping extends BaseStepMapping {
  type: StepType.ACTION_HOOK;
  timing?: HookTiming;
  targetId?: string;
  contextId?: string;
  definition: ActionHookDefinition;
}

export type ActionHookDefinition =
  | ElementInteractionHookDefinition
  | UtilityHookDefinition
  | ExtractActionHookDefinition
  | DesignOperationCallDefinition;

export interface ElementInteractionHookDefinition {
  type: "element-interaction";
  action: ElementInteractionAction;
  stateId?: string;
  locatorKey?: string;
  locator?: Locator;
  value?: string;
}

export interface UtilityHookDefinition {
  type: "utility";
  action: UtilityHookAction;
  durationMs?: number;
}

export interface ExtractActionHookDefinition {
  type: "extract";
  extractId: string;
  storeKey: string;
}

export interface DesignClassMapping {
  id: string;
  dbId?: string;
  label?: string;
  description?: string;
  store?: Record<string, DesignStoreSlot>;
  extracts?: Record<string, DesignExtractDefinition>;
  expressions?: Record<string, DesignExpressionDefinition>;
  functions?: Record<string, DesignFunctionDefinition>;
  assertionFunctions?: Record<string, UserAssertionFunctionDefinition>;
  operations?: Record<string, DesignOperationDefinition>;
}

export interface DesignStoreSlot {
  initialValue?: unknown;
  description?: string;
}

export interface DesignExtractDefinition {
  stateId?: string;
  locatorKey?: string;
  locator?: Locator;
  source: ExtractSource;
  attributeName?: string;
  valueType?: ValueType;
  itemFields?: Record<string, Omit<DesignExtractDefinition, "itemFields">>;
  description?: string;
}

export interface DesignExpressionDefinition {
  expression: string;
  description?: string;
}

export interface DesignFunctionDefinition {
  implementationId: string;
  input?: unknown;
  output?: unknown;
  description?: string;
}

export interface UserAssertionFunctionDefinition {
  implementationId: string;
  severity?: AssertionSeverity;
  description?: string;
}

export type DesignStoreValueSpec =
  | { from: string }
  | { literal: unknown }
  | { expressionId: string }
  | { functionId: string; args?: Record<string, unknown> }
  | { fields: Record<string, DesignStoreValueSpec> };

export type DesignOperationDefinition =
  | {
      type: DesignOperationType.SET;
      key: string;
      value: DesignStoreValueSpec;
      description?: string;
    }
  | {
      type: DesignOperationType.APPEND;
      key: string;
      value: DesignStoreValueSpec;
      description?: string;
    }
  | {
      type: DesignOperationType.PUT_MAP;
      key: string;
      mapKey: DesignStoreValueSpec;
      value: DesignStoreValueSpec;
      description?: string;
    }
  | {
      type: DesignOperationType.ASSERT_EXPRESSION;
      expressionId: string;
      severity?: AssertionSeverity;
      description?: string;
    }
  | {
      type: DesignOperationType.CALL_FUNCTION;
      functionId: string;
      args?: Record<string, unknown>;
      assignTo?: string;
      description?: string;
    };
