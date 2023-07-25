import { DynamoDBClient, DynamoDBClientConfig, ListTablesCommand, ListTablesCommandOutput } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { AppConfigFactory, Feature, Platform } from '@internal-tech-solutions/sig-dynamo-factory';
import { readFileSync } from 'fs';

import { fromRoot } from '../lib/fromRoot';
import { getAppConfig } from '../lib/getAppConfig';
import { retryOptions } from '../lib/retryOptions';
import { validateAwsProfile } from '../lib/validateAwsProfile';
import { stackNames } from '../infrastructure';

export async function deployDynamoData(): Promise<void> {
  const { IS_CODEBUILD } = process.env;
  try {
    const { stage, profile, project, hostedZoneName, isStagingEnv } = await getAppConfig();
    const tableName = `${project}-${stackNames.stateful}-table-${stage}`;

    const dynamoOptions: DynamoDBClientConfig = {
      ...retryOptions,
    };

    if (!IS_CODEBUILD) {
      await validateAwsProfile(profile);
      dynamoOptions.credentials = fromIni({ profile });
    }

    const dynamoDBClient = new DynamoDBClient(dynamoOptions);
    const docClient = DynamoDBDocument.from(dynamoDBClient);

    const tables = [];
    let nextToken;

    do {
      const listTablesResponse: ListTablesCommandOutput = await dynamoDBClient.send(
        new ListTablesCommand({
          ExclusiveStartTableName: nextToken,
        }),
      );

      const { LastEvaluatedTableName, TableNames } = listTablesResponse;

      tables.push(...(TableNames as string[]));
      nextToken = LastEvaluatedTableName;
    } while (nextToken);

    if (!tables.includes(`${project}-${stackNames.stateful}-table-${stage}`)) return;

    const rawOutputs = JSON.parse(readFileSync(fromRoot(`dist/${stage}-outputs.json`), 'utf8') ?? '{}');

    const vodCfDomainName = isStagingEnv
      ? stage === 'prod'
        ? `vod.${hostedZoneName}`
        : stage === 'qa'
        ? `vod.${hostedZoneName}`
        : `vod.${hostedZoneName}`
      : rawOutputs?.[`${project}-vod-stack-${stage}`]?.[`${project}vodcfDomainName${stage.replace(/\W/g, '')}`] ?? 'cdk output empty';

    await docClient.update({
      TableName: tableName,
      Key: AppConfigFactory.getPrimaryKey(),
      UpdateExpression: 'set #vodCfDomainName = :vodCfDomainName, #imagesCfDomainName = :imagesCfDomainName',
      ExpressionAttributeNames: {
        '#vodCfDomainName': 'vodCfDomainName',
        '#imagesCfDomainName': 'imagesCfDomainName',
      },
      ExpressionAttributeValues: {
        ':vodCfDomainName': vodCfDomainName,
        ':imagesCfDomainName':
          rawOutputs?.[`${project}-images-stack-${stage}`]?.[`${project}imagescfDomainName${stage.replace(/\W/g, '')}`] ??
          'cdk output empty',
      },
    });

    const platforms = Object.keys(Platform).reduce((acc, key) => {
      acc[key as Platform] = true;
      return acc;
    }, {} as Record<Platform, boolean>);

    await docClient
      .update({
        TableName: tableName,
        Key: AppConfigFactory.getPrimaryKey(),
        UpdateExpression: 'set #features = :features',
        ConditionExpression: 'attribute_not_exists(#features)',
        ExpressionAttributeNames: {
          '#features': 'features',
        },
        ExpressionAttributeValues: {
          ':features': Object.keys(Feature).reduce((acc, key) => {
            acc[key as Feature] = platforms;
            return acc;
          }, {} as Record<Feature, Record<Platform, boolean>>),
        },
      })
      .catch(err => {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      });

    console.log('\n>>> DynamoDB data deployed.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  deployDynamoData();
}
