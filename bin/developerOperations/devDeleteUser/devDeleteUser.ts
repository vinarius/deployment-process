import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocument, GetCommandInput, QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import {
  batchWrite,
  Email,
  EmailFactory,
  gsi3IndexName,
  gsi3PartitionKey,
  partitionKey,
  PrimaryKey,
  sortKey,
  UserFactory,
} from '@internal-tech-solutions/sig-dynamo-factory';

import { getAppConfig } from '../../../lib/getAppConfig';
import { retryOptions } from '../../../lib/retryOptions';
import { emptyS3Directory } from '../../../lib/s3';
import { validateEnvVars } from '../../../lib/validateEnvVars';
import { verboseLog } from '../../../lib/verboseLog';
import { stackNames } from '../../../infrastructure';

const s3Client = new S3Client({ ...retryOptions });
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);
// const cognitoClient = new CognitoIdentityProviderClient({ ...retryOptions });

/**
 * Use with caution!!! This is irreversible.
 * This script purges a user from the application using developer credentials.
 *
 * If is feature env - delete user's cognito account
 * Delete user's image folder from s3
 * Delete user's records from dynamodb
 *
 */

async function devDeleteUser() {
  const { email = '' } = process.env;

  verboseLog(`Deleting user ${email}...`);

  validateEnvVars(['email']);

  try {
    const { stage, project, profile, env, isStagingEnv } = await getAppConfig();

    if (isStagingEnv) throw new Error('Cannot delete user from staging environment');

    process.env.AWS_PROFILE = profile;
    process.env.AWS_REGION = env.region;

    const tableName = `${project}-${stackNames.stateful}-table-${stage}`;
    const bucketName = `${stage}-${project}-api-images`;

    const getItemInput: GetCommandInput = {
      TableName: tableName,
      Key: EmailFactory.getPrimaryKey(email),
      ProjectionExpression: '#userId',
      ExpressionAttributeNames: {
        '#userId': 'userId',
      },
    };

    verboseLog('getItemInput:', getItemInput);

    const { userId } = (await docClient.get(getItemInput)).Item as Pick<Email, 'userId'>;

    verboseLog('userId:', userId);

    // TODO: fix this to work with userId instead of callSign
    // if (!isStagingEnv) {
    //   verboseLog('deleting user from cognito...');
    //   const userPools: UserPoolDescriptionType[] = [];
    //   let nextToken: string | undefined;

    //   do {
    //     const { UserPools = [], NextToken } = await cognitoClient.send(
    //       new ListUserPoolsCommand({
    //         MaxResults: 60,
    //         NextToken: nextToken,
    //       }),
    //     );

    //     userPools.push(...UserPools);
    //     nextToken = NextToken;
    //   } while (nextToken);

    //   const { Id = '' } = userPools.find(pool => pool.Name?.startsWith(project) && pool.Name?.endsWith(stage)) as UserPoolDescriptionType;

    //   // delete user from cognito
    //   await cognitoClient
    //     .send(
    //       new AdminDeleteUserCommand({
    //         UserPoolId: Id,
    //         Username: callSign,
    //       }),
    //     )
    //     .catch(err => {
    //       if (err.name !== 'UserNotFoundException') {
    //         throw err;
    //       }
    //     });
    // }

    // delete user's image folder from s3
    await emptyS3Directory(s3Client, bucketName, `users/${userId}`);

    // delete user's records from dynamodb
    const userItemPrimaryKeys: PrimaryKey[] = [];
    let ddbNextToken: QueryCommandOutput['LastEvaluatedKey'] | undefined;

    do {
      const { Items = [], LastEvaluatedKey } = await docClient.query({
        TableName: tableName,
        IndexName: gsi3IndexName,
        ExclusiveStartKey: ddbNextToken,
        KeyConditionExpression: '#gsi3pk = :gsi3pk',
        ProjectionExpression: '#pk, #sk',
        ExpressionAttributeNames: {
          '#gsi3pk': gsi3PartitionKey,
          '#pk': partitionKey,
          '#sk': sortKey,
        },
        ExpressionAttributeValues: {
          ':gsi3pk': UserFactory.getGsi3PartitionKey(userId)[gsi3PartitionKey],
        },
      });

      const primaryKeys = Items.map(item => ({
        [partitionKey]: item[partitionKey],
        [sortKey]: item[sortKey],
      }));

      userItemPrimaryKeys.push(...primaryKeys);
      ddbNextToken = LastEvaluatedKey;
    } while (ddbNextToken);

    const deleteRequests = userItemPrimaryKeys.map(primaryKey => ({
      DeleteRequest: {
        Key: primaryKey,
      },
    }));

    verboseLog('deleteRequests:', deleteRequests);

    await batchWrite(tableName, deleteRequests);

    console.log(`User ${email} deleted successfully`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  devDeleteUser();
}
