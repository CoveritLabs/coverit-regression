// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import {
  ActionHookDefinition,
  AssertionDefinition,
  AssertionSeverity,
  DesignClassMapping,
  HookTiming,
  Locator,
  StateDomMapping,
  TransitionActionMapping,
} from "./framework";

export interface OverwritableMetadata {
  overwritable?: boolean;
}

export interface StateMetadata extends OverwritableMetadata {
  id: string;
  dbId?: string;
  label: string;
  url: string;
  className: string;
  baselineDir?: string;
  snapshotPath?: string;
  dom?: StateDomMapping;
}

export interface TransitionMetadata extends OverwritableMetadata {
  id: string;
  dbId?: string;
  label: string;
  className: string;
  action: TransitionActionMapping;
}

export interface AssertionMetadata extends OverwritableMetadata {
  id: string;
  dbId?: string;
  label: string;
  targetId?: string;
  contextId?: string;
  severity?: AssertionSeverity;
  definition: AssertionDefinition;
}

export interface ActionHookMetadata extends OverwritableMetadata {
  id: string;
  dbId?: string;
  label: string;
  timing?: HookTiming;
  targetId?: string;
  contextId?: string;
  definition: ActionHookDefinition;
}

export interface DesignClassMetadata
  extends Omit<DesignClassMapping, "dbId" | "overwritable">,
    OverwritableMetadata {
  dbId?: string;
}

export interface LocatorMetadata {
  states: Record<string, StateLocatorMetadata>;
  transitions: Record<string, TransitionLocatorMetadata>;
}

export interface StateLocatorMetadata extends OverwritableMetadata {
  [locatorKey: string]: Locator | boolean | undefined;
}

export interface TransitionLocatorMetadata extends OverwritableMetadata {
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

export interface RegistryIdEntry extends OverwritableMetadata {
  dbId?: string;
}

export interface GeneratedStateClassMetadata {
  className: string;
  stateId: string;
}

export interface GeneratedTransitionClassMetadata {
  className: string;
  transitionId: string;
}
