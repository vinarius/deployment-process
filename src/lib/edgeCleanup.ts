import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

import { fromRoot } from './fromRoot';

export function queueEdgeLambdaCleanup(functionName: string): void {
  const cleanupQueuePath = fromRoot(['dist']);
  const cleanupQueueFile = `${cleanupQueuePath}/edgeCleanupQueue.json`;

  if (!existsSync(cleanupQueuePath)) {
    mkdirSync(cleanupQueuePath, { recursive: true });
    writeFileSync(cleanupQueueFile, JSON.stringify({ edgeLambdaNames: [] }, null, 2));
  }

  const { edgeLambdaNames } = JSON.parse(readFileSync(cleanupQueueFile).toString());

  if (!edgeLambdaNames.includes(functionName)) {
    edgeLambdaNames.push(functionName);
    writeFileSync(cleanupQueueFile, JSON.stringify({ edgeLambdaNames }, null, 2));
  }
}
