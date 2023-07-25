import { getBannedWords } from './cache';
import { throwForbiddenError } from './errors';
import { LoggerFactory } from './loggerFactory';

const logger = LoggerFactory.getLogger();

export async function validateContentNotContainsBannedWords(...content: string[]): Promise<void> {
  const bannedWords = (await getBannedWords()).map(({ bannedWord }) => bannedWord.trim());
  let identifiedWord = '';

  const wordIsBanned = (() => {
    for (const word of bannedWords) {
      const regexTest = new RegExp(`\\b${word}\\b`, 'i');
      if (regexTest.test(content.join(' '))) {
        identifiedWord = word;
        return true;
      }
    }
    return false;
  })();

  if (wordIsBanned) {
    logger.debug('content scanned for banned words:', content);
    logger.debug(`banned word identified: ${identifiedWord}`);
    throwForbiddenError('Content cannot be submitted due to violation of policy');
  }
}
