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

    const buildCacheBucket = new Bucket(this, `${project}-${stack}-buildCacheBucket-${stage}`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const pipeline = new CodePipeline(this, `${project}-${stack}-pipeline-${stage}`, {
      pipelineName: `${project}-${stack}-pipeline-${stage}`,
      synthCodeBuildDefaults: {
        cache: Cache.bucket(buildCacheBucket, {
          prefix: `${project}-${stack}-buildCache-${stage}`,
        }),
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
        cache: Cache.local(LocalCacheMode.SOURCE)
      },
      crossAccountKeys: true,
    });

    const stagingEnvs = Object.entries(stageDefinitions)
      .filter(([appStage]) =>  appStage !== AppStage.individual && appStage !== AppStage.cicd);

    for (const [appStage, stageDefinition] of stagingEnvs) {
      const { env } = stageDefinition;

      const pipelineStage = pipeline.addStage(new Application(this, `${project}-${stack}-app-${appStage}`, {
        ...props,
        project,
        stage,
        isFeatureEnv,
        stageDefinition,
        env
      }));

      if (appStage === AppStage.prod) {
        pipelineStage.addPre(
          new ManualApprovalStep(`${project}-${stack}-manualApprovalStep-${appStage}`,
          {
            comment: 'Approve to deploy to prod'
          }
        ));
      }
    }
  }
}
