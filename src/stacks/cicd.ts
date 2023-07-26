import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

import { AppStage, StageDefinitions, codestarConnectionArn, prodBranch } from '../config';
import { AppConfig } from '../lib/getAppConfig';
import { StackName } from '../main';
import { Application } from './application';
import { BuildSpec, Cache, LocalCacheMode } from 'aws-cdk-lib/aws-codebuild';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export class CICDStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & AppConfig & { stackName: string; stageDefinitions: StageDefinitions; stack: StackName; }) {
    super(scope, id, props);

    const { stageDefinitions, project, stage, stack, isFeatureEnv } = props;

    // const buildCacheBucket = new Bucket(this, `${project}-${stack}-buildCacheBucket-${stage}`, {
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   autoDeleteObjects: true,
    // });

    // change1

    const pipeline = new CodePipeline(this, `${project}-${stack}-pipeline-${stage}`, {
      pipelineName: `${project}-${stack}-pipeline-${stage}`,
      synthCodeBuildDefaults: {
        // cache: Cache.bucket(buildCacheBucket, {
        //   prefix: `${project}-${stack}-buildCache-${stage}`,
        // }),
        partialBuildSpec: BuildSpec.fromObject({
          cache: {
            paths: [
              '/root/.cache/yarn/**/*'
            ],
          },
        })
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
        // cache: Cache.local(LocalCacheMode.SOURCE)
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
