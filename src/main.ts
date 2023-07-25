import { App } from 'aws-cdk-lib';
import { AppStage, cicdEnv, stageDefinitions } from './config';
import { getAppConfig } from './lib/getAppConfig';
import { Application } from './stacks/application';
import { CICDStack } from './stacks/cicd';

export enum stackNames {
  stateful = 'stateful',
  compute = 'compute',
  cicd = 'cicd',
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
      new CICDStack(app, `${project}-cicd-stack-${stage}`, {
        project,
        stage,
        isFeatureEnv,
        stackName: stackNames.cicd,
        stageDefinitions,
        env: cicdEnv,
      });
    }

    app.synth();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) void main();