import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { AppStackProps } from '../models/cloudResources';

export class StatefulStack extends Stack {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { project, stage, stack } = props;

    this.table = new Table(this, `${project}-${stack}-table-${stage}`, {
      tableName: `${project}-${stack}-table-${stage}`,
      partitionKey: {
        name: 'pk',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'TTL',
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: {
        name: 'GSI1PK',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

  }
}