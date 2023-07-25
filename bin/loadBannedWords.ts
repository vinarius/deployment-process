import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { BannedWordFactory, batchWrite } from '@internal-tech-solutions/sig-dynamo-factory';

import { getAppConfig } from '../lib/getAppConfig';
import { fromRoot } from '../lib/fromRoot';
import { stackNames } from '../infrastructure';

async function loadBannedWords() {
  try {
    const { profile, env, stage, project } = await getAppConfig();

    process.env.AWS_PROFILE = profile;
    process.env.AWS_REGION = env.region;

    const tableName = `${project}-${stackNames.stateful}-table-${stage}`;

    const rawText = readFileSync(fromRoot('./data/bannedWords/bannedWords.csv'), 'utf8');

    const parsedData: { term: string }[] = parse(rawText, {
      columns: true,
      skip_empty_lines: true,
    });

    const batch = parsedData.map(({ term }) => ({
      PutRequest: {
        Item: BannedWordFactory.buildItem({
          bannedWord: term,
        }),
      },
    }));

    await batchWrite(tableName, batch);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) loadBannedWords();
