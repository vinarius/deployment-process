import { Stack, StackProps } from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

import { AppStage, StageDefinitions, prodBranch } from '../config';
import { AppConfig } from '../lib/getAppConfig';
import { Application } from './application';

export class CICDStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & AppConfig & { stackName: string; stageDefinitions: StageDefinitions }) {
    super(scope, id, props);

    const { stageDefinitions, project, stage, stackName, isFeatureEnv } = props;

    const pipeline = new CodePipeline(this, `${project}-${stackName}-pipeline-${stage}`, {
      pipelineName: `${project}-${stackName}-pipeline-${stage}`,
      synth: new ShellStep(`${project}-${stackName}-synthStep-${stage}`, {
        env: {
          BRANCH: prodBranch,
        },
        input: CodePipelineSource.connection('internal-tech-solutions/process-poc', 'master', {
          connectionArn: 'arn:aws:codestar-connections:us-east-2:476324220602:connection/10e74423-5961-45c7-a3d4-1e8e6fa4052a',
        }),
        installCommands: [
          'yarn install --frozen-lockfile',
        ],
        commands: [
          'pwd',
          'ls -la',
          'npx cdk synth -v',
        ],
      }),
      crossAccountKeys: true,
    });

    const nonFeatureStages = Object.entries(stageDefinitions).filter(stageDefinition => stageDefinition[0] !== AppStage.individual);

    for (const [nonFeatureAppStage, stageDefinition] of nonFeatureStages) {
      pipeline.addStage(new Application(this, `${project}-${stackName}-app-${nonFeatureAppStage}`, {
        project,
        stage,
        isFeatureEnv,
        stageDefinition,
      }));
    }
  }
}