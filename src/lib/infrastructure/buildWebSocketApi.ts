import { Aws } from 'aws-cdk-lib';
import { CfnIntegration, CfnRoute } from 'aws-cdk-lib/aws-apigatewayv2';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction as NodeLambda } from 'aws-cdk-lib/aws-lambda-nodejs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { WebSocketLambdaDefinition } from '../../models/cloudResources';
import { buildCommonLambdaProps } from './lambda';

interface WebSocketApiProps {
  project: string;
  stage: string;
  isStagingEnv: boolean;
  scope: Construct;
  stack: string;
  webSocketLambdaDefinitions: WebSocketLambdaDefinition[];
}

export function buildWebSocketApi(props: WebSocketApiProps): void {
  const { project, stage, scope, stack, webSocketLambdaDefinitions = [], isStagingEnv } = props;
  const { PARTITION, REGION, ACCOUNT_ID } = Aws;

  const tableArn = StringParameter.fromStringParameterName(
    scope,
    `${project}-${stack}-tableArnParam-${stage}`,
    `/${project}/api/tableArn/${stage}`,
  ).stringValue;

  const table = Table.fromTableArn(scope, `${project}-${stack}-table-${stage}`, tableArn) as Table;

  const webSocketEndpoint = StringParameter.fromStringParameterName(
    scope,
    `${project}-${stack}-webSocketEndpointParam-${stage}`,
    `/${project}/api/webSocketEndpoint/${stage}`,
  ).stringValue;

  const webSocketApiId = StringParameter.fromStringParameterName(
    scope,
    `${project}-${stack}-webSocketApiIdParam-${stage}`,
    `/${project}/api/webSocketApiId/${stage}`,
  ).stringValue;

  for (const definition of webSocketLambdaDefinitions) {
    const { action, name, skip = false } = definition;

    if (skip) continue;

    const commonLambdaProps = buildCommonLambdaProps(table, stage, stack, isStagingEnv);

    const webSocketLambda = new NodeLambda(scope, `${project}-${stack}-ws-${name}-${stage}`, {
      ...commonLambdaProps,
      ...definition,
      environment: {
        ...commonLambdaProps.environment,
        ...definition.environment,
        webSocketEndpoint,
      },
      bundling: {
        ...commonLambdaProps.bundling,
        ...definition.bundling,
      },
      initialPolicy: [
        ...(commonLambdaProps.initialPolicy ?? []),
        ...(definition.initialPolicy ?? []),
        new PolicyStatement({
          actions: ['execute-api:ManageConnections'],
          resources: [`arn:${PARTITION}:execute-api:${REGION}:${ACCOUNT_ID}:*/*`],
        }),
      ],
      functionName: `${project}-${stack}-ws-${name}-${stage}`,
    });

    const cfnIntegration = new CfnIntegration(scope, `${project}-${stack}-ws-cfnInt-${name}-${stage}`, {
      apiId: webSocketApiId,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:${PARTITION}:apigateway:${REGION}:lambda:path/2015-03-31/functions/${webSocketLambda.functionArn}/invocations`,
    });

    const route = new CfnRoute(scope, `${project}-${stack}-ws-cfnRoute-${name}-${stage}`, {
      apiId: webSocketApiId,
      routeKey: action,
      target: `integrations/${cfnIntegration.ref}`,
    });

    webSocketLambda.addPermission(`${project}-${stack}-ws-perm-${name}-${stage}`, {
      principal: new ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:${PARTITION}:execute-api:${REGION}:${ACCOUNT_ID}:${webSocketApiId}/${stage}/${route.routeKey}`,
    });
  }
}
