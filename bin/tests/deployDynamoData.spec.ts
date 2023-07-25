import { DynamoDBClient, ListTablesCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { readFileSync } from 'fs';

import { deployDynamoData } from '../deployDynamo';

jest.mock('../../lib/getAppConfig', () => ({
  __esModule: true,
  getAppConfig: jest.fn().mockResolvedValue({
    alias: 'test-alias',
    branch: 'test-branch',
    profile: 'test-profile',
    stage: 'test-stage',
    env: {
      account: 'test-account-id',
      region: 'test-region',
    },
    isStagingEnv: false,
    edgeCleanupQueueName: 'test-edge-cleanup-queue-name',
    project: 'test-project',
    acmCertificateId: 'test-acm-certificate-id',
    adminEmails: ['test-admin-email'],
    apiDomainName: 'test-api-domain-name',
    deployMfa: true,
    hostedZoneName: 'test-hosted-zone-name',
    magentoAdminTokenSecretName: 'test-magento-admin-token-secret-name',
    vpcId: 'test-vpc-id',
  }),
}));
jest.mock('../../lib/validateAwsProfile');
jest.mock('../../lib/fromRoot', () => ({
  __esModule: true,
  fromRoot: jest.fn().mockReturnValue('test-from-root'),
}));
jest.mock('fs', () => ({
  __esModule: true,
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(() =>
    JSON.stringify({
      'test-project-users-stack-test-stage': {
        'test-projectmobileClientIdteststage': 'test-mobileClientId',
        'test-projectwebClientIdteststage': 'test-webClientId',
      },
      'test-project-VOD-stack-test-stage': {
        'test-projectvodcfDomainNameteststage': 'test-vodcfDomainName',
      },
      'test-project-images-stack-test-stage': {
        'test-projectimagesCfDomainNameteststage': 'test-imagescfDomainName',
      },
      'test-project-podcast-stack-test-stage': {
        'test-projectpodcastAudioCfDomainNameteststage': 'test-podcastcfDomainName',
      },
    }),
  ),
}));

const mockDynamoClient = mockClient(DynamoDBClient)
  .on(ListTablesCommand)
  .resolves({
    TableNames: ['test-project-table-test-stage'],
  })
  .on(PutItemCommand)
  .resolves({});

mockClient(DynamoDBDocument).on(PutCommand).resolves({});

let preservedEnv: NodeJS.ProcessEnv;

describe('deployDynamoData', () => {
  beforeAll(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      return void 0 as never;
    });

    jest.spyOn(console, 'error');

    preservedEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should deploy DynamoDB data', async () => {
    await deployDynamoData();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should exit if a table for the given stage is not found', async () => {
    mockDynamoClient.on(ListTablesCommand).resolves({
      TableNames: [],
    });

    await deployDynamoData();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should read cdk output data from the given file', async () => {
    (readFileSync as jest.Mock).mockReturnValueOnce(() => JSON.stringify({}));

    mockDynamoClient.on(ListTablesCommand).resolves({
      TableNames: ['test-project-table-test-stage'],
    });

    await deployDynamoData();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should throw an error if the given file does not exist', async () => {
    (readFileSync as jest.Mock).mockReturnValue('');

    await deployDynamoData();

    expect(process.exit).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  afterAll(() => {
    jest.restoreAllMocks();
    process.env = preservedEnv;
  });
});
