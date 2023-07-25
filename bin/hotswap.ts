import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { getAppConfig } from '../lib/getAppConfig';
import { spawn } from '../lib/spawn';

export async function hotswap(): Promise<void> {
  try {
    const { profile, isStagingEnv } = await getAppConfig();

    if (!existsSync('./dist')) {
      mkdirSync('./dist', { recursive: true });
    }

    if (!existsSync('./dist/edgeCleanupQueue.json')) {
      writeFileSync('./dist/edgeCleanupQueue.json', JSON.stringify({ edgeLambdaNames: [] }));
    }

    if (isStagingEnv) throw new Error('Hotswap is not supported for staging environments');

    const stackName: string = process.env.STACK || '--all';
    await spawn(
      `npm run cdk -- deploy ${stackName} --hotswap --require-approval never --profile ${profile} --outputs-file ./dist/cdk-outputs.json --concurrency 10`,
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  hotswap();
}
