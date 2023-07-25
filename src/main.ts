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
    console.log(1);

    const { project, stage, isFeatureEnv } = await getAppConfig();

    console.log(2);

    if (isFeatureEnv) {
      new Application(app, `${project}-app-stage-${stage}`, {
        project,
        isFeatureEnv,
        stage,
        stageDefinition: stageDefinitions[AppStage.individual],
      });
    } else {

      console.log(3);

      new CICDStack(app, `${project}-cicd-stack-${stage}`, {
        project,
        stage,
        isFeatureEnv,
        stackName: stackNames.cicd,
        stageDefinitions,
        env: cicdEnv,
      });

      console.log(3);
    }

    app.synth();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) void main();