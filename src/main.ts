import { App } from 'aws-cdk-lib';
import { AppStage, cicdEnv, stageDefinitions } from './config';
import { buildStackName } from './lib/buildStackName';
import { getAppConfig } from './lib/getAppConfig';
import { Application } from './stacks/application';
import { CICDStack } from './stacks/cicd';

export enum StackName {
  stateful = 'stateful',
  compute = 'compute',
  cicd = 'cicd',
  other = 'other',
};

async function main() {
  const app = new App();

  try {
    const { project, stage, isFeatureEnv } = await getAppConfig();

    if (isFeatureEnv) {
      new Application(app, `${project}-app-stage-${stage}`, {
        project,
        isFeatureEnv,
        stage,
        stageDefinition: stageDefinitions[AppStage.individual],
      });
    } else {
      const cicdStackName = buildStackName(project, StackName.cicd, stage);
      new CICDStack(app, cicdStackName, {
        project,
        stage,
        isFeatureEnv,
        stackName: cicdStackName,
        stack: StackName.cicd,
        stageDefinitions,
        env: cicdEnv,
      });
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) void main();