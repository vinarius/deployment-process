import { StandardRetryStrategy } from '@aws-sdk/middleware-retry';

export const retryOptions = {
  maxAttempts: 10,
  retryStrategy: new StandardRetryStrategy(async () => 10),
};
