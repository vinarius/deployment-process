import { Stack } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

import { AppStackProps } from '../models/cloudResources';

type StackProps = AppStackProps & {
  table: Table;
};

export class OtherStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const { project, stage, stack, table } = props;

    const lambda = new NodejsFunction(this, `${project}-${stack}-lambda-${stage}`, {
      functionName: `${project}-${stack}-lambda-${stage}`,
      entry: 'src/app/index.ts',
    });

    table.grantReadWriteData(lambda);
  }
}