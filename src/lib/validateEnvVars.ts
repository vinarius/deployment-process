import { throwUnknownError } from './errors';
import { LoggerFactory } from './loggerFactory';

const logger = LoggerFactory.getLogger();

export function validateEnvVars(envVars: string[]): void {
  logger.debug('Validating the following environment variables exist:', envVars);

  const unsetEnvVars: string[] = [];

  for (const variable of envVars)
    if (!process.env[variable]) unsetEnvVars.push(variable);

  if (unsetEnvVars.length > 0) throwUnknownError({
    message: `Unset environment variables required to execute lambda.\n\n${unsetEnvVars.join(' ')}`
  });
}