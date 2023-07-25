import { getAppConfig } from '../lib/getAppConfig';
import { spawn } from '../lib/spawn';
import { validateAwsProfile } from '../lib/validateAwsProfile';

export async function test(): Promise<void> {
  const { IS_GITHUB } = process.env;

  try {
    const { profile, stage, env, project } = await getAppConfig();

    if (!IS_GITHUB) await validateAwsProfile(profile);

    process.env.AWS_PROFILE = profile;
    process.env.AWS_REGION = env.region;

    if (IS_GITHUB) {
      const {
        DEV_ACCESS_KEY_ID,
        DEV_SECRET_ACCESS_KEY,
        QA_ACCESS_KEY_ID,
        QA_SECRET_ACCESS_KEY,
        PROD_ACCESS_KEY_ID,
        PROD_SECRET_ACCESS_KEY,
      } = process.env;

      process.env.AWS_ACCESS_KEY_ID = stage === 'prod' ? PROD_ACCESS_KEY_ID : stage === 'qa' ? QA_ACCESS_KEY_ID : DEV_ACCESS_KEY_ID;

      process.env.AWS_SECRET_ACCESS_KEY =
        stage === 'prod' ? PROD_SECRET_ACCESS_KEY : stage === 'qa' ? QA_SECRET_ACCESS_KEY : DEV_SECRET_ACCESS_KEY;

      process.env.AWS_REGION = env.region;

      console.log(`>>> Access key credentials set for github for stage ${stage}\n`);
    }

    const isVerbose = process.env.VERBOSE?.toLowerCase() === 'true' ? '' : '--silent';
    const isWatching = process.env.WATCH?.toLowerCase() === 'true' ? '--watch' : '';

    await spawn(`jest --coverage ${isVerbose} ${isWatching} src`, {
      PROJECT: project,
      STAGE: stage,
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  test();
}
