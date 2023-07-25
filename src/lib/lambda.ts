/* eslint-disable @typescript-eslint/no-explicit-any */
import { Feature, Platform, trimIndexedAttributes } from '@internal-tech-solutions/sig-dynamo-factory';
import { AWSLambda as Sentry } from '@sentry/serverless';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import isObject from 'isobject';
import { DateTime } from 'luxon';

import { LoggerFactory } from '../lib/loggerFactory';
import { Generic } from '../models/cloudResources';
import { throwNotAuthorizedError } from './errors';
import { validateFeatureAvailability } from './validateFeatureAvailability';

export interface CognitoAuthorizerClaims {
  sub: string; //  'cd547cc6-6a29-469d-b9cc-58ddedf39395',
  email_verified: string; //  'true',
  iss: string; //  'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_uJ7HBCvL4',
  'cognito:username': string; //  'cd547cc6-6a29-469d-b9cc-58ddedf39395',
  origin_jti: string; //  '9f9bd4da-2609-4a6b-affa-8b8595a7ad2c',
  aud: string; //  'ruelffup97egjm887cpfghal8',
  event_id: string; //  'bff63a0b-311a-414c-b581-069e6ad65e9e',
  token_use: string; //  'id',
  auth_time: string; //  '1651585910',
  exp: string; //  'Wed May 04 13:51:50 UTC 2022',
  iat: string; //  'Tue May 03 13:51:50 UTC 2022',
  jti: string; //  '90516f15-4ce6-4b5e-ad70-f655d3271816',
  email: string; //  'mark@itserv.io'
}

export type ForgeRockJWT = {
  at_hash: string;
  sub: string;
  connectUUID: string;
  auditTrackingId: string;
  subname: string;
  iss: string;
  tokenName: string;
  given_name: string;
  sid: string;
  aud: string;
  c_hash: string;
  acr: string;
  'org.forgerock.openidconnect.ops': string;
  azp: string;
  auth_time: number;
  name: string;
  realm: string;
  exp: number;
  tokenType: string;
  iat: number;
  family_name: string;
  email: string;
};

export const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
};

const {
  stage = '',
  isStagingEnv = '',
  sentryLogPercentage = 0.0,
  isDeprecated = 'false',
  deprecationDate = '',
  updatedApiVersion = '',
  stack = '',
} = process.env;

if (isStagingEnv === 'true') {
  Sentry.init({
    dsn: 'https://888f4f0b2d604a8ca56c5f13d1d46ae1@o1190173.ingest.sentry.io/6485309',
    environment: stage,
    tracesSampleRate: +sentryLogPercentage,
  });
}

const logger = LoggerFactory.getLogger();

export function getUserPropsFromIdToken(apiGatewayEvent: APIGatewayProxyEvent): { userId: string; email: string } {
  let userId;
  let exp;
  let email;

  if (isStagingEnv === 'true') {
    exp = (apiGatewayEvent.requestContext.authorizer as ForgeRockJWT).exp;
    userId = (apiGatewayEvent.requestContext.authorizer as ForgeRockJWT).connectUUID;
    email = (apiGatewayEvent.requestContext.authorizer as ForgeRockJWT).email;
  } else {
    exp = apiGatewayEvent.requestContext.authorizer!.claims.exp;
    userId = apiGatewayEvent.requestContext.authorizer!.claims['custom:connectUUID'];
    email = apiGatewayEvent.requestContext.authorizer!.claims.email;
  }

  const isExpired = DateTime.utc() > DateTime.fromJSDate(new Date(exp));

  if (isExpired) throwNotAuthorizedError('Token has expired. Refresh required.');

  return {
    userId,
    email,
  };
}

function recursivelyFormatObject(obj: Generic | Generic[]): Generic | Generic[] {
  if (Array.isArray(obj)) {
    return obj.map(item => recursivelyFormatObject(item));
  }

  if (isObject(obj) && !(obj instanceof Date) && !(obj instanceof Set)) {
    const formattedObj = trimIndexedAttributes(obj);

    return Object.keys(formattedObj).reduce((acc: Generic, key) => {
      acc[key] = recursivelyFormatObject(obj[key]);
      return acc;
    }, {});
  }

  if (obj instanceof Set) {
    return Array.from(obj);
  }

  return obj;
}

