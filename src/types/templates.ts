// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { GeneratedFrameworkModel } from "./framework";
import type { GeneratedProjectConfig } from "./generator";
import type {
  ActionHookMetadata,
  AssertionMetadata,
  DesignClassMetadata,
  GeneratedStateClassMetadata,
  GeneratedTransitionClassMetadata,
  InlineCodeMetadata,
  LocatorMetadata,
  RegistryMetadata,
  StateMetadata,
  TransitionMetadata,
} from "./metadata";

export type {
  ActionHookMetadata,
  AssertionMetadata,
  DesignClassMetadata,
  GeneratedStateClassMetadata,
  GeneratedTransitionClassMetadata,
  InlineCodeEntry,
  InlineCodeMetadata,
  LocatorMetadata,
  OverwritableMetadata,
  RegistryClassEntry,
  RegistryIdEntry,
  RegistryMetadata,
  StateLocatorMetadata,
  StateMetadata,
  TransitionLocatorMetadata,
  TransitionMetadata,
} from "./metadata";

export interface TemplateRenderContext {
  model: GeneratedFrameworkModel;
  metadata: TemplateMetadata;
  helpers: TemplateRenderHelpers;
  config: GeneratedProjectConfig;
}

export interface TemplateRenderHelpers {
  ts(value: unknown): string;
  indent(value: string, spaces: number): string;
}

export interface TemplateMetadata {
  stateInfo: Record<string, StateMetadata>;
  transitionInfo: Record<string, TransitionMetadata>;
  assertionInfo: AssertionMetadata;
  actionHookInfo: Record<string, ActionHookMetadata>;
  designClassInfo: DesignClassMetadata;
  locators: LocatorMetadata;
  registry: RegistryMetadata;
  stateClasses: GeneratedStateClassMetadata[];
  transitionClasses: GeneratedTransitionClassMetadata[];
  inlineCode: InlineCodeMetadata;
}
