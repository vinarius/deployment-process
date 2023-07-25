import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import axios from 'axios';
import NodeCache from 'node-cache';

import { throwThirdPartyFailureError } from './errors';
import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';

const seconds = 60;
const minutes = 60;
const hours = 12;
const nodeCache = new NodeCache({
  stdTTL: seconds * minutes * hours,
  useClones: false,
});
const logger = LoggerFactory.getLogger();
const secretsManagerClient = new SecretsManagerClient({ ...retryOptions });

export const yotpoTokenCache = async (secretName: string): Promise<string> => {
  const cacheKeyName = 'authToken';
  let authToken: string | undefined = nodeCache.get(cacheKeyName);

  if (!authToken) {
    logger.debug('cache miss');

    const secretRequest = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: secretName }));
    logger.debug('secretRequest:', secretRequest);

    const appId = JSON.parse(secretRequest.SecretString ?? '').appKey;
    logger.debug('appId:', appId);

    const apiKey = JSON.parse(secretRequest.SecretString ?? '').apiSecret;
    logger.debug('apiKey:', apiKey);

    const authRequestConfig = {
      method: 'post',
      url: `https://api.yotpo.com/core/v3/stores/${appId}/access_tokens`,
      headers: { 'Content-Type': 'application/json' },
      data: { secret: apiKey },
    };

    authToken = (await axios(authRequestConfig))?.data?.access_token as string;
    logger.debug('authToken:', authToken);

    if (!authToken) throwThirdPartyFailureError('The Yotpo API returned no access token.');

    nodeCache.set(cacheKeyName, authToken);

    logger.debug('cache refreshed');
  } else {
    logger.debug('cache hit');
  }

  return authToken;
};
