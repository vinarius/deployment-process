import { configDotenv } from 'dotenv';
import { fromRoot } from './lib/fromRoot';

configDotenv({ path: fromRoot('.env') });

import { AppConfig } from './lib/getAppConfig';

export enum AppStage {
  individual = 'individual',
  cicd = 'cicd',
  dev = 'dev',
  test = 'test',
  // staging = 'staging',
  prod = 'prod',
  // prod2 = 'prod2',
  // prod3 = 'prod3',
  // postProd = 'postProd',
}

export const project = 'poc';
export const prodBranch = 'main';
export const codestarConnectionArn = 'arn:aws:codestar-connections:us-east-1:597119195378:connection/12e61d31-c78f-4f1d-9262-78e0e4fe0a52';

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
      account: '597119195378',
      region: 'us-east-2',
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
  // [AppStage.prod2]: {
  //   name: AppStage.prod2,
  //   env: {
  //     account: '597119195378',
  //     region: 'us-east-2',
  //   },
  // },
  // [AppStage.prod3]: {
  //   name: AppStage.prod3,
  //   env: {
  //     account: '597119195378',
  //     region: 'us-east-2',
  //   },
  // },
  // [AppStage.postProd]: {
  //   name: AppStage.postProd,
  //   env: {
  //     account: '',
  //     region: 'us-east-2',
  //   },
  // },
};
