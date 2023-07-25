import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SendEmailCommand, SendEmailCommandInput, SESClient } from '@aws-sdk/client-ses';
import { DynamoDBDocument, GetCommandInput, PutCommandInput, QueryCommandInput, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  gsi1PartitionKey,
  gsi1SortKey,
  gsi2IndexName,
  gsi2PartitionKey,
  Platform,
  SubscriptionInterval,
  SubscriptionLatest,
  SubscriptionLatestFactory,
  SubscriptionVersionFactory,
  Tier,
  User,
  UserFactory,
} from '@internal-tech-solutions/sig-dynamo-factory';
import { DateTime } from 'luxon';
import { JWT } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import axios, { AxiosRequestConfig } from 'axios';
import { APIGatewayProxyEvent } from 'aws-lambda';

import { throwUnknownError, throwValidationError } from './errors';
import { LoggerFactory } from './loggerFactory';
import { retryOptions } from './retryOptions';
import { PaymentProcessorReqBody, RawLatestReceiptInfo } from '../src/subscription/models/types';
import { parseEventBody } from './lambda';
import { updateForgerockUserSubTier } from './forgerock';

const { tableName = '', emailFromDomain, androidPackageName = '' } = process.env;
const logger = LoggerFactory.getLogger();
const dynamoClient = new DynamoDBClient({ ...retryOptions });
const docClient = DynamoDBDocument.from(dynamoClient);
const sesClient = new SESClient({ ...retryOptions });

// CONNECT
export const changeUserTier = async (
  subscriptionLatestInput: SubscriptionLatest,
  tierChange: 'upgrade' | 'downgrade',
): Promise<SubscriptionLatest> => {
  const changeAction = tierChange === 'downgrade' ? 'Downgrading' : 'Upgrading';
  logger.debug(`${changeAction} user:`, subscriptionLatestInput.userId);

  const latestSubscriptionItem = SubscriptionLatestFactory.buildItem({
    ...subscriptionLatestInput,
    tier: tierChange === 'downgrade' ? Tier.BASIC : Tier.PREMIUM,
    latest: (subscriptionLatestInput.latest ?? 0) + 1,
  });

  delete latestSubscriptionItem[gsi1PartitionKey];
  delete latestSubscriptionItem[gsi1SortKey];
  // delete latestSubscriptionItem[gsi2PartitionKey];
  // delete latestSubscriptionItem[gsi2SortKey];
  delete latestSubscriptionItem[Tier.PREMIUM];

  logger.debug('latestSubscriptionItem:', latestSubscriptionItem);

  const versionedSubscriptionItem = SubscriptionVersionFactory.buildItem(latestSubscriptionItem);

  logger.debug('versionedSubscriptionItem:', versionedSubscriptionItem);

  const transactWriteInput: TransactWriteCommandInput = {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: latestSubscriptionItem,
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: versionedSubscriptionItem,
        },
      },
    ],
  };

  logger.debug('transactWriteInput:', JSON.stringify(transactWriteInput, null, 2));

  await docClient.transactWrite(transactWriteInput).catch(async err => {
    logger.error(`Error ${changeAction.toLowerCase()} user:`, err);
    throwUnknownError(err);
  });

  const { email } = (await getUserById(subscriptionLatestInput.userId)) as User;

  await updateForgerockUserSubTier(latestSubscriptionItem.tier, email);

  return latestSubscriptionItem;
};

export const determineEventSource = (event: APIGatewayProxyEvent): string | Array<string | Record<string, unknown>> => {
  const validationError = {
    keyword: 'required',
    message: 'Request body is required',
    instancePath: '',
    schemaPath: '#/required',
    params: {
      missingProperty: 'body',
    },
  };

  const { body } = event;
  if (!body) throwValidationError([validationError]);

  const bodyObj = JSON.parse(body!);
  if (!bodyObj) throwValidationError([validationError]);

  const parsedBody = parseEventBody({ ...event, body: JSON.stringify(bodyObj) }) as PaymentProcessorReqBody;
  logger.debug('parsedBody:', JSON.stringify(parsedBody, null, 2));

  // Apple
  if ('notificationType' in parsedBody || 'signedPayload' in parsedBody) return 'app_store';
  // Google
  else if ('subscriptionNotification' in parsedBody || ('message' in parsedBody && 'subscription' in parsedBody)) {
    const decodedMessageData = Buffer.from(parsedBody.message?.data ?? '', 'base64').toString('utf-8');
    logger.debug('parsedBody.message.data:', JSON.stringify(JSON.parse(decodedMessageData), null, 2));
    if (JSON.parse(decodedMessageData).testNotification) return 'google_test';
    else return ['google_play', JSON.parse(decodedMessageData)];
  }
  throw new Error('Unable to determine event source');
};

