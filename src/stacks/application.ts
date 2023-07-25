import { StackProps, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApplicationDefinition } from '../config';
import { stackNames } from '../main';
import { ComputeStack } from './compute';
import { StatefulStack } from './stateful';

export class Application extends Stage {
  constructor(scope: Construct, id: string, props: StackProps & ApplicationDefinition) {
    super(scope, id, props);

    const { project, stage } = props;
    const buildStackName = (stack: string) => `${project}-${stack}-stack-${stage}`;

    const statefulStack = new StatefulStack(this, buildStackName(stackNames.stateful), {
      ...props,
      stackName: stackNames.stateful,
    });

    new ComputeStack(this, buildStackName(stackNames.compute), {
      ...props,
      stackName: stackNames.compute,
      table: statefulStack.table,
    });
  }
}