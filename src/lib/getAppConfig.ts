import { AppStage, prodBranch, project, stageDefinitions } from '../config';
import { getLocalGitBranch } from './getLocalGitBranch';

export type AppConfig = {
  project: string;
  stage: string;
  isFeatureEnv: boolean;
};

export async function getAppConfig(): Promise<AppConfig> {
  const branch = process.env.BRANCH ?? (await getLocalGitBranch());

  if (!branch) throw new Error('>>> Could not determine what environment to deploy. No process.env.BRANCH nor git branch available.');

  const isFeatureEnv = branch !== prodBranch;

  if (isFeatureEnv && stageDefinitions[AppStage.individual]?.env?.account) throw new Error(`>>> No account prop found in ${AppStage.individual} stage definition.`);
  if (isFeatureEnv && stageDefinitions[AppStage.individual]?.env?.region) throw new Error(`>>> No region prop found in ${AppStage.individual} stage definition.`);

  const stage =
    branch === prodBranch
      ? AppStage.prod
      : branch.includes('/')
        ? branch.split('/').reverse()[0]
        : branch; // This paradigm allows for ephemeral resource creation for team development.

  return {
    isFeatureEnv,
    stage,
    project,
  };
}
