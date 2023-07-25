import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { getAppConfig } from '../src/lib/getAppConfig';
import { spawn } from '../src/lib/spawn';

export async function deploy(): Promise<void> {
  try {
    console.time('Total deploy time');

    const { STACK = '--all' } = process.env;
    const { stage, applicationStage, isFeatureEnv } = await getAppConfig();

    if (!existsSync('./dist')) {
      mkdirSync('./dist', { recursive: true });
    }

    if (!existsSync('./dist/edgeCleanupQueue.json')) {
      writeFileSync('./dist/edgeCleanupQueue.json', JSON.stringify({ edgeLambdaNames: [] }));
    }

    const stacks = isFeatureEnv ? `${applicationStage}/**` : STACK;

    await spawn(
      `npx cdk deploy ${stacks} --concurrency 10 --require-approval never --outputs-file ./dist/${stage}-outputs.json`,
    );

    console.timeEnd('Total deploy time');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) void deploy();