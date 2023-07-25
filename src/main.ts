import { App } from 'aws-cdk-lib';
import { AppStage, stageDefinitions } from './config';
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
    const config = await getAppConfig();
    const { project, stage, isFeatureEnv, applicationStage } = config;

    if (isFeatureEnv) {
      new Application(app, applicationStage, {
        ...config,
        stageDefinition: stageDefinitions[AppStage.individual],
        env: stageDefinitions[AppStage.individual].env,
        project,
        isFeatureEnv,
        stage,
      });
    } else {
      const cicdStackName = buildStackName(project, StackName.cicd, stage);

      new CICDStack(app, cicdStackName, {
        ...config,
        stackName: cicdStackName,
        stack: StackName.cicd,
        env: stageDefinitions[AppStage.cicd].env,
        project,
        stage,
        isFeatureEnv,
        stageDefinitions,
        applicationStage
      });
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) void main();