export async function handlerWrapper(event: any, handler: any): Promise<APIGatewayProxyResult> {
  try {
    logger.debug('Event:', JSON.stringify(event, null, 2));

    const platform = event?.headers?.platform ?? 'web';

    if (Object.keys(Feature).includes(stack)) await validateFeatureAvailability(stack as Feature, platform as Platform);

    const response = (await handler(event)) ?? {};
    const customSuccess = response.success;
    const customBody = response.customBody;
    const customHeaders = response.customHeaders ?? {};
    const multiValueHeaders = response.multiValueHeaders ?? {};

    delete response.success;
    delete response.customBody;
    delete response.customHeaders;
    delete response.multiValueHeaders;

    const body = {
      success: customSuccess ?? true,
      timestamp: DateTime.utc().toISO(),
      ...(isDeprecated === 'true' && {
        isDeprecated: true,
        deprecationOn: deprecationDate,
        deprecationMessage: `This API is deprecated. Use v${updatedApiVersion} instead.`,
      }),
      ...((Object.keys(response).length > 0 || Array.isArray(response)) && { payload: recursivelyFormatObject(response) }),
    };

    logger.debug('body:', JSON.stringify(body, null, 2));

    const finalResponse = {
      statusCode: 200,
      headers: {
        ...headers,
        ...customHeaders,
      },
      multiValueHeaders,
      body: customBody ?? JSON.stringify(body),
    };

    logger.debug('finalResponse:', JSON.stringify(finalResponse, null, 2));

    return finalResponse;
  } catch (caughtError: any) {
    logger.warn(caughtError);

    const reason = caughtError.name ?? caughtError.reason ?? 'Unknown';

    if (!caughtError.isIntentionalError && !caughtError?.missingRequiredParams?.length && !caughtError?.invalidParams?.length) {
      logger.error('Uncaught error:', caughtError);

      const sentryError = new Error(caughtError.error ?? caughtError.message ?? caughtError.reason ?? 'Unknown error');

      Sentry.captureException(sentryError);
    }

    const finalResponse = {
      statusCode: caughtError.statusCode ?? caughtError.$metadata?.httpStatusCode ?? 500,
      headers,
      body: JSON.stringify({
        success: false,
        timestamp: DateTime.utc().toISO(),
        reason,
        error: caughtError.Error?.Message ?? caughtError.message ?? caughtError.error ?? caughtError.validationErrors ?? 'Unknown error',
        ...(isDeprecated === 'true' && {
          isDeprecated: true,
          deprecationOn: deprecationDate,
          deprecationMessage: `This API is deprecated. Please use v${updatedApiVersion} instead.`,
        }),
      }),
    };

    logger.debug('finalResponse:', JSON.stringify(finalResponse, null, 2));

    return finalResponse;
  }
}

export function parseEventBody<T>(event: APIGatewayProxyEvent): T {
  const parsedBody: Generic = JSON.parse(event.body ?? '{}');

  const getFormattedObject = (obj: Generic) => {
    const trimmedChildObj: Generic = {};

    for (const [key, val] of Object.entries(obj)) {
      let formattedVal;

      // Modifications to each type can go here as needed.
      switch (typeof val) {
        case 'string':
          formattedVal = val.trim();
          break;
        case 'object': // careful for null and classes
        case 'bigint':
        case 'boolean':
        case 'function':
        case 'number':
        case 'symbol':
        case 'undefined':
        default:
          formattedVal = val;
      }

      if (isObject(val)) formattedVal = getFormattedObject(val);

      trimmedChildObj[key as keyof typeof obj] = formattedVal;
    }

    return trimmedChildObj;
  };

  return isObject(parsedBody) ? (getFormattedObject(parsedBody) as T) : (parsedBody as T);
}
