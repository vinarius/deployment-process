import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import NodeCache from 'node-cache';
import { Tier } from '@internal-tech-solutions/sig-dynamo-factory';
import axios, { AxiosRequestConfig } from 'axios';
import qs from 'qs';
import decodeJWT from 'jwt-decode';
import { DateTime } from 'luxon';

import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';
import { getCache } from './sdk';

export type ForgerockAccessToken = {
  sub: string;
  cts: string;
  auditTrackingId: string;
  subname: string;
  iss: string;
  tokenName: string;
  token_type: string;
  authGrantId: string;
  aud: string;
  nbf: number;
  grant_type: string;
  scope: string[];
  auth_time: number;
  realm: string;
  exp: number;
  iat: number;
  expires_in: number;
  jti: string;
};

const seconds = 60;
const minutes = 10;
const nodeCache = new NodeCache({
  stdTTL: seconds * minutes,
  useClones: false,
});
const logger = LoggerFactory.getLogger();
const secretsManagerClient = new SecretsManagerClient({ ...retryOptions });
const { forgerockClientSecretName = '' } = process.env;
const cacheKey = 'forgerockSecret';

export async function getForgeRockClientSecret() {
  let clientSecret: string | undefined = nodeCache.get(cacheKey);

  logger.debug('clientSecret:', !!clientSecret);

  if (!clientSecret) {
    logger.debug('cache miss');

    const secretRequest = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: forgerockClientSecretName }));

    logger.debug('getSecretValueCommand sent');

    clientSecret = JSON.parse(secretRequest.SecretString ?? '').clientSecret;

    logger.debug('clientSecret parsed');

    nodeCache.set(cacheKey, clientSecret);

    logger.debug('clientSecret cached');
  } else {
    logger.debug('cache hit');
  }

  return clientSecret;
}

const cache = getCache();
export async function updateForgerockUserSubTier(newTier: Tier, emailOfUserToUpdate: string) {
  const {
    forgerockUpdateUserSubLevelAmEndpoint = '',
    forgerockUpdateUserSubLevelIdmEndpoint = '',
    forgerockConnectAdminClientSecretName = '',
  } = process.env;
  const cacheClientSecretKey = 'forgerockConnectAdminClientSecretName';
  const cacheAccessTokenKey = 'accessToken';
  let clientSecret: string | undefined = cache.get(cacheClientSecretKey);
  let accessToken: string | undefined = cache.get(cacheAccessTokenKey);

  if (!clientSecret) {
    logger.debug('clientSecret cache miss');

    const { SecretString = '' } = await secretsManagerClient.send(
      new GetSecretValueCommand({ SecretId: forgerockConnectAdminClientSecretName }),
    );

    logger.debug('SecretString:', SecretString);

    cache.set(cacheClientSecretKey, SecretString);
    clientSecret = SecretString;
  } else {
    logger.debug('clientSecret cache hit');
  }

  const getAccessToken = async () => {
    const getAccessTokenRequest: AxiosRequestConfig = {
      method: 'post',
      url: `${forgerockUpdateUserSubLevelAmEndpoint}/oauth2/bravo/access_token`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: 'connect_admin',
        client_secret: clientSecret,
        scope: 'fr:idm:*',
        response_type: 'token',
      }),
    };

    logger.debug('getAccessTokenRequest:', JSON.stringify(getAccessTokenRequest, null, 2));

    const { data: getAccessTokenResponse } = await axios(getAccessTokenRequest);

    logger.debug('getAccessTokenResponse:', getAccessTokenResponse);

    const { access_token } = getAccessTokenResponse;

    logger.debug('access_token:', access_token);

    cache.set(cacheAccessTokenKey, access_token);

    accessToken = access_token;
  };

  if (accessToken) {
    logger.debug('accessToken cache hit');

    const decodedAccessToken = (decodeJWT(accessToken) as ForgerockAccessToken) ?? {};

    logger.debug('decodedAccessToken:', decodedAccessToken);

    const { exp } = decodedAccessToken;

    logger.debug('exp:', exp);

    if (DateTime.fromSeconds(exp) <= DateTime.local()) {
      logger.debug('accessToken expired');
      await getAccessToken();
    }
  } else {
    logger.debug('accessToken cache miss');
    await getAccessToken();
  }

  const updateForgerockSubLevelInput: AxiosRequestConfig = {
    method: 'post',
    url: `${forgerockUpdateUserSubLevelIdmEndpoint}/managed/bravo_user?_action=patch&_queryId=for-userName&uid=${encodeURIComponent(
      emailOfUserToUpdate,
    )}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    data: [
      {
        operation: 'replace',
        field: 'frUnindexedString3',
        value: newTier,
      },
    ],
  };

  logger.debug('updateForgerockSubLevelInput:', JSON.stringify(updateForgerockSubLevelInput, null, 2));

  await axios(updateForgerockSubLevelInput);
}
