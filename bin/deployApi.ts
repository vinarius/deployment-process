import { readFileSync } from 'fs';
import { resolve } from 'path';

import { getAppConfig } from '../lib/getAppConfig';
import { spawn } from '../lib/spawn';
import { validateAwsProfile } from '../lib/validateAwsProfile';
import { stackNames } from '../infrastructure';

export async function deployApi(): Promise<void> {
  const { IS_CODEBUILD } = process.env;

  try {
    const { profile, stage, env, project } = await getAppConfig();
    const includeProfile = IS_CODEBUILD ? '' : `--profile ${profile}`;

    if (!IS_CODEBUILD) await validateAwsProfile(profile);

    const cdkOutputsRaw = JSON.parse(readFileSync(resolve(__dirname, '..', 'dist', `${stage}-outputs.json`)).toString());
    const restApiId = cdkOutputsRaw[`${project}-${stackNames.stateful}-stack-${stage}`][`${project}apiIdOutput${stage.replace(/\W/g, '')}`];

    console.log(
      `aws apigateway create-deployment --rest-api-id ${restApiId} --stage-name ${stage} ${includeProfile} --region ${env.region}`,
    );

    await spawn(
      `aws apigateway create-deployment --rest-api-id ${restApiId} --stage-name ${stage} ${includeProfile} --region ${env.region}`,
    );

    console.log('\n>>> Api deployment complete.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  deployApi();
}
