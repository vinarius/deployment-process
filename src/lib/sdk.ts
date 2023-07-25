import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/lib/aws/index.js';
import NodeCache from 'node-cache';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

import { validateEnvVars } from './validateEnvVars';

const { stage = '', region = '', openSearchEndpoint = '' } = process.env;
const isStagingEnv = stage === 'prod' || stage === 'qa';
const secondsInAMinute = 60;
const devSeconds = 5;
const devMinutes = 0;
const prodSeconds = 0;
const prodMinutes = 5;
const devTtlInSeconds = devMinutes * secondsInAMinute + devSeconds;
const prodTtlInSeconds = prodMinutes * secondsInAMinute + prodSeconds;
const ttlInSecondsDefault = isStagingEnv ? prodTtlInSeconds : devTtlInSeconds;

export function getCache(ttlInSeconds: number = ttlInSecondsDefault): NodeCache {
  return new NodeCache({
    stdTTL: ttlInSeconds,
    useClones: false,
  });
}

export function getOpenSearchClient(): Client {
  validateEnvVars(['region', 'openSearchEndpoint']);

  // https://opensearch.org/docs/latest/clients/javascript/index/
  // https://opensearch-project.github.io/opensearch-js/2.2/index.html
  return new Client({
    ...AwsSigv4Signer({
      region,
      service: 'es',
      getCredentials: () => {
        return defaultProvider()();
      },
    }),
    node: `https://${openSearchEndpoint}`,
  });
}
