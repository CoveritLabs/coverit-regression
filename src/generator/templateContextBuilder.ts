// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { GeneratedFrameworkModel, StateStepMapping } from "@/types/framework";
import type {
  GeneratedStateClassMetadata,
  GeneratedTransitionClassMetadata,
  LocatorMetadata,
  RegistryMetadata,
  StateLocatorMetadata,
} from "@/types/metadata";
import {
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
            label: state.label ?? state.id,
            id: state.id,
            url: state.url,
            className: state.className,
            baselineDir: state.baselineDir,
            snapshotPath: state.snapshotPath,
            dom: state.dom,
            overwritable: true,
          },
        ]),
      ),
      transitionInfo: Object.fromEntries(
        model.transitions.map((transition) => [
          transition.id,
          {
            id: transition.id,
            label: transition.label ?? transition.id,
            className: transition.className,
            actions: transition.actions,
            overwritable: true,
          },
        ]),
      ),
      assertionInfo: Object.fromEntries(
        model.assertions.map((assertion) => [
          assertion.id,
          {
            id: assertion.id,
            label: assertion.label ?? assertion.id,
            targetId: assertion.targetId,
            contextId: assertion.contextId,
            severity: assertion.severity,
            definition: assertion.definition,
            overwritable: true,
          },
        ]),
      ),
      actionHookInfo: Object.fromEntries(
        model.actionHooks.map((hook) => [
          hook.id,
          {
            id: hook.id,
            label: hook.label ?? hook.id,
            timing: hook.timing,
            targetId: hook.targetId,
            contextId: hook.contextId,
            definition: hook.definition,
            overwritable: true,
          },
        ]),
      ),
      designClassInfo: this.buildDesignClassInfo(model),
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
            actions: transition.actions.map((action) => ({
              stateId: action.stateId,
              locatorKey: action.locatorKey,
              locator: action.locator,
            })),
            overwritable: true,
          },
        ]),
      ),
    };
  }

  private extractStateLocators(state: StateStepMapping): StateLocatorMetadata {
    return {
      overwritable: true,
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
            className: state.className,
            overwritable: true,
          },
        ]),
      ),
      transitions: Object.fromEntries(
        model.transitions.map((transition) => [
          transition.id,
          {
            className: transition.className,
            overwritable: true,
          },
        ]),
      ),
      assertions: Object.fromEntries(
        model.assertions.map((assertion) => [
          assertion.id,
          {
            overwritable: true,
          },
        ]),
      ),
      actionHooks: Object.fromEntries(
        model.actionHooks.map((hook) => [
          hook.id,
          {
            overwritable: true,
          },
        ]),
      ),
      designClass: {
        overwritable: true,
      },
    };
  }

  private buildDesignClassInfo(model: GeneratedFrameworkModel): GeneratedFrameworkModel["designClass"] & { overwritable: boolean } {
    const { dbId: _dbId, ...designClass } = model.designClass;
    return {
      ...designClass,
      overwritable: true,
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
