import { getAppConfig } from '../../lib/getAppConfig';
import { spawn } from '../../lib/spawn';
import { test } from '../test';

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
jest.mock('../../lib/spawn');
jest.mock('../../lib/validateAwsProfile');

let preservedEnv: NodeJS.ProcessEnv;

describe('test', () => {
  beforeAll(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      return void 0 as never;
    });

    jest.spyOn(console, 'error');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    preservedEnv = { ...process.env };
  });

  it('should execute the test command', async () => {
    await expect(test()).resolves.not.toThrowError();
  });

  it('should call process.exit with error if the child process exits with a status code of 1', async () => {
    (spawn as jest.Mock).mockImplementationOnce(() => {
      throw new Error('test error');
    });

    await test();

    expect(process.exit).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should set access key secrets when IS_GITHUB is set', async () => {
    process.env.IS_GITHUB = 'true';
    await expect(test()).resolves.not.toThrowError();
  });

  it('should set prod access key secret when stage is prod', async () => {
    (getAppConfig as jest.Mock).mockResolvedValue({
      alias: 'test-alias',
      branch: 'test-branch',
      profile: 'test-profile',
      stage: 'prod',
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
    });

    process.env.IS_GITHUB = 'true';
    await expect(test()).resolves.not.toThrowError();
  });

  it('should set qa access key secret when stage is qa', async () => {
    (getAppConfig as jest.Mock).mockResolvedValue({
      alias: 'test-alias',
      branch: 'test-branch',
      profile: 'test-profile',
      stage: 'qa',
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
    });

    process.env.IS_GITHUB = 'true';
    await expect(test()).resolves.not.toThrowError();
  });

  it('should execute jest with the silent flag when VERBOSE is not set', async () => {
    process.env.VERBOSE = 'true';
    await expect(test()).resolves.not.toThrowError();
  });

  it('should execute jest with the silent flag when VERBOSE is not set', async () => {
    process.env.VERBOSE = undefined;
    await expect(test()).resolves.not.toThrowError();
  });

  it('should execute jest without the watch flag when WATCH is not set', async () => {
    process.env.WATCH = undefined;
    await expect(test()).resolves.not.toThrowError();
  });

  afterEach(() => {
    process.env = preservedEnv;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});