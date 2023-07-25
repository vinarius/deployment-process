import { Duration } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

import { fromRoot } from '../fromRoot';

export function buildCommonLambdaProps(table: Table, stage: string, stack: string, isStagingEnv: boolean): NodejsFunctionProps {
  const apiGatewayRestApiMaxTimeout = Duration.seconds(29);

  return {
    environment: {
      tableName: table.tableName,
      LOGGING_LEVEL: stage === 'prod' ? 'warn' : 'debug',
      sentryLogPercentage: stage === 'prod' ? '0.0001' : '0.25',
      isStagingEnv: isStagingEnv.toString(),
      NODE_OPTIONS: '--enable-source-maps',
      stack,
      stage,
    },
    runtime: Runtime.NODEJS_18_X,
    timeout: apiGatewayRestApiMaxTimeout,
    bundling: {
      minify: true,
      sourceMap: isStagingEnv,
      sourcesContent: false,
    },
    logRetention:
      stage === 'prod' ? RetentionDays.INFINITE : stage === 'qa' || stage === 'dev' ? RetentionDays.ONE_YEAR : RetentionDays.ONE_WEEK,
    projectRoot: fromRoot(),
    initialPolicy: [
      new PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [table.tableArn, `${table.tableArn}/*`],
      }),
    ],
  };
}
