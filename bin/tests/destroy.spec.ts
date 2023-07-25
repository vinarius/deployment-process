import { CloudFormationClient, ListStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import { existsSync, readFileSync } from 'fs';

import { getAppConfig } from '../../lib/getAppConfig';
import { destroy } from '../destroy';

jest.mock('../../lib/validateAwsProfile');
jest.mock('../../lib/getAppConfig', () => ({
  __esModule: true,
  getAppConfig: jest.fn().mockResolvedValue({
    alias: 'test-alias',
    branch: 'test-branch',
    profile: 'test-profile',
    stage: 'test-stage',
    env: {
      account: 'test-account-id',
      region: 'test-region'
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
    vpcId: 'test-vpc-id'
  })
}));
jest.mock('fs', () => ({
  __esModule: true,
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ({
    toString: jest.fn().mockReturnValue(JSON.stringify({
      edgeLambdaNames: ['test-edge-lambda-name']
    }))
  }))
}));

const mockCloudWatchLogsClient = mockClient(CloudWatchLogsClient)
  .on(DescribeLogGroupsCommand).resolves({
    logGroups: [
      {
        logGroupName: 'test-log-group-name-test-stage'
      }
    ]
  });
mockClient(SQSClient)
  .on(SendMessageCommand).resolves({});
mockClient(CloudFormationClient)
  .on(ListStacksCommand).resolves({
    NextToken: undefined,
    StackSummaries: [
      {
        StackName: 'test-stack-name-test-stage',
        StackStatus: 'CREATE_COMPLETE',
        CreationTime: new Date()
      }
    ]
  });

describe('destroy', () => {
  beforeAll(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      return void 0 as never;
    });

    jest.spyOn(console, 'error');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should destroy the cloudformation stacks', async () => {
    await destroy();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should default to empty array when log groups are undefined', async () => {
    mockCloudWatchLogsClient.on(DescribeLogGroupsCommand).resolves({
      logGroups: undefined
    });

    await destroy();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should parse a cleanup queue path when it exists', async () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    await destroy();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should send an sqs message to the cleanup queue', async () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    (readFileSync as jest.Mock).mockReturnValue({
      toString: jest.fn().mockReturnValue(JSON.stringify({
        edgeLambdaNames: [
          'test-edge-lambda-name'
        ]
      }))
    });

    await destroy();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should throw an error on staging env', async () => {
    (getAppConfig as jest.Mock).mockImplementationOnce(() => ({
      alias: 'test-alias',
      branch: 'test-branch',
      profile: 'test-profile',
      stage: 'test-stage',
      env: {
        account: 'test-account-id',
        region: 'test-region'
      },
      isStagingEnv: true,
      edgeCleanupQueueName: 'test-edge-cleanup-queue-name',
      project: 'test-project',
      acmCertificateId: 'test-acm-certificate-id',
      adminEmails: ['test-admin-email'],
      apiDomainName: 'test-api-domain-name',
      deployMfa: true,
      hostedZoneName: 'test-hosted-zone-name',
      magentoAdminTokenSecretName: 'test-magento-admin-token-secret-name',
      vpcId: 'test-vpc-id'
    }));

    await destroy();

    expect(process.exit).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});