export const getSubscriptionLatestByGsi2 = async (platform: Platform, subId: string): Promise<SubscriptionLatest> => {
  const getSubscriptionLatestInput: QueryCommandInput = {
    TableName: tableName,
    IndexName: gsi2IndexName,
    KeyConditionExpression: '#gsi2pk = :gsi2pk',
    ExpressionAttributeNames: {
      '#gsi2pk': gsi2PartitionKey,
    },
    ExpressionAttributeValues: {
      ':gsi2pk': SubscriptionLatestFactory.getGsi2PartitionKey(platform, subId)[gsi2PartitionKey],
    },
  };
  logger.debug('getSubscriptionLatestInput:', getSubscriptionLatestInput);

  const subscription = await docClient.query(getSubscriptionLatestInput);
  logger.debug('subscription:', JSON.stringify(subscription, null, 2));

  const subscriptionItem = subscription.Items?.[0];
  logger.debug('subscriptionItem:', subscriptionItem);

  return subscriptionItem as SubscriptionLatest;
};

export const getSubscriptionLatestByUserId = async (userId: string): Promise<SubscriptionLatest> => {
  const getSubscriptionLatestInput: GetCommandInput = {
    TableName: tableName,
    Key: SubscriptionLatestFactory.getPrimaryKey(userId),
  };
  logger.debug('getSubscriptionLatestInput:', getSubscriptionLatestInput);

  const subscription = (await docClient.get(getSubscriptionLatestInput)).Item as SubscriptionLatest;
  logger.debug('subscription:', subscription);

  return subscription;
};

export const getUserById = async (userId: string): Promise<User> => {
  const getUserInput: GetCommandInput = {
    TableName: tableName,
    Key: UserFactory.getPrimaryKey(userId),
  };
  logger.debug('getUserInput:', getUserInput);

  const user = (await docClient.get(getUserInput)).Item as User;
  logger.debug('user:', user);

  return user;
};

export const sendEmail = async ({ email, subject, body }: { email: string; subject: string; body: string }) => {
  const sendEmailParams: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Text: {
          Data: body,
        },
      },
    },
    Source: `noreply@${emailFromDomain}`,
  };

  await sesClient.send(new SendEmailCommand(sendEmailParams)).catch(async err => {
    logger.debug(`error sending the "${subject}" email:`, err);
    throwUnknownError(err);
  });
};

export const newSubscription = async (email: string, interval: SubscriptionInterval, subLatest: SubscriptionLatest) => {
  const newSubVersion = SubscriptionVersionFactory.buildItem(subLatest);

  logger.debug('newSubVersion:', newSubVersion);

  const transactWriteInput: TransactWriteCommandInput = {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: newSubVersion,
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: subLatest,
        },
      },
    ],
  };

  logger.debug('transactWriteInput:', JSON.stringify(transactWriteInput, null, 2));

  await docClient.transactWrite(transactWriteInput);

  // Friday Oct 14, 1983
  const renewalDate = DateTime.fromISO(subLatest?.[Tier.PREMIUM]?.cycleEndDate as string).toFormat('cccc LLL dd, yyyy');

  await sendEmail({
    email,
    subject: 'Subscription Confirmation',
    body:
      'Thank you for subscribing to the SIG app premium tier. ' +
      `This email confirms your subscription. Your subscription will renew ${renewalDate} on a ${interval} basis.`,
  });

  await updateForgerockUserSubTier(subLatest.tier, email);

  return subLatest;
};

// GOOGLE
export const androidSubscriptionId = 'sig.connect.premium';

