/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import {
  BatchGetCommandInput,
  DynamoDBDocument,
  QueryCommandInput,
  ScanCommandOutput,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  AdminAppUser,
  AdminAppUserFactory,
  BaseFactory,
  BatchWriteRequestItems,
  CallSignFactory,
  EmailFactory,
  FollowerFactory,
  Friend,
  FriendFactory,
  gsi1IndexName,
  gsi1PartitionKey,
  gsi4IndexName,
  gsi4PartitionKey,
  NotificationType,
  partitionKey,
  Platform,
  PrimaryKey,
  sortKey,
  Status,
  SubscriptionInterval,
  SubscriptionLatestFactory,
  SubscriptionVersionFactory,
  Tier,
  User,
  UserFactory,
  UserStatusFactory,
  WsConnectionFactory,
} from '@internal-tech-solutions/sig-dynamo-factory';
import winston from 'winston';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { PostDataFactory } from './wsConnection';
import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';
import { throwResourceExistsError, throwUnknownError } from './errors';

const logger = LoggerFactory.getLogger();
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);

export interface DynamoScanItemsResponse {
  [key: string]: any;
}

type ProjectedAccount = Pick<AdminAppUser, 'userId' | 'type'>;

export async function scan(client: DynamoDBDocument, tableName: string): Promise<DynamoScanItemsResponse[]> {
  let nextToken;
  const totalData: DynamoScanItemsResponse[] = [];

  do {
    const response: ScanCommandOutput = await client.scan({
      TableName: tableName,
      ExclusiveStartKey: nextToken,
    });

    totalData.push(...(response.Items as DynamoScanItemsResponse[]));
    nextToken = response.LastEvaluatedKey;
  } while (nextToken);

  return totalData;
}

/**
 * Broadcast status update to online friends the user's updated status.
 *
 *     - Query friends list.
 *     - Batch get wsConnectionIds.
 *     - Send message to each wsConnectionId.
 */
export async function broadcastStatusUpdate(
  tableName: string,
  docClient: DynamoDBDocument,
  apiClient: ApiGatewayManagementApiClient,
  logger: winston.Logger,
  userId: string,
  status: Status,
) {
  const queryInput: QueryCommandInput = {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk and begins_with(#sk, :sk)',
    ProjectionExpression: '#friendUserId',
    ExpressionAttributeNames: {
      '#pk': partitionKey,
      '#sk': sortKey,
      '#friendUserId': 'friendUserId',
    },
    ExpressionAttributeValues: {
      ':pk': BaseFactory.getFriendsListPartitionKey(userId)[partitionKey],
      ':sk': FriendFactory.getSortKeyPrefix1(),
    },
  };

  logger.debug('queryInput:', JSON.stringify(queryInput, null, 2));

  const friends = (await docClient.query(queryInput))?.Items as Friend[];

  logger.debug('friends:', friends);

  // divide into batches of 100
  const batchGetInput2: BatchGetCommandInput[] = [];

  for (let i = 0; i < friends.length; i += 100) {
    batchGetInput2.push({
      RequestItems: {
        [tableName]: {
          Keys: friends.slice(i, i + 100).map(({ friendUserId }) => WsConnectionFactory.getPrimaryKey(friendUserId)),
          ProjectionExpression: '#connectionId',
          ExpressionAttributeNames: {
            '#connectionId': 'connectionId',
          },
        },
      },
    });
  }

  logger.debug('batchGetInput2:', batchGetInput2);

  const wsConnectionIds: string[] = (await Promise.all(batchGetInput2.map(input => docClient.batchGet(input))))
    .map(({ Responses }) => Responses?.[tableName])
    .flat()
    .map(item => item!.connectionId);

  logger.debug('wsConnectionIds:', wsConnectionIds);

  const settledPromises = await Promise.allSettled(
    wsConnectionIds.map(connectionId => {
      return apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: PostDataFactory.buildMessage(NotificationType.USER_STATUS_UPDATE, { userId, status }),
        }),
      );
    }),
  );

  logger.debug('settledPromises.length:', settledPromises.length);

  const errors = settledPromises.filter(({ status }) => status === 'rejected');

  if (errors.length) {
    logger.warn('errors:', errors.slice(0, 10));
  }
}

type ProjectedAdminUser = Pick<AdminAppUser, 'userId'>;

