import { resolve } from 'path';

import { spawn } from '../lib/spawn';

const docsLocation = resolve(__dirname, '..', 'docs');

export async function generateDiagram(): Promise<void> {
  try {
    await spawn(`npm run cdk-dia -- --target ${docsLocation}/architecture-diagram.png`);
    await spawn(`rm ${docsLocation}/architecture-diagram.dot`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  generateDiagram();
}