export const getGoogleAccessToken = async (androidPrivateKey: string) => {
  const client = new JWT({
    email: 'sigconnect@pc-api-6424520136324850878-982.iam.gserviceaccount.com',
    key: androidPrivateKey,
    keyId: '381ab8ab24ca4cf69fbd26ee7e75d01d33db9dd7',
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  logger.debug('client:', JSON.stringify(client, null, 2));

  const authorizedClient = await client.authorize();
  logger.debug('authorizedClient:', JSON.stringify(authorizedClient, null, 2));

  const accessToken = authorizedClient?.access_token;
  logger.debug('accessToken:', accessToken);

  return accessToken;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateGoogleCycle = async (existingSubscription: SubscriptionLatest, purchaseData: any): Promise<SubscriptionLatest> => {
  logger.debug('Updating cycle timestamps for user:', existingSubscription.userId);

  const { startTimeMillis = '', expiryTimeMillis = '' } = purchaseData;

  const interval = purchaseData?.priceAmountMicros === '9990000' ? SubscriptionInterval.MONTHLY : SubscriptionInterval.YEARLY;

  const subscription = {
    ...existingSubscription,
    [Tier.PREMIUM]: {
      ...existingSubscription[Tier.PREMIUM],
      googleEventId: purchaseData?.orderId,
      cycleStartDate: DateTime.fromMillis(+startTimeMillis).toISO(),
      cycleEndDate: DateTime.fromMillis(+expiryTimeMillis).toISO(),
      interval,
    },
  };

  logger.debug('subscription:', subscription);

  const putInput: PutCommandInput = {
    TableName: tableName,
    Item: subscription,
  };

  logger.debug('putInput:', putInput);

  await docClient.put(putInput);

  return subscription;
};

export const validateGoogleSubscription = async (accessToken: string, purchaseToken: string) => {
  const validatePurchaseRequest: AxiosRequestConfig = {
    method: 'get',
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${androidPackageName}/purchases/subscriptions/${androidSubscriptionId}/tokens/${purchaseToken}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  logger.debug('validatePurchaseRequest:', validatePurchaseRequest);

  const axiosResponse = await axios(validatePurchaseRequest).catch(error => {
    logger.debug('validatePurchaseResponse:', error?.response?.data);

    throwUnknownError('Unable to validate purchase');
  });

  const validatePurchaseResponse = axiosResponse?.data;

  logger.debug('validatePurchaseResponse:', validatePurchaseResponse);

  return validatePurchaseResponse;
};

// APPLE
export const getAppleAccessToken = async (applePrivateKey: string) => {
  const currentUnixTime = Math.floor(Date.now() / 1000);
  const oneHourFromNow = currentUnixTime + 60 * 60;

  const token = jwt.sign(
    {
      iat: currentUnixTime,
      exp: oneHourFromNow,
      bid: 'com.sigsauer.connect.qa',
      aud: 'appstoreconnect-v1',
    },
    applePrivateKey,
    {
      algorithm: 'ES256',
      keyid: 'FMSV2622FR',
      issuer: '69a6de8c-03b6-47e3-e053-5b8c7c11a4d1',
    },
  );

  logger.debug('token:', token);

  return token;
};

export const validateAppleSubscription = async (transactionId: string, applePrivateKey: string) => {
  const accessToken = await getAppleAccessToken(applePrivateKey);

  const getTransactionInfoRequest: AxiosRequestConfig = {
    method: 'get',
    url: `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  logger.debug('getTransactionInfoRequest:', getTransactionInfoRequest);

  const getTransactionInfoResponse = await axios(getTransactionInfoRequest);
  logger.debug('getTransactionInfoResponse:', getTransactionInfoResponse);

  const { signedTransactionInfo = '' } = getTransactionInfoResponse?.data as { signedTransactionInfo: string };
  logger.debug('signedTransactionInfo:', signedTransactionInfo);

  const signedTransactionInfoParts = signedTransactionInfo.split('.');
  const decodedPayload = Buffer.from(signedTransactionInfoParts[1], 'base64').toString('utf-8');
  logger.debug('decodedPayload:', decodedPayload);

  return JSON.parse(decodedPayload);
};

export const updateAppleCycle = async (
  existingSubscription: SubscriptionLatest,
  latestReceiptInfo: RawLatestReceiptInfo,
): Promise<SubscriptionLatest> => {
  logger.debug('Updating cycle timestamps for user:', existingSubscription.userId);

  const subscription = {
    ...existingSubscription,
    [Tier.PREMIUM]: {
      ...existingSubscription[Tier.PREMIUM],
      appleEventId: latestReceiptInfo.transactionId,
      interval: latestReceiptInfo.productId.toLowerCase().includes('yearly') ? SubscriptionInterval.YEARLY : SubscriptionInterval.MONTHLY,
      cycleEndDate: DateTime.fromMillis(+latestReceiptInfo.expiresDate).toISO(),
      cycleStartDate: DateTime.fromMillis(+latestReceiptInfo.purchaseDate).toISO(),
    },
  };

  logger.debug('subscription:', subscription);

  const putInput: PutCommandInput = {
    TableName: tableName,
    Item: subscription,
  };

  logger.debug('putInput:', putInput);

  await docClient.put(putInput);

  return subscription;
};
