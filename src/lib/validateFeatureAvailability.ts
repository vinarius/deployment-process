import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, GetCommandInput } from '@aws-sdk/lib-dynamodb';
import { AppConfig, AppConfigFactory, Feature, Platform } from '@internal-tech-solutions/sig-dynamo-factory';

import { throwBadRequestError, throwForbiddenError } from './errors';
import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';
import { getCache } from './sdk';

const logger = LoggerFactory.getLogger();
const nodeCache = getCache();
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);

export async function validateFeatureAvailability(feature: Feature, platform: Platform): Promise<void> {
  logger.debug(`validating feature availability for ${feature} on platform ${platform}`);

  if (!platform) throwBadRequestError('platform is required');

  let cache: AppConfig | undefined = nodeCache.get(AppConfigFactory.type);

  logger.debug('cache:', cache);

  if (!cache) {
    const getItemInput: GetCommandInput = {
      TableName: process.env.tableName,
      Key: AppConfigFactory.getPrimaryKey(),
    };

    logger.debug('getItemInput:', getItemInput);

    const appConfig = (await docClient.get(getItemInput)).Item as AppConfig;

    logger.debug('appConfig:', appConfig);

    nodeCache.set(AppConfigFactory.type, appConfig);

    cache = appConfig;
  }

  if (!cache.features[feature][platform])
    throwForbiddenError(
      `${
        feature[0].toUpperCase() + feature.slice(1)
      } is not available. This can be due to a temporary or permanent condition. Please try again later.`,
    );
}
