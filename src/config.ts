import { configDotenv } from 'dotenv';
import { fromRoot } from './lib/fromRoot';

configDotenv({ path: fromRoot('.env') });

import { AppConfig } from './lib/getAppConfig';

export enum AppStage {
  individual = 'individual',
  cicd = 'cicd',
  dev = 'dev',
  test = 'test',
  prod = 'prod',
}

export const project = 'poc';
export const prodBranch = 'main';
export const codestarConnectionArn = '';

export interface ApplicationDefinition extends AppConfig {
  stageDefinition: StageDefinition;
}

export type StageDefinition = {
  name: AppStage;
  env: {
    account: string;
    region: string;
  };
};

export type StageDefinitions = Record<AppStage, StageDefinition>;

export const stageDefinitions: StageDefinitions = {
  [AppStage.individual]: {
    name: AppStage.individual,
    env: {
      account: process.env.AWS_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT ?? '',
      region: process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? '',
    },
  },
  [AppStage.cicd]: {
    name: AppStage.cicd,
    env: {
      account: '',
      region: '',
    },
  },
  [AppStage.dev]: {
    name: AppStage.dev,
    env: {
      account: '',
      region: '',
    },
  },
  [AppStage.test]: {
    name: AppStage.test,
    env: {
      account: '',
      region: '',
    },
  },
  [AppStage.prod]: {
    name: AppStage.prod,
    env: {
      account: '',
      region: '',
    },
  },
};
