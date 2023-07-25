import { StackProps } from 'aws-cdk-lib';
import { NodejsFunctionProps, NodejsFunction as NodeLambda } from 'aws-cdk-lib/aws-lambda-nodejs';
import { APIGatewayProxyEventBase } from 'aws-lambda';
import { ApplicationDefinition } from '../lib/getAppConfig';

export type AppStackProps = StackProps & ApplicationDefinition & {
  stackName: string;
};

export interface Generic {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface WebSocketLambdaDefinition extends Partial<NodejsFunctionProps> {
  name: string;
  entry: string;
  skip?: boolean;
  customLogicFunctions?: ((lambda: NodeLambda) => void)[];
  action: string;
  loggingLevel?: 'error' | 'warn' | 'info' | 'debug';
}

type AuthorizerContext = {
  sub: string;
  connectUUID: string;
  subname: string;
  name: string;
  principalId: string;
  integrationLatency: number;
  given_name: string;
  family_name: string;
  email: string;
};

export type APIGatewayEvent = APIGatewayProxyEventBase<AuthorizerContext>;

export type APIGatewayBody<T> = {
  success: boolean;
  payload?: T;
  isDeprecated?: boolean;
  deprecationOn?: string;
  deprecationMessage?: string;
  reason?: string;
  error?: string;
};
