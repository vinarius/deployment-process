import { spawn } from '../../lib/spawn';
import { deploy } from '../deploy';

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

let preservedEnv: NodeJS.ProcessEnv;

describe('deploy', () => {
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

  it('should deploy', async () => {
    await deploy();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should not include the profile when IS_CODEBUILD is set', async () => {
    process.env.IS_CODEBUILD = 'true';
    await deploy();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should exit with error if the child process exits with a status code of 1', async () => {
    (spawn as jest.Mock).mockImplementation(() => {
      throw new Error('test error');
    });

    await deploy();

    expect(process.exit).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    process.env = preservedEnv;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});