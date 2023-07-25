import { configDotenv } from 'dotenv';
import { fromRoot } from './lib/fromRoot';
import { AppConfig } from './lib/getAppConfig';

configDotenv({ path: fromRoot() });

export enum AppStage {
  individual = 'individual',
  dev = 'dev',
  test = 'test',
  // staging = 'staging',
  prod = 'prod',
  // postProd = 'postProd',
}

export const project = 'bird';
export const prodBranch = 'master';

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
  [AppStage.dev]: {
    name: AppStage.dev,
    env: {
      account: '476324220602',
      region: 'us-east-2',
    },
  },
  [AppStage.test]: {
    name: AppStage.test,
    env: {
      account: '580140692765',
      region: 'us-east-2',
    },
  },
  // [AppStage.staging]: {
  //   name: AppStage.staging,
  //   env: {
  //     account: '',
  //     region: 'us-east-2',
  //   },
  // },
  [AppStage.prod]: {
    name: AppStage.prod,
    env: {
      account: '597119195378',
      region: 'us-east-2',
    },
  },
  // [AppStage.postProd]: {
  //   name: AppStage.postProd,
  //   env: {
  //     account: '',
  //     region: 'us-east-2',
  //   },
  // },
};

export const cicdEnv = stageDefinitions[AppStage.dev].env;