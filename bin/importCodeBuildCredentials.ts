import {
  CodeBuildClient,
  ImportSourceCredentialsCommand,
  ImportSourceCredentialsCommandInput,
  ImportSourceCredentialsCommandOutput,
  ListSourceCredentialsCommand,
  ListSourceCredentialsCommandInput,
  ListSourceCredentialsCommandOutput,
} from '@aws-sdk/client-codebuild';
import {
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  GetSecretValueCommandOutput,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import { getAppConfig } from '../lib/getAppConfig';
import { retryOptions } from '../lib/retryOptions';
import { verboseLog } from '../lib/verboseLog';

/**
 * Credentials are necessary for CodeBuild to download the source from the Github repository.
 * This script checks if they exist, and imports them if they do not for the target aws account.
 */

const { IS_CODEBUILD = '' } = process.env;
const codeBuildClient = new CodeBuildClient({ ...retryOptions });
const secretsManagerClient = new SecretsManagerClient({ ...retryOptions });

export async function validateSourceCredentials(): Promise<void> {
  try {
    /**
     * If not running in codebuild, fallback to shared ini profile credentials
     * for running this script by a developer directly.
     */
    if (!IS_CODEBUILD) {
      verboseLog('>>> CodeBuild not identified. Setting credentials to shared ini profile.');
      const { env, profile } = await getAppConfig();
      process.env.AWS_PROFILE = profile;
      process.env.AWS_REGION = env.region;
      verboseLog(`>>> Profile set to: ${profile}\n`);
    }

    const listCredsInput: ListSourceCredentialsCommandInput = {};
    const listCredsCommand = new ListSourceCredentialsCommand(listCredsInput);
    const listCredsOutput: ListSourceCredentialsCommandOutput = await codeBuildClient.send(listCredsCommand);

    if (listCredsOutput.sourceCredentialsInfos!.length > 0) {
      verboseLog(listCredsOutput.sourceCredentialsInfos);
      verboseLog('>>> Source credentials found.');
      verboseLog('>>> validate-source-credentials complete.\n');
      return;
    }

    verboseLog('>>> Source credentials not found. Importing...');

    const getSecretInput: GetSecretValueCommandInput = { SecretId: 'sig/cicd/github/token' };
    const getSecretCommand = new GetSecretValueCommand(getSecretInput);
    const getSecretOutput: GetSecretValueCommandOutput = await secretsManagerClient.send(getSecretCommand);

    const token = JSON.parse(getSecretOutput.SecretString as string)['sig-cicd'];

    verboseLog(`>>> Token: ${token}...`);

    const importCredsInput: ImportSourceCredentialsCommandInput = {
      authType: 'PERSONAL_ACCESS_TOKEN',
      serverType: 'GITHUB',
      token,
    };
    const importCredsCommand = new ImportSourceCredentialsCommand(importCredsInput);
    const importCredsOutput: ImportSourceCredentialsCommandOutput = await codeBuildClient.send(importCredsCommand);

    verboseLog(`>>> Import successful. Arn: ${importCredsOutput.arn}`);
    verboseLog('>>> validate-source-credentials complete.\n');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) validateSourceCredentials();
