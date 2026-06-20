// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { GeneratedFrameworkModel, Locator, StateStepMapping } from "@/types/framework";
import {
  GeneratedStateClassMetadata,
  GeneratedTransitionClassMetadata,
  LocatorMetadata,
  RegistryMetadata,
  TemplateMetadata,
  TemplateRenderContext,
} from "@/types/templates";
import type { GeneratedProjectConfig } from "@/types/generator";
import TypeScriptObjectEmitter from "./typeScriptObjectEmitter";

class TemplateContextBuilder {
  private readonly objectEmitter = new TypeScriptObjectEmitter();

  build(model: GeneratedFrameworkModel, config: GeneratedProjectConfig = {}): TemplateRenderContext {
    return {
      model,
      metadata: this.buildMetadata(model),
      helpers: {
        ts: (value: unknown) => this.objectEmitter.emit(value),
      },
      config,
    };
  }

  private buildMetadata(model: GeneratedFrameworkModel): TemplateMetadata {
    return {
      stateInfo: Object.fromEntries(
        model.states.map((state) => [
          state.id,
          {
            id: state.id,
            dbId: state.dbId ?? state.id,
            label: state.label ?? state.id,
            url: state.url,
            className: state.className,
            baselineDir: state.baselineDir,
            snapshotPath: state.snapshotPath,
            dom: state.dom,
          },
        ]),
      ),
      transitionInfo: Object.fromEntries(
        model.transitions.map((transition) => [
          transition.id,
          {
            id: transition.id,
            dbId: transition.dbId ?? transition.id,
            label: transition.label ?? transition.id,
            className: transition.className,
            action: transition.action,
          },
        ]),
      ),
      assertionInfo: Object.fromEntries(
        model.assertions.map((assertion) => [
          assertion.id,
          {
            id: assertion.id,
            dbId: assertion.dbId ?? assertion.id,
            label: assertion.label ?? assertion.id,
            targetId: assertion.targetId,
            contextId: assertion.contextId,
            severity: assertion.severity,
            definition: assertion.definition,
          },
        ]),
      ),
      actionHookInfo: Object.fromEntries(
        model.actionHooks.map((hook) => [
          hook.id,
          {
            id: hook.id,
            dbId: hook.dbId ?? hook.id,
            label: hook.label ?? hook.id,
            timing: hook.timing,
            targetId: hook.targetId,
            contextId: hook.contextId,
            definition: hook.definition,
          },
        ]),
      ),
      designClassInfo: model.designClass,
      locators: this.buildLocators(model),
      registry: this.buildRegistry(model),
      stateClasses: this.buildStateClasses(model),
      transitionClasses: this.buildTransitionClasses(model),
    };
  }

  private buildLocators(model: GeneratedFrameworkModel): LocatorMetadata {
    return {
      states: Object.fromEntries(model.states.map((state) => [state.id, this.extractStateLocators(state)])),
      transitions: Object.fromEntries(
        model.transitions.map((transition) => [
          transition.id,
          {
            stateId: transition.action.stateId,
            locatorKey: transition.action.locatorKey,
            locator: transition.action.locator,
          },
        ]),
      ),
    };
  }

  private extractStateLocators(state: StateStepMapping): Record<string, Locator> {
    return {
      ...(state.dom?.landmarks ?? {}),
      ...(state.dom?.elements ?? {}),
    };
  }

  private buildRegistry(model: GeneratedFrameworkModel): RegistryMetadata {
    return {
      states: Object.fromEntries(
        model.states.map((state) => [
          state.id,
          {
            dbId: state.dbId ?? state.id,
            className: state.className,
          },
        ]),
      ),
      transitions: Object.fromEntries(
        model.transitions.map((transition) => [
          transition.id,
          {
            dbId: transition.dbId ?? transition.id,
            className: transition.className,
          },
        ]),
      ),
      assertions: Object.fromEntries(
        model.assertions.map((assertion) => [
          assertion.id,
          {
            dbId: assertion.dbId ?? assertion.id,
          },
        ]),
      ),
      actionHooks: Object.fromEntries(
        model.actionHooks.map((hook) => [
          hook.id,
          {
            dbId: hook.dbId ?? hook.id,
          },
        ]),
      ),
      designClass: {
        dbId: model.designClass.dbId ?? model.designClass.id,
      },
    };
  }

  private buildStateClasses(model: GeneratedFrameworkModel): GeneratedStateClassMetadata[] {
    return [...new Map(model.states.map((state) => [state.className, state.id])).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([className, stateId]) => ({ className, stateId }));
  }

  private buildTransitionClasses(model: GeneratedFrameworkModel): GeneratedTransitionClassMetadata[] {
    return [...new Map(model.transitions.map((transition) => [transition.className, transition.id])).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([className, transitionId]) => ({ className, transitionId }));
  }
}

export default TemplateContextBuilder;
