import { Ban, BanFactory, BanPenaltyLevel } from '@internal-tech-solutions/sig-dynamo-factory';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, GetCommandInput } from '@aws-sdk/lib-dynamodb';
import { DateTime } from 'luxon';

import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';
import { throwForbiddenError } from './errors';

const { tableName = '' } = process.env;
const logger = LoggerFactory.getLogger();
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);

export async function validateNotBanned(
  userId: string,
  banLevelToRejectAt: BanPenaltyLevel,
  banMessage = 'You are banned from performing this action',
): Promise<void> {
  logger.debug('userId:', userId);
  logger.debug('banLevelToRejectAt:', banLevelToRejectAt);

  const getUserBanInput: GetCommandInput = {
    TableName: tableName,
    Key: BanFactory.getPrimaryKey(userId),
  };

  logger.debug('getUserBanInput:', getUserBanInput);

  const userBan = (await docClient.get(getUserBanInput))?.Item as Ban;

  logger.debug('userBan:', userBan);

  if (!userBan) return;

  const { banPenaltyLevel = BanPenaltyLevel.P0, TTL = 0 } = userBan;
  const banExpired = TTL <= DateTime.utc().toSeconds();

  logger.debug('banPenaltyLevel:', banPenaltyLevel);
  logger.debug('TTL:', TTL);
  logger.debug('banExpired:', banExpired);

  if (banExpired && banPenaltyLevel <= BanPenaltyLevel.P3) return;

  if (banPenaltyLevel >= banLevelToRejectAt) throwForbiddenError(banMessage);
}
