import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { BatchGetCommandInput, DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import {
  Ban,
  BanFactory,
  BanPenaltyLevel,
  SubscriptionLatest,
  SubscriptionLatestFactory,
  User,
  UserFactory,
} from '@internal-tech-solutions/sig-dynamo-factory';
import axios from 'axios';
import qs from 'qs';
import decodeJWT from 'jwt-decode';

import { ForgeRockJWT } from './lambda';
import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';
import { throwUnknownError } from './errors';
import { validateNotBanned } from './validateNotBanned';
import { getCache } from './sdk';

const {
  hostedZoneName = '',
  forgerockBaseUrl = '',
  forgerockClientSecretName = '',
  forgerockAccessTokenEndpoint = '',
  forgerockCookieName = '',
} = process.env;

const logger = LoggerFactory.getLogger();
const secretsManagerClient = new SecretsManagerClient({ ...retryOptions });
const cache = getCache();

export const getAccessToken = async (): Promise<string> => {
  const secretKey = 'clientSecret';
  let clientSecret: string | undefined = cache.get(secretKey);

  if (!clientSecret) {
    const { SecretString = '{}' } = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: forgerockClientSecretName }));

    logger.debug('SecretString:', SecretString);

    const { clientSecret: parsedSecret } = JSON.parse(SecretString) as { clientSecret: string };
    cache.set(secretKey, parsedSecret);
    clientSecret = parsedSecret;
  }

  const getAccessTokenRequest = {
    method: 'post',
    url: forgerockAccessTokenEndpoint,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: qs.stringify({
      grant_type: 'client_credentials',
      client_id: 'connect_app',
      client_secret: clientSecret,
      scope: 'fr:am:api:*',
      response_type: 'token',
    }),
  };

  logger.debug('getAccessTokenRequest:', JSON.stringify(getAccessTokenRequest, null, 2));

  const getAccessTokenResponse = (await axios(getAccessTokenRequest).catch(error => logger.debug('error:', error)))?.data;

  logger.debug('getAccessTokenResponse:', getAccessTokenResponse);

  return getAccessTokenResponse.access_token;
};

export const getSessionTokens = async (
  tokenId: string,
): Promise<{ accessToken: string; idToken: string; refreshToken: string; expiresIn: number; tokenType: string }> => {
  const secretKey = 'clientSecret';
  let clientSecret: string | undefined = cache.get(secretKey);

  if (!clientSecret) {
    const { SecretString = '{}' } = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: forgerockClientSecretName }));

    logger.debug('SecretString:', SecretString);

    const { clientSecret: parsedSecret } = JSON.parse(SecretString) as { clientSecret: string };
    cache.set(secretKey, parsedSecret);
    clientSecret = parsedSecret;
  }

  // Get authorization code
  const getAuthorizationCodeRequest = {
    method: 'post',
    url: `${forgerockBaseUrl}/oauth2/bravo/authorize`,
    headers: {
      Cookie: `${forgerockCookieName}=${tokenId}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: qs.stringify({
      client_id: 'connect_app',
      scope: 'openid profile',
      response_type: 'code',
      decision: 'allow',
      csrf: tokenId,
      redirect_uri: `https://${hostedZoneName}/`,
    }),
  };

  logger.debug('getAuthorizationCodeRequest:', JSON.stringify(getAuthorizationCodeRequest, null, 2));

  let authorizationCode;

  const getAuthorizationCodeResponse = await axios(getAuthorizationCodeRequest).catch(error => {
    logger.debug('error?.response?.data:', JSON.stringify(error?.response?.data, null, 2));
    logger.debug('error?.request?.path:', error?.request?.path);

    authorizationCode = error?.request?.path?.split('=')[1].split('&')[0];
  });

  logger.debug('getAuthorizationCodeResponse?.request?.path:', getAuthorizationCodeResponse?.request?.path);

  authorizationCode = authorizationCode || getAuthorizationCodeResponse?.request?.path?.split('=')[1].split('&')[0];
  logger.debug('authorizationCode:', authorizationCode);

  // Exchange authorization code for tokens
  const exchangeAuthorizationCodeForTokensRequest = {
    method: 'post',
    url: forgerockAccessTokenEndpoint,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: qs.stringify({
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: 'connect_app',
      client_secret: clientSecret,
      redirect_uri: `https://${hostedZoneName}/`,
    }),
  };

  logger.debug('exchangeAuthorizationCodeForTokensRequest:', JSON.stringify(exchangeAuthorizationCodeForTokensRequest, null, 2));

  const exchangeAuthorizationCodeForTokensResponse = (
    await axios(exchangeAuthorizationCodeForTokensRequest).catch(error => logger.debug('error?.response?.data:', error?.response?.data))
  )?.data;

  logger.debug('exchangeAuthorizationCodeForTokensResponse:', JSON.stringify(exchangeAuthorizationCodeForTokensResponse, null, 2));

  const { access_token, refresh_token, id_token, expires_in, token_type } = exchangeAuthorizationCodeForTokensResponse;

  const decodedIdToken = (decodeJWT(id_token) as ForgeRockJWT) ?? {};

  logger.debug('decodedIdToken:', JSON.stringify(decodedIdToken, null, 2));

  const { connectUUID: userId } = decodedIdToken;

  logger.debug('userId:', userId);

  if (!userId) throwUnknownError('Unable to authenticate');

  await validateNotBanned(userId, BanPenaltyLevel.P5, 'You are banned from accessing Sig Connect');

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    idToken: id_token,
    expiresIn: expires_in,
    tokenType: token_type,
  };
};

export const getUserProfile = async (idToken: string, tableName: string, docClient: DynamoDBDocument): Promise<Record<string, unknown>> => {
  const decodedToken = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString()) as ForgeRockJWT;

  logger.debug('decodedToken:', JSON.stringify(decodedToken, null, 2));

  const { connectUUID: userId } = decodedToken;

  logger.debug('userId:', userId);

  const getUserItemInput: BatchGetCommandInput = {
    RequestItems: {
      [tableName]: {
        Keys: [UserFactory.getPrimaryKey(userId), SubscriptionLatestFactory.getPrimaryKey(userId), BanFactory.getPrimaryKey(userId)],
      },
    },
  };

  logger.debug('getUserItemInput:', JSON.stringify(getUserItemInput, null, 2));

  const responses = (await docClient.batchGet(getUserItemInput)).Responses![tableName] as (User | SubscriptionLatest | Ban)[];

  logger.debug('responses:', JSON.stringify(responses, null, 2));

  const user = responses.find(({ type }) => type === UserFactory.type) as User;
  const subscription = responses.find(({ type }) => type === SubscriptionLatestFactory.type) as SubscriptionLatest;
  const ban = (responses?.find(({ type }) => type === BanFactory.type) as Ban) ?? {};
  const { bans = BanFactory.getBans(BanPenaltyLevel.P0), banPenaltyLevel = BanPenaltyLevel.P0 } = ban;

  logger.debug('user:', JSON.stringify(user, null, 2));
  logger.debug('subscription:', JSON.stringify(subscription, null, 2));
  logger.debug('ban:', JSON.stringify(ban, null, 2));
  logger.debug('bans:', JSON.stringify(bans, null, 2));
  logger.debug('banPenaltyLevel:', JSON.stringify(banPenaltyLevel, null, 2));

  const userProfile: Record<string, unknown> = {
    ...user,
    ...subscription,
    ...ban,
    bans,
    banPenaltyLevel,
  };

  logger.debug('userProfile:', JSON.stringify(userProfile, null, 2));

  if ('type' in userProfile) delete userProfile.type;

  return userProfile;
};
