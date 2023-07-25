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
        input: CodePipelineSource.connection('internal-tech-solutions/process-poc', prodBranch, {
          connectionArn: 'arn:aws:codestar-connections:us-east-1:597119195378:connection/12e61d31-c78f-4f1d-9262-78e0e4fe0a52',
        }),
        installCommands: [
          'yarn install --frozen-lockfile',
        ],
        commands: [
          'npx cdk synth --quiet',
        ],
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          privileged: true,
        }
      },
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