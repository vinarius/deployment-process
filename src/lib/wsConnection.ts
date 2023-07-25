import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DeleteCommandInput, DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { NotificationType, WsConnection, WsConnectionFactory } from '@internal-tech-solutions/sig-dynamo-factory';
import { TextEncoder } from 'util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { throwUnknownError } from './errors';
import { retryOptions } from './retryOptions';
import { LoggerFactory } from './loggerFactory';

const { tableName = '', webSocketEndpoint = '' } = process.env;
const logger = LoggerFactory.getLogger();
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);
const apiClient = new ApiGatewayManagementApiClient({
  ...retryOptions,
  endpoint: webSocketEndpoint,
});

// TODO: [SIGSEE10G-3883] refactor code using PostDataFactory to sendWebSocketMessage utility
export class PostDataFactory {
  public static buildMessage(action: NotificationType, data: unknown) {
    return new TextEncoder().encode(
      JSON.stringify({
        action,
        data,
      }),
    );
  }
}

export const sendWebSocketMessage = async (userId: string, action: NotificationType, message: string): Promise<void> => {
  const { connectionId } =
    ((
      await docClient.get({
        TableName: tableName,
        Key: WsConnectionFactory.getPrimaryKey(userId),
        ProjectionExpression: 'connectionId',
      })
    ).Item as Pick<WsConnection, 'connectionId'>) ?? {};

  logger.debug('connectionId:', connectionId);

  if (connectionId) {
    let messageSent = true;

    await apiClient
      .send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: new TextEncoder().encode(
            JSON.stringify({
              action,
              data: message,
            }),
          ),
        }),
      )
      .catch(async err => {
        logger.info('Error sending message to connectionId:', err);

        messageSent = false;

        if (err.name === 'GoneException') {
          logger.debug('GoneException caught. Connection no longer exists.');

          const deleteConnectionInput: DeleteCommandInput = {
            TableName: tableName,
            Key: WsConnectionFactory.getPrimaryKey(userId),
          };

          await docClient.delete(deleteConnectionInput);

          return;
        }

        throwUnknownError(err);
      });

    if (messageSent) logger.debug('Sent message to connectionId:', connectionId);
  } else {
    logger.debug('No connectionId found for userId:', userId);
  }

  return;
};
