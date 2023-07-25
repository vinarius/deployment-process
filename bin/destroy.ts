import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  DescribeLogGroupsCommandOutput,
  LogGroup,
} from '@aws-sdk/client-cloudwatch-logs';

import { getAppConfig } from '../src/lib/getAppConfig';
import { retryOptions } from '../src/lib/retryOptions';
import { spawn } from '../src/lib/spawn';

export async function destroy(): Promise<void> {
  console.time('>>> Destroy complete.');

  const cloudWatchLogsClient = new CloudWatchLogsClient({ ...retryOptions });

  try {
    const { stage, isFeatureEnv, applicationStage } = await getAppConfig();

    if (!isFeatureEnv)
      throw new Error(`Unable to destroy stacks for environment ${stage}. Please check your git branch.`);

    console.log('>>> Cleaning up log groups');

    const totalLogGroupNames: string[] = [];
    let nextToken;

    do {
      const describeLogGroupsOutput: DescribeLogGroupsCommandOutput = await cloudWatchLogsClient.send(
        new DescribeLogGroupsCommand({ nextToken }),
      );

      totalLogGroupNames.push(
        ...((describeLogGroupsOutput.logGroups as LogGroup[]) ?? [])
          .map(group => group.logGroupName as string)
          .filter(logGroupName => logGroupName.includes(stage)),
      );

      nextToken = describeLogGroupsOutput.nextToken;
    } while (nextToken);

    const settledPromises1 = await Promise.allSettled(
      totalLogGroupNames.map(logGroupName => cloudWatchLogsClient.send(new DeleteLogGroupCommand({ logGroupName }))),
    );

    for (const promise of settledPromises1) {
      if (promise.status === 'rejected') {
        console.error(promise.reason);
      }
    }

    console.log('>>> Log groups cleaned successfully.');

    console.log('>>> Destroying stacks');
    await spawn(`npm run cdk -- destroy ${applicationStage}/** --force`);

    console.timeEnd('>>> Destroy complete.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  destroy();
}
