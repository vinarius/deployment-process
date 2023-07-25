import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  InitiateAuthCommandOutput,
  ListUserPoolsCommand,
  UserPoolDescriptionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { batchWrite, BatchWriteRequestItems, Platform, SubscriptionInterval, Tier } from '@internal-tech-solutions/sig-dynamo-factory';
import dotenv from 'dotenv';
import { validate as validateEmail } from 'email-validator';
import { readFileSync, writeFileSync } from 'fs';
import { DateTime } from 'luxon';

import { stackNames } from '../../../infrastructure';
import { buildCreateUserProps } from '../../../lib/dynamo';
import { throwBadRequestError } from '../../../lib/errors';
import { fromRoot } from '../../../lib/fromRoot';
import { getAppConfig } from '../../../lib/getAppConfig';
import { retryOptions } from '../../../lib/retryOptions';
import { validateAwsProfile } from '../../../lib/validateAwsProfile';
import { validateEnvVars } from '../../../lib/validateEnvVars';
import { verboseLog } from '../../../lib/verboseLog';

interface PostmanEnv {
  name: string;
  values: {
    key: string;
    value: string;
    type: 'default' | 'secret';
    enabled: boolean;
  }[];
}

const { loadEnvFile } = process.env;

if (loadEnvFile === 'true') dotenv.config();

const {
  callSign = '',
  email = '',
  IS_CODEBUILD,
  firstName = '',
  lastName = '',
  buildPostman = 'true',
  password = '',
  tier = Tier.PREMIUM,
} = process.env;
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({ ...retryOptions });

