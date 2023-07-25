import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { spawn } from '../src/lib/spawn';

export async function synth(): Promise<void> {
  const { STACK = '' } = process.env;

  console.time('>>> Synthesis complete');

  try {
    if (!existsSync('./dist')) {
      mkdirSync('./dist', { recursive: true });
    }

    if (!existsSync('./dist/edgeCleanupQueue.json')) {
      writeFileSync('./dist/edgeCleanupQueue.json', JSON.stringify({ edgeLambdaNames: [] }));
    }

    await spawn(`npm run cdk -- synth ${STACK} --quiet`);
    console.timeEnd('>>> Synthesis complete');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  synth();
}
