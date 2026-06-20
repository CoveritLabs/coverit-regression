// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import {
  ActionHookDefinition,
  AssertionDefinition,
  AssertionSeverity,
  DesignClassMapping,
  GeneratedFrameworkModel,
  HookTiming,
  Locator,
  StateDomMapping,
  TransitionActionMapping,
} from "./framework";
import type { GeneratedProjectConfig } from "./generator";

export interface TemplateRenderContext {
  model: GeneratedFrameworkModel;
  metadata: TemplateMetadata;
  helpers: TemplateRenderHelpers;
  config: GeneratedProjectConfig;
}

export interface TemplateRenderHelpers {
  ts(value: unknown): string;
}

export interface TemplateMetadata {
  stateInfo: Record<string, StateMetadata>;
  transitionInfo: Record<string, TransitionMetadata>;
  assertionInfo: Record<string, AssertionMetadata>;
  actionHookInfo: Record<string, ActionHookMetadata>;
  designClassInfo: DesignClassMapping;
  locators: LocatorMetadata;
  registry: RegistryMetadata;
  stateClasses: GeneratedStateClassMetadata[];
  transitionClasses: GeneratedTransitionClassMetadata[];
}

export interface StateMetadata {
  id: string;
  dbId: string;
  label: string;
  url: string;
  className: string;
  baselineDir?: string;
  snapshotPath?: string;
  dom?: StateDomMapping;
}

export interface TransitionMetadata {
  id: string;
  dbId: string;
  label: string;
  className: string;
  action: TransitionActionMapping;
}

export interface AssertionMetadata {
  id: string;
  dbId: string;
  label: string;
  targetId?: string;
  contextId?: string;
  severity?: AssertionSeverity;
  definition: AssertionDefinition;
}

export interface ActionHookMetadata {
  id: string;
  dbId: string;
  label: string;
  timing?: HookTiming;
  targetId?: string;
  contextId?: string;
  definition: ActionHookDefinition;
}

export interface LocatorMetadata {
  states: Record<string, Record<string, Locator>>;
  transitions: Record<string, TransitionLocatorMetadata>;
}

export interface TransitionLocatorMetadata {
  stateId?: string;
  locatorKey?: string;
  locator?: Locator;
}

export interface RegistryMetadata {
  states: Record<string, RegistryClassEntry>;
  transitions: Record<string, RegistryClassEntry>;
  assertions: Record<string, RegistryIdEntry>;
  actionHooks: Record<string, RegistryIdEntry>;
  designClass: RegistryIdEntry;
}

export interface RegistryClassEntry extends RegistryIdEntry {
  className: string;
}

export interface RegistryIdEntry {
  dbId: string;
}

export interface GeneratedStateClassMetadata {
  className: string;
  stateId: string;
}

export interface GeneratedTransitionClassMetadata {
  className: string;
  transitionId: string;
}
