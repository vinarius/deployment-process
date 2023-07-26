import { Stack, StackProps } from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

import { AppStage, StageDefinitions, codestarConnectionArn, prodBranch } from '../config';
import { AppConfig } from '../lib/getAppConfig';
import { StackName } from '../main';
import { Application } from './application';
import { BuildSpec, Cache, LocalCacheMode } from 'aws-cdk-lib/aws-codebuild';

export class CICDStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & AppConfig & { stackName: string; stageDefinitions: StageDefinitions; stack: StackName; }) {
    super(scope, id, props);

    const { stageDefinitions, project, stage, stack, isFeatureEnv } = props;

    const pipeline = new CodePipeline(this, `${project}-${stack}-pipeline-${stage}`, {
      pipelineName: `${project}-${stack}-pipeline-${stage}`,
      synthCodeBuildDefaults: {
        cache: Cache.local(LocalCacheMode.SOURCE)
      },
      synth: new ShellStep(`${project}-${stack}-synthStep-${stage}`, {
        env: {
          BRANCH: prodBranch,
        },
        input: CodePipelineSource.connection('Internal-Tech-Solutions/process-poc', prodBranch, {
          connectionArn: codestarConnectionArn,
        }),
        installCommands: [
          'yarn install --frozen-lockfile',
          'yarn global add esbuild',
        ],
        commands: [
          'npx cdk synth --quiet',
        ],
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          privileged: true,
        },
        cache: Cache.local(LocalCacheMode.CUSTOM),
        partialBuildSpec: BuildSpec.fromObject({
          cache: {
            paths: [
              '/root/.cache/yarn/**/*'
            ],
          },
        })
      },
      crossAccountKeys: true,
    });

    const nonFeatureStages = Object.entries(stageDefinitions)
      .filter(stageDefinition =>
        stageDefinition[0] !== AppStage.individual &&
        stageDefinition[0] !== AppStage.cicd
      );

    for (const [nonFeatureAppStage, stageDefinition] of nonFeatureStages) {
      const { env } = stageDefinition;

      const pipelineStage = pipeline.addStage(new Application(this, `${project}-${stack}-app-${nonFeatureAppStage}`, {
        ...props,
        project,
        stage,
        isFeatureEnv,
        stageDefinition,
        env
      }));

      if (nonFeatureAppStage === AppStage.prod) {
        pipelineStage.addPre(
          new ManualApprovalStep(`${project}-${stack}-manualApprovalStep-${nonFeatureAppStage}`,
          {
            comment: 'Approve to deploy to prod'
          }
        ));
      }
    }
  }
}
