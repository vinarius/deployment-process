import { getAppConfig } from '../lib/getAppConfig';
import { spawn } from '../lib/spawn';
import { validateAwsProfile } from '../lib/validateAwsProfile';

export async function cdkWatch(): Promise<void> {
  try {
    const { profile } = await getAppConfig();
    const { STACK } = process.env;

    await validateAwsProfile(profile);

    spawn(`npm run cdk -- watch ${STACK} --profile ${profile} --exclusively --hotswap-fallback --concurrency 10`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  cdkWatch();
}
