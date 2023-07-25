/* eslint-disable quotes */
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  Method,
  MockIntegration,
  PassthroughBehavior,
  RestApi,
  TokenAuthorizer,
} from 'aws-cdk-lib/aws-apigateway';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction as NodeLambda } from 'aws-cdk-lib/aws-lambda-nodejs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { stackNames } from '../../infrastructure';
import { Generic } from '../../models/cloudResources';
import { HttpMethod } from '../../models/enums';
import { LambdaDefinition } from '../../models/lambda';
import { buildCommonLambdaProps } from './lambda';

interface ServerlessApiProps {
  project: string;
  stage: string;
  isStagingEnv: boolean;
  scope: Construct;
  stack: string;
  apiId?: string;
  lambdaDefinitions?: LambdaDefinition[];
  rootResourceId?: string;
  cognitoAuthorizer?: CognitoUserPoolsAuthorizer;
  cognitoAuthorizerId?: string;
  tokenAuthorizer?: TokenAuthorizer;
  tokenAuthorizerId?: string;
  tableArn?: string;
  table?: Table;
  restApi?: RestApi;
}

export function buildServerlessApi(props: ServerlessApiProps): void {
  const {
    project,
    stage,
    scope,
    stack,
    isStagingEnv,
    lambdaDefinitions = [],
    apiId = StringParameter.fromStringParameterName(
      scope,
      `${project}-baseApiIdParam-${stage}`,
      `/${project}/${stackNames.stateful}/id/${stage}`,
    ).stringValue,
    rootResourceId = StringParameter.fromStringParameterName(
      scope,
      `${project}-rootResourceIdParam-${stage}`,
      `/${project}/${stackNames.stateful}/rootResourceId/${stage}`,
    ).stringValue,
    cognitoAuthorizer,
    cognitoAuthorizerId = isStagingEnv
      ? undefined
      : StringParameter.fromStringParameterName(
          scope,
          `${project}-${stack}-cognitoAuthorizerIdParam-${stage}`,
          `/${project}/${stackNames.stateful}/cognitoAuthorizerId/${stage}`,
        ).stringValue,
    tokenAuthorizer,
    tokenAuthorizerId = !isStagingEnv
      ? undefined
      : StringParameter.fromStringParameterName(
          scope,
          `${project}-${stack}-tokenAuthorizerIdParam-${stage}`,
          `/${project}/${stackNames.stateful}/tokenAuthorizerId/${stage}`,
        ).stringValue,
    tableArn = StringParameter.fromStringParameterName(
      scope,
      `${project}-${stackNames.stateful}-tableArnParam-${stage}`,
      `/${project}/${stackNames.stateful}/tableArn/${stage}`,
    ).stringValue,
    table = Table.fromTableArn(scope, `${project}-${stackNames.stateful}-table-${stage}`, tableArn) as Table,
    restApi = RestApi.fromRestApiAttributes(scope, `${project}-${stackNames.stateful}-restApi-${stage}`, {
      restApiId: apiId,
      rootResourceId,
    }),
  } = props;

  // If we add multiple methods to one resource, we use these variables to only add one OPTIONS method to the resource and not an OPTIONS method to each method.
  const apiPaths: Generic = {};
  const mockIntegration = new MockIntegration({
    requestTemplates: { 'application/json': JSON.stringify({ statusCode: 200 }) },
    passthroughBehavior: PassthroughBehavior.NEVER,
    integrationResponses: [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Headers': "'*'",
          'method.response.header.Access-Control-Allow-Methods': "'GET,PUT,POST,DELETE,OPTIONS'",
          'method.response.header.Access-Control-Allow-Origin': "'*'",
        },
      },
    ],
  });

  for (const {
    name,
    skip,
    api,
    customLogicFunctions,
    environment: definitionEnvironment,
    bundling: definitionBundling,
    initialPolicy: definitionInitialPolicy = [],
    sentryLogPercentage,
    ...definition
  } of lambdaDefinitions) {
    if (skip) continue;

    const {
      environment: commonEnvironment,
      bundling: commonBundling,
      initialPolicy: commonInitialPolicy = [],
      ...commonLambdaProps
    } = buildCommonLambdaProps(table, stage, stack, isStagingEnv);

    const nodeLambda = new NodeLambda(scope, `${project}-${stack}-${name}-${stage}`, {
      ...commonLambdaProps,
      ...definition,
      environment: {
        ...commonEnvironment,
        ...definitionEnvironment,
        ...(sentryLogPercentage && { sentryLogPercentage }),
      },
      bundling: {
        ...commonBundling,
        ...definitionBundling,
      },
      initialPolicy: [...commonInitialPolicy, ...definitionInitialPolicy],
      functionName: `${project}-${stack}-${name}-${stage}`,
    });

    if (customLogicFunctions?.length) for (const applyCustomLogic of customLogicFunctions) applyCustomLogic(nodeLambda);

    if (api) {
      const { httpMethod, apiPath, isAuthNeeded = true, isApiKeyNeeded, deprecation } = api;

      if (deprecation) {
        const { date, updatedApiVersion } = deprecation;

        nodeLambda.addEnvironment('isDeprecated', 'true');
        nodeLambda.addEnvironment('deprecationDate', date);
        nodeLambda.addEnvironment('updatedApiVersion', updatedApiVersion.toString());
      }

      const apiRoute = restApi.root.resourceForPath(apiPath);

      const stagingEnvForgerockAuthConfig = tokenAuthorizer ??
        cognitoAuthorizer ?? {
          authorizationType: cognitoAuthorizerId ? AuthorizationType.COGNITO : AuthorizationType.CUSTOM,
          authorizerId: cognitoAuthorizerId ?? (tokenAuthorizerId as string),
        };
      const featureEnvCognitoAuthConfig = cognitoAuthorizer ?? {
        authorizationType: AuthorizationType.COGNITO,
        authorizerId: cognitoAuthorizerId as string,
      };

      const apiMethod = apiRoute.addMethod(httpMethod as HttpMethod, new LambdaIntegration(nodeLambda), {
        ...(isAuthNeeded && {
          ...(stack === stackNames.admin && {
            authorizationScopes: [`${project}-${stack}-resourceServer-${stage}/${name}`],
          }),
          authorizer: isStagingEnv ? stagingEnvForgerockAuthConfig : featureEnvCognitoAuthConfig,
          ...(!isStagingEnv && {
            authorizationType: AuthorizationType.COGNITO,
          }),
        }),
        ...(isApiKeyNeeded && {
          apiKeyRequired: true,
        }),
      });

      apiPath in apiPaths ? apiPaths[apiPath]++ : (apiPaths[apiPath] = 1);

      if (apiPaths[apiPath] === 1) {
        new Method(scope, `${project}-${stack}-${name}-corsMethod-${stage}`, {
          httpMethod: HttpMethod.OPTIONS,
          resource: apiRoute,
          integration: mockIntegration,
          options: {
            methodResponses: [
              {
                statusCode: '200',
                responseParameters: {
                  'method.response.header.Access-Control-Allow-Headers': true,
                  'method.response.header.Access-Control-Allow-Methods': true,
                  'method.response.header.Access-Control-Allow-Origin': true,
                },
              },
            ],
          },
        });
      }

      // Allows the specific route from api gateway to invoke said lambda function.
      nodeLambda.addPermission(`${project}-${stack}-${name}-InvokePermission-${stage}`, {
        principal: new ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: apiMethod.methodArn,
      });
    }
  }
}
