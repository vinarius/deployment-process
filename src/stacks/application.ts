import { StackProps, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApplicationDefinition } from '../config';
import { buildStackName } from '../lib/buildStackName';
import { StackName } from '../main';
import { ComputeStack } from './compute';
import { OtherStack } from './other';
import { StatefulStack } from './stateful';

export class Application extends Stage {
  constructor(scope: Construct, id: string, props: StackProps & ApplicationDefinition) {
    super(scope, id, props);

    const { project, stage } = props;

    const statefulStackName = buildStackName(project, StackName.stateful, stage);
    const statefulStack = new StatefulStack(this, statefulStackName, {
      ...props,
      stackName: statefulStackName,
      stack: StackName.stateful,
    });

    const computeStackName = buildStackName(project, StackName.compute, stage);
    new ComputeStack(this, computeStackName, {
      ...props,
      stackName: computeStackName,
      stack: StackName.compute,
      table: statefulStack.table,
    });

    const otherStackName = buildStackName(project, StackName.other, stage);
    new OtherStack(this, otherStackName, {
      ...props,
      stackName: otherStackName,
      stack: StackName.other,
      table: statefulStack.table,
    });
  }
}