import { StackName } from "../main";

export function buildStackName(project: string, stack: StackName, stage: string) {
  return `${project}-${stack}-stack-${stage}`;
}