import { FileEntry } from "./files";

export type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

export const PARENT_KEYWORDS = ["Given", "When", "Then"] as const;
export type ParentKeyWord = (typeof PARENT_KEYWORDS)[number] | null;

export enum StepType {
  STATE = "STATE",
  TRANSITION = "TRANSITION",
  ASSERTION = "ASSERTION",
  ACTION_HOOK = "ACTION_HOOK",
}

export interface Step {
  id: string;
  keyword: StepKeyword;
  parentKeyword: ParentKeyWord;
  type: StepType;
  stepText: string;
}

export interface Scenario {
  id: string;
  name: string;
  steps: Step[];
}

export interface Feature {
  name: string;
  filePath: FileEntry;
  scenarios: Scenario[];
}
