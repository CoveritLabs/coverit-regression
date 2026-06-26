// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import {
  ActionHookDefinition,
  AssertionMappingFile,
  DesignClassMapping,
  DesignOperationDefinition,
  DesignStoreValueSpec,
  GeneratedFrameworkModel,
  InlineCodeBlock,
  StateStepMapping,
} from "@/types/framework";
import type {
  GeneratedStateClassMetadata,
  GeneratedTransitionClassMetadata,
  InlineCodeMetadata,
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
        indent: (value: string, spaces: number) => this.indent(value, spaces),
      },
      config,
    };
  }

  private buildMetadata(model: GeneratedFrameworkModel): TemplateMetadata {
    const inlineCode = this.emptyInlineCodeMetadata();

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
      assertionInfo: this.buildAssertionInfo(model.assertions, inlineCode),
      actionHookInfo: Object.fromEntries(
        model.actionHooks.map((hook) => [
          hook.id,
          {
            id: hook.id,
            label: hook.label ?? hook.id,
            timing: hook.timing,
            targetId: hook.targetId,
            contextId: hook.contextId,
            definition: this.materializeActionHookDefinition(hook.id, hook.definition, inlineCode),
            overwritable: true,
          },
        ]),
      ),
      designClassInfo: this.buildDesignClassInfo(model, inlineCode),
      locators: this.buildLocators(model),
      registry: this.buildRegistry(model),
      stateClasses: this.buildStateClasses(model),
      transitionClasses: this.buildTransitionClasses(model),
      inlineCode,
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
      assertions: {
        overwritable: true,
      },
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

  private buildDesignClassInfo(
    model: GeneratedFrameworkModel,
    inlineCode: InlineCodeMetadata,
  ): GeneratedFrameworkModel["designClass"] & { overwritable: boolean } {
    const { dbId: _dbId, ...designClass } = model.designClass;
    return {
      ...designClass,
      expressions: this.materializeExpressions(designClass, inlineCode),
      functions: this.materializeDesignFunctions(designClass, inlineCode),
      assertionFunctions: this.materializeAssertionFunctions(designClass, inlineCode),
      operations: this.materializeOperations(designClass, inlineCode),
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

  private buildAssertionInfo(
    assertions: AssertionMappingFile,
    inlineCode: InlineCodeMetadata,
  ): AssertionMappingFile & { overwritable: boolean } {
    return {
      elements: assertions.elements ?? {},
      functions: this.materializeStandaloneAssertionFunctions(assertions.functions ?? {}, inlineCode),
      overwritable: true,
    };
  }

  private materializeStandaloneAssertionFunctions(
    functions: NonNullable<AssertionMappingFile["functions"]>,
    inlineCode: InlineCodeMetadata,
  ): NonNullable<AssertionMappingFile["functions"]> {
    return Object.fromEntries(
      Object.entries(functions).map(([id, fn]) => {
        if (fn.code) {
          const functionId = fn.implementationId ?? id;
          this.addInlineCode(inlineCode.assertionFunctions, inlineCode, functionId, fn.code);
          const { code: _code, ...rest } = fn;
          return [id, { ...rest, implementationId: functionId }];
        }
        return [id, fn];
      }),
    );
  }

  private materializeActionHookDefinition(
    hookId: string,
    definition: ActionHookDefinition,
    inlineCode: InlineCodeMetadata,
  ): ActionHookDefinition {
    if (this.hasInlineCode(definition)) {
      const callable = definition as { functionId?: unknown; args?: Record<string, unknown> };
      const functionId = typeof callable.functionId === "string" && callable.functionId.trim()
        ? callable.functionId
        : this.inlineId("hook", hookId, inlineCode.hookFunctions.length);
      this.addInlineCode(inlineCode.hookFunctions, inlineCode, functionId, definition.code);
      return { type: "hook-function", functionId, args: callable.args };
    }
    return definition;
  }

  private materializeExpressions(designClass: DesignClassMapping, inlineCode: InlineCodeMetadata): DesignClassMapping["expressions"] {
    if (!designClass.expressions) return undefined;
    return Object.fromEntries(
      Object.entries(designClass.expressions).map(([id, expression]) => {
        if (expression.code) {
          const functionId = this.inlineId("expression", id, inlineCode.designFunctions.length);
          this.addInlineCode(inlineCode.designFunctions, inlineCode, functionId, expression.code);
          const { code: _code, ...rest } = expression;
          return [id, { ...rest, expression: `${functionId}()` }];
        }
        return [id, expression];
      }),
    );
  }

  private materializeDesignFunctions(designClass: DesignClassMapping, inlineCode: InlineCodeMetadata): DesignClassMapping["functions"] {
    if (!designClass.functions) return undefined;
    return Object.fromEntries(
      Object.entries(designClass.functions).map(([id, fn]) => {
        if (fn.code) {
          const functionId = fn.implementationId ?? id;
          this.addInlineCode(inlineCode.designFunctions, inlineCode, functionId, fn.code);
          const { code: _code, ...rest } = fn;
          return [id, { ...rest, implementationId: functionId }];
        }
        return [id, fn];
      }),
    );
  }

  private materializeAssertionFunctions(
    designClass: DesignClassMapping,
    inlineCode: InlineCodeMetadata,
  ): DesignClassMapping["assertionFunctions"] {
    if (!designClass.assertionFunctions) return undefined;
    return Object.fromEntries(
      Object.entries(designClass.assertionFunctions).map(([id, fn]) => {
        if (fn.code) {
          const functionId = fn.implementationId ?? id;
          this.addInlineCode(inlineCode.assertionFunctions, inlineCode, functionId, fn.code);
          const { code: _code, ...rest } = fn;
          return [id, { ...rest, implementationId: functionId }];
        }
        return [id, fn];
      }),
    );
  }

  private materializeOperations(designClass: DesignClassMapping, inlineCode: InlineCodeMetadata): DesignClassMapping["operations"] {
    if (!designClass.operations) return undefined;
    return Object.fromEntries(
      Object.entries(designClass.operations).map(([id, operation]) => [
        id,
        this.materializeOperation(id, operation, inlineCode),
      ]),
    );
  }

  private materializeOperation(
    operationId: string,
    operation: DesignOperationDefinition,
    inlineCode: InlineCodeMetadata,
  ): DesignOperationDefinition {
    if ("value" in operation) {
      return {
        ...operation,
        value: this.materializeValueSpec(`${operationId}_value`, operation.value, inlineCode),
      } as DesignOperationDefinition;
    }
    return operation;
  }

  private materializeValueSpec(
    sourceId: string,
    value: DesignStoreValueSpec,
    inlineCode: InlineCodeMetadata,
  ): DesignStoreValueSpec {
    if (this.hasInlineCode(value)) {
      const functionId = this.inlineId("value", sourceId, inlineCode.designFunctions.length);
      this.addInlineCode(inlineCode.designFunctions, inlineCode, functionId, value.code);
      return { functionId, args: value.args };
    }

    if ("fields" in value) {
      return {
        fields: Object.fromEntries(
          Object.entries(value.fields).map(([key, child]) => [
            key,
            this.materializeValueSpec(`${sourceId}_${key}`, child, inlineCode),
          ]),
        ),
      };
    }

    return value;
  }

  private hasInlineCode(value: unknown): value is { code: InlineCodeBlock; args?: Record<string, unknown> } {
    return typeof value === "object" && value !== null && "code" in value && typeof (value as { code?: unknown }).code === "object";
  }

  private addInlineCode(
    target: InlineCodeMetadata["designFunctions"],
    inlineCode: InlineCodeMetadata,
    id: string,
    code: InlineCodeBlock,
  ): void {
    const body = this.inlineCodeBody(code.body);
    target.push({
      id,
      body,
      declaredFunctionName: this.declaredFunctionName(body),
    });
    for (const importLine of code.imports ?? []) {
      if (!inlineCode.imports.includes(importLine)) inlineCode.imports.push(importLine);
    }
  }

  private inlineCodeBody(body: string): string {
    return body.replace(/^\s*export\s+(?=(?:async\s+)?function\b)/, "");
  }

  private declaredFunctionName(body: string): string | undefined {
    return body.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/)?.[1];
  }

  private inlineId(kind: string, sourceId: string, index: number): string {
    return `__inline_${kind}_${this.safeInlineId(sourceId)}_${index + 1}`;
  }

  private safeInlineId(value: string): string {
    return value.replace(/[^A-Za-z0-9_$]+/g, "_") || "anonymous";
  }

  private emptyInlineCodeMetadata(): InlineCodeMetadata {
    return {
      imports: [],
      designFunctions: [],
      assertionFunctions: [],
      hookFunctions: [],
    };
  }

  private indent(value: string, spaces: number): string {
    const prefix = " ".repeat(spaces);
    return value
      .split(/\r?\n/)
      .map((line) => `${prefix}${line}`)
      .join("\n");
  }
}

export default TemplateContextBuilder;
