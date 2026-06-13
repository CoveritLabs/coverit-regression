// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import ts from "typescript";

export interface MergeResult {
  merged?: string;
  reason?: string;
}

interface ParsedClass {
  sourceFile: ts.SourceFile;
  classNode: ts.ClassDeclaration;
  members: Map<string, string>;
  prefix: string;
  suffix: string;
}

class TypeScriptClassMemberMerger {
  merge(previousGenerated: string, currentEdited: string, nextGenerated: string): MergeResult {
    const previousClass = this.parseSingleClass(previousGenerated);
    const currentClass = this.parseSingleClass(currentEdited);
    const nextClass = this.parseSingleClass(nextGenerated);

    if (!previousClass || !currentClass || !nextClass) {
      return { reason: "Only files with a single generated class are eligible for custom member preservation." };
    }

    if (previousClass.classNode.name?.text !== currentClass.classNode.name?.text) {
      return { reason: "The generated class name was changed by the user." };
    }

    if (previousClass.classNode.name?.text !== nextClass.classNode.name?.text) {
      return { reason: "The generated class name changed between generator runs." };
    }

    if (
      this.normalizeMember(previousClass.prefix) !== this.normalizeMember(currentClass.prefix) ||
      this.normalizeMember(previousClass.suffix) !== this.normalizeMember(currentClass.suffix)
    ) {
      return { reason: "Generated imports, class declaration, or top-level code were edited by the user." };
    }

    for (const [key, previousText] of previousClass.members) {
      const currentText = currentClass.members.get(key);
      if (!currentText) return { reason: `Generated class member '${key}' was removed by the user.` };
      if (this.normalizeMember(previousText) !== this.normalizeMember(currentText)) {
        return { reason: `Generated class member '${key}' was edited by the user.` };
      }
    }

    const customMembers = [...currentClass.members.entries()]
      .filter(([key]) => !previousClass.members.has(key))
      .map(([, member]) => member.trimEnd());

    if (customMembers.length === 0) return { merged: nextGenerated };

    const insertPosition = nextClass.classNode.members.end;
    const beforeMembersEnd = nextGenerated.slice(0, insertPosition).trimEnd();
    const afterMembersEnd = nextGenerated.slice(insertPosition);
    return {
      merged: `${beforeMembersEnd}\n\n${customMembers.join("\n\n")}\n${afterMembersEnd}`,
    };
  }

  private parseSingleClass(source: string): ParsedClass | undefined {
    const sourceFile = ts.createSourceFile("generated.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const classes = sourceFile.statements.filter(ts.isClassDeclaration);
    if (classes.length !== 1) return undefined;

    const classNode = classes[0];
    if (!classNode.name) return undefined;

    const members = new Map<string, string>();
    for (const member of classNode.members) {
      const key = this.memberKey(member);
      if (!key) return undefined;
      members.set(key, member.getFullText(sourceFile).trim());
    }

    return {
      sourceFile,
      classNode,
      members,
      prefix: source.slice(0, classNode.members.pos),
      suffix: source.slice(classNode.members.end),
    };
  }

  private memberKey(member: ts.ClassElement): string | undefined {
    if (ts.isConstructorDeclaration(member)) return "constructor";

    const name = "name" in member ? member.name : undefined;
    if (!name) return undefined;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isPrivateIdentifier(name)) return name.text;
    return undefined;
  }

  private normalizeMember(memberText: string): string {
    return memberText.replace(/\s+/g, " ").trim();
  }
}

export default TypeScriptClassMemberMerger;

