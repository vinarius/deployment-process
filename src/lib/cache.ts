import { BannedWord, BannedWordFactory, partitionKey } from '@internal-tech-solutions/sig-dynamo-factory';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, QueryCommandInput } from '@aws-sdk/lib-dynamodb';

import { getCache } from './sdk';
import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';

const cache = getCache();
const { tableName = '' } = process.env;
const logger = LoggerFactory.getLogger();
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);

export async function getBannedWords(): Promise<BannedWord[]> {
  let bannedWords: BannedWord[] | undefined = cache.get(BannedWordFactory.type);

  logger.debug('bannedWords:', bannedWords);

  if (!bannedWords) {
    logger.debug('cache miss');

    const queryForBannedWordsInput: QueryCommandInput = {
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': partitionKey,
      },
      ExpressionAttributeValues: {
        ':pk': BannedWordFactory.getPartitionKey()[partitionKey],
      },
    };

    logger.debug('queryForBannedWordsInput', queryForBannedWordsInput);

    const queryOutput = await docClient.query(queryForBannedWordsInput);

    logger.debug('queryOutput', queryOutput);

    bannedWords = queryOutput.Items as BannedWord[];

    cache.set(BannedWordFactory.type, bannedWords);
  } else {
    logger.debug('cache hit');
  }

  return bannedWords;
}