export async function buildCreateUserProps(input: {
  email: string;
  callSign: string;
  tableName: string;
  firstName?: string;
  lastName?: string;
  tier?: Tier;
  [Tier.PREMIUM]?: {
    platform: Platform;
    interval: SubscriptionInterval;
    cycleEndDate: string;
    cycleStartDate: string;
    receiptData?: string;
    appleSubId?: string;
    appleEventId?: string;
    googleSubId?: string;
    googleEventId?: string;
  };
}): Promise<{
  transactWriteInput: TransactWriteCommandInput;
  user: User;
  primaryKeys: PrimaryKey[];
  batchWriteInput: BatchWriteRequestItems;
  transactionErrorHandling: (err: any) => void;
}> {
  const { email, callSign, tableName, firstName = '', lastName = '', tier = Tier.BASIC } = input;

  const queryEmailInput: QueryCommandInput = {
    TableName: tableName,
    IndexName: gsi1IndexName,
    KeyConditionExpression: '#gsi1pk = :gsi1pk',
    FilterExpression: '#type = :type',
    ProjectionExpression: '#userId, #type',
    ExpressionAttributeNames: {
      '#gsi1pk': gsi1PartitionKey,
      '#type': 'type',
      '#userId': 'userId',
    },
    ExpressionAttributeValues: {
      ':gsi1pk': AdminAppUserFactory.getGsi1PartitionKey(email)[gsi1PartitionKey],
      ':type': AdminAppUserFactory.type,
    },
  };

  logger.debug('queryEmailInput:', JSON.stringify(queryEmailInput, null, 2));

  const { Items: existingAdminAccountItem, Count = 0 } = await docClient.query(queryEmailInput);

  logger.debug('existingAdminAccountItem:', JSON.stringify(existingAdminAccountItem, null, 2));
  logger.debug('Count:', Count);

  const isExistingAdminAccount = Count > 0;
  const existingAccount = existingAdminAccountItem?.[0] as ProjectedAccount | undefined;

  logger.debug('isExistingAdminAccount:', isExistingAdminAccount);
  logger.debug('existingAccount:', existingAccount);

  const userItem = UserFactory.buildItem({
    callSign,
    email,
    firstName,
    lastName,
    isAdmin: isExistingAdminAccount,
    ...(isExistingAdminAccount && { userId: (existingAccount as ProjectedAccount).userId }),
  });

  const { userId } = userItem;

  const emailItem = EmailFactory.buildItem({
    email,
    userId,
  });

  const callSignItem = CallSignFactory.buildItem({
    callSign,
    userId,
  });

  const subscriptionLatestItem = SubscriptionLatestFactory.buildItem({
    userId,
    tier,
    ...(tier === Tier.PREMIUM && {
      ...input[Tier.PREMIUM],
    }),
    latest: 1,
  });

  const subscriptionVersionItem = SubscriptionVersionFactory.buildItem(subscriptionLatestItem);

  const userStatusItem = UserStatusFactory.buildItem({
    userId,
  });

  const transactItems: TransactWriteCommandInput['TransactItems'] = [
    {
      Put: {
        TableName: tableName,
        Item: emailItem,
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
        ConditionExpression: 'attribute_not_exists(#pk)',
        ExpressionAttributeNames: { '#pk': partitionKey },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: callSignItem,
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
        ConditionExpression: 'attribute_not_exists(#pk)',
        ExpressionAttributeNames: { '#pk': partitionKey },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: userItem,
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: subscriptionLatestItem,
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: subscriptionVersionItem,
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: userStatusItem,
      },
    },
  ];

  const batchWriteInput: BatchWriteRequestItems = [];

  let nextToken;
  const adminUsers: ProjectedAdminUser[] = [];

  do {
    const queryAdminUsersInput: QueryCommandInput = {
      TableName: tableName,
      IndexName: gsi4IndexName,
      KeyConditionExpression: '#gsi4pk = :gsi4pk',
      ProjectionExpression: '#userId',
      ExpressionAttributeNames: {
        '#gsi4pk': gsi4PartitionKey,
        '#userId': 'userId',
      },
      ExpressionAttributeValues: {
        ':gsi4pk': AdminAppUserFactory.getGsi4PartitionKey()[gsi4PartitionKey],
      },
      ExclusiveStartKey: nextToken,
    };

    logger.debug('queryAdminUsersInput:', JSON.stringify(queryAdminUsersInput, null, 2));

    const { Items = [], LastEvaluatedKey, Count } = await docClient.query(queryAdminUsersInput);

    logger.debug('Count:', Count);
    logger.debug('Items[0]:', Items[0]);

    adminUsers.push(...(Items as ProjectedAdminUser[]));
    nextToken = LastEvaluatedKey;
  } while (nextToken);

  logger.debug('adminUsers.length:', adminUsers.length);

  const primaryKeys: PrimaryKey[] = transactItems.map(({ Put }) => {
    const { Item } = Put as { Item: Record<string, unknown> };

    return {
      [partitionKey]: Item[partitionKey],
      [sortKey]: Item[sortKey],
    };
  }) as PrimaryKey[];

  for (const adminUser of adminUsers) {
    const followerItem = FollowerFactory.buildItem({
      userId,
      followerUserId: adminUser.userId,
    });

    batchWriteInput.push({
      PutRequest: {
        Item: followerItem,
      },
    });

    primaryKeys.push(FollowerFactory.getPrimaryKey(followerItem.userId, followerItem.followerUserId));
  }

  return {
    transactWriteInput: {
      TransactItems: transactItems,
    },
    user: userItem,
    primaryKeys,
    batchWriteInput,
    transactionErrorHandling: (err: any) => {
      logger.info(err);

      if (err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') throwResourceExistsError(`Email ${email} already exists`);
      if (err.CancellationReasons?.[1]?.Code === 'ConditionalCheckFailed') throwResourceExistsError(`Call sign ${callSign} already exists`);

      throwUnknownError(err);
    },
  };
}