async function devCreateUser(): Promise<void> {
  verboseLog(`Creating user ${callSign}...`);

  if (IS_CODEBUILD === 'true') process.exit(0);

  try {
    verboseLog('Validating environment variables...');

    validateEnvVars(['callSign', 'email', 'firstName', 'lastName']);

    const { profile, project, stage, env, isStagingEnv } = await getAppConfig();

    verboseLog('Validating AWS profile...');

    await validateAwsProfile(profile);

    process.env.AWS_PROFILE = profile;
    process.env.AWS_REGION = env.region;

    const tableName = `${project}-${stackNames.stateful}-table-${stage}`;
    const isValidEmail = validateEmail(email);
    let userPoolId: string;

    verboseLog('Validating email address...');

    if (!isValidEmail) throwBadRequestError('Email must be a valid email address');

    const { transactWriteInput, primaryKeys, user, batchWriteInput, transactionErrorHandling } = await buildCreateUserProps({
      email,
      callSign,
      tableName,
      firstName,
      lastName,
      tier: tier as Tier,
      [Tier.PREMIUM]: {
        platform: Platform.android,
        interval: SubscriptionInterval.MONTHLY,
        cycleStartDate: DateTime.now().toISO(),
        cycleEndDate: DateTime.now().plus({ months: 1 }).toISO(),
      },
    });

    verboseLog(`transactInput: ${JSON.stringify(transactWriteInput, null, 2)}`);
    verboseLog('Creating user in DynamoDB...');

    let userExists = false;

    await docClient.transactWrite(transactWriteInput).catch(err => {
      try {
        transactionErrorHandling(err);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        verboseLog('Error handling transaction error:', err);

        if (err?.reason !== 'ResourceExists') throw err;

        userExists = true;

        verboseLog('continuing...');
      }
    });

    if (!userExists) await batchWrite(tableName, batchWriteInput);

    verboseLog('Data written to DynamoDB');

    const createForgerockUser = isStagingEnv;
    if (createForgerockUser) {
      // Create user in forgerock - there is no admin api or a way to programmatically handle this
    } else {
      const userPools: UserPoolDescriptionType[] = [];
      let nextToken: string | undefined;

      do {
        const { UserPools = [], NextToken } = await cognitoClient.send(
          new ListUserPoolsCommand({
            MaxResults: 60,
            NextToken: nextToken,
          }),
        );

        userPools.push(...UserPools);
        nextToken = NextToken;
      } while (nextToken);

      const { Id } = userPools.find(pool => pool.Name?.startsWith(project) && pool.Name?.endsWith(stage)) as UserPoolDescriptionType;

      verboseLog('User pool id:', Id);

      if (!Id) throw new Error(`Could not find user pool for ${project} ${stage}`);

      userPoolId = Id;

      let userExistsInCognito = false;

      verboseLog('Creating user in cognito...');

      await cognitoClient
        .send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            MessageAction: 'SUPPRESS',
            Username: callSign,
            UserAttributes: [
              {
                Name: 'email',
                Value: email,
              },
              {
                Name: 'email_verified',
                Value: 'true',
              },
              {
                Name: 'custom:connectUUID',
                Value: user.userId,
              },
            ],
          }),
        )
        .catch(err => {
          verboseLog('Error creating user in cognito:', err);

          if (err?.name !== 'UsernameExistsException') throw err;

          userExistsInCognito = true;

          verboseLog('continuing...');
        });

      verboseLog('Setting user password in cognito...');

      await cognitoClient
        .send(
          new AdminSetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: callSign,
            Password: password,
            Permanent: true,
          }),
        )
        .catch(async err => {
          verboseLog('Error setting user password in cognito:', err);

          if (!userExistsInCognito) {
            await cognitoClient.send(
              new AdminDeleteUserCommand({
                UserPoolId: userPoolId,
                Username: callSign,
              }),
            );

            throw err;
          }

          verboseLog('continuing...');
        });
    }

    if (buildPostman === 'true') {
      if (isStagingEnv) {
        verboseLog('Skipping postman env build for staging env');
      } else {
        verboseLog('Building postman environment for feature env...');

        const unsetVars = [];

        if (!callSign) unsetVars.push('callSign');
        if (!password) unsetVars.push('password');
        if (!email) unsetVars.push('email');

        if (unsetVars.length) {
          console.log(`
    If you would like to automate building the postman env, create a .env file
    at the project root using the .env.template file including the following unset variables:

            ${unsetVars.join(', ')}
            `);

          process.exit(0);
        }

        const rawOutputs = readFileSync(fromRoot(['dist', `${stage}-outputs.json`]), 'utf8');
        const outputs = JSON.parse(rawOutputs);
        const apiEndpoint = outputs[`${project}-${stackNames.stateful}-stack-${stage}`]?.[
          `${project}apiUrl${stage.replace(/\W/g, '')}`
        ]?.slice(0, -1);
        const appClientId =
          outputs[`${project}-${stackNames.stateful}-stack-${stage}`]?.[`${project}appClientId${stage.replace(/\W/g, '')}`];
        const vodCfDomainName =
          outputs[`${project}-${stackNames.VOD}-stack-${stage}`]?.[`${project}vodCfDomainName${stage.replace(/\W/g, '')}`];
        const imagesCfDomainName =
          outputs[`${project}-${stackNames.images}-stack-${stage}`]?.[`${project}imagesCfDomainName${stage.replace(/\W/g, '')}`];
        const isValidEmail = validateEmail(email);
        const isValidDomain = email.endsWith('@itserv.io') || email.endsWith('@sigsauer.com');
        const validationErrors = [];

        if (!isValidEmail) validationErrors.push('Email must be a valid email address');
        if (!isValidDomain) validationErrors.push('Email must end with @itserv.io or @sigsauer.com');
        if (!apiEndpoint) validationErrors.push('Could not find API endpoint in outputs file');

        if (validationErrors.length) {
          console.error(validationErrors.join('\n'));
          process.exit(1);
        }

        verboseLog('initiating auth...');

        const InitiateAuthCommandOutput = (await cognitoClient
          .send(
            new InitiateAuthCommand({
              AuthFlow: 'USER_PASSWORD_AUTH',
              ClientId: appClientId,
              AuthParameters: {
                USERNAME: callSign,
                PASSWORD: password,
              },
            }),
          )
          .catch(async err => {
            const deleteWriteRequests: BatchWriteRequestItems = primaryKeys.map(key => ({
              DeleteRequest: {
                Key: key,
              },
            }));

            await batchWrite(tableName, deleteWriteRequests);
            await cognitoClient.send(
              new AdminDeleteUserCommand({
                UserPoolId: userPoolId,
                Username: callSign,
              }),
            );

            throw err;
          })) as InitiateAuthCommandOutput;

        const { AuthenticationResult } = InitiateAuthCommandOutput;

        const postmanEnv: PostmanEnv = {
          name: `${stage}-${callSign}`,
          values: [
            {
              key: 'baseUrl',
              value: apiEndpoint,
              enabled: true,
              type: 'default',
            },
            {
              key: 'callSign',
              value: callSign,
              enabled: true,
              type: 'default',
            },
            {
              key: 'password',
              value: password,
              enabled: true,
              type: 'secret',
            },
            {
              key: 'email',
              value: email,
              enabled: true,
              type: 'default',
            },
            {
              key: 'userId',
              value: user.userId,
              enabled: true,
              type: 'default',
            },
            {
              key: 'accessToken',
              value: AuthenticationResult?.IdToken as string, // cognito authorizer doesn't accept an access token without additional configuration - hack to use id token instead
              enabled: true,
              type: 'default',
            },
            {
              key: 'idToken',
              value: AuthenticationResult?.IdToken as string,
              enabled: true,
              type: 'default',
            },
            {
              key: 'refreshToken',
              value: AuthenticationResult?.RefreshToken as string,
              enabled: true,
              type: 'default',
            },
            {
              key: 'cognitoAccessToken',
              value: AuthenticationResult?.AccessToken as string,
              enabled: true,
              type: 'default',
            },
            {
              key: 'imagesCfDomainName',
              value: imagesCfDomainName,
              enabled: true,
              type: 'default',
            },
            {
              key: 'vodCfDomainName',
              value: vodCfDomainName,
              enabled: true,
              type: 'default',
            },
            {
              key: 'platform',
              value: 'web',
              enabled: true,
              type: 'default',
            },
            {
              key: 'isStagingEnv',
              value: 'false',
              enabled: true,
              type: 'default',
            },
          ],
        };

        writeFileSync(`${fromRoot()}/dist/${stage}-${callSign}.postman_environment.json`, JSON.stringify(postmanEnv, null, 2));

        verboseLog(`Postman environment created successfully.
    File written to ${fromRoot()}/dist/${stage}-${callSign}.postman_environment`);
      }
    }

    console.log(`User created successfully. callSign: ${callSign}, email: ${email}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  devCreateUser();
}
