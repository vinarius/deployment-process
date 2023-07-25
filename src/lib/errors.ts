/* eslint-disable @typescript-eslint/no-explicit-any */
import { ErrorObject } from 'ajv';

import { LoggerFactory } from './loggerFactory';

const logger = LoggerFactory.getLogger();

export const throwValidationError = (validationErrors: ErrorObject<string, Record<string, any>, unknown>[] | null | undefined = []) => {
  logger.debug('throwing validation error:', validationErrors);

  throw {
    reason: 'ValidationError',
    isIntentionalError: true,
    validationErrors,
    statusCode: 400,
  };
};

export const throwBadRequestError = (error?: any) => {
  logger.debug('throwing bad request error:', error);

  throw {
    reason: error?.name ?? 'BadRequest',
    isIntentionalError: true,
    error: error?.message ?? error?.Error?.Message ?? error ?? 'The request could not be understood by the server due to malformed syntax.',
    statusCode: 400,
  };
};

export const throwNotAuthorizedError = (error?: any) => {
  logger.debug('throwing not authorized error:', error);

  throw {
    reason: error?.name ?? 'NotAuthorized',
    isIntentionalError: true,
    error:
      error?.message ??
      error?.Error?.Message ??
      error ??
      'The request requires user authentication or, if the request included authorization credentials, authorization has been refused for those credentials.',
    statusCode: 401,
  };
};

export const throwForbiddenError = (error?: any) => {
  logger.debug('throwing forbidden error:', error);

  throw {
    reason: error?.name ?? 'Forbidden',
    isIntentionalError: true,
    error:
      error?.message ??
      error?.Error?.Message ??
      error ??
      'The server understood the request, but is refusing to fulfill it. The authenticated user has insufficient permissions for the resource.',
    statusCode: 403,
  };
};

export const throwNotFoundError = (error?: any) => {
  logger.debug('throwing not found error:', error);

  throw {
    reason: error?.name ?? 'NotFound',
    isIntentionalError: true,
    error:
      error?.message ??
      error?.Error?.Message ??
      error ??
      'The requested resource could not be found. This error can be due to a temporary or permanent condition.',
    statusCode: 404,
  };
};

export const throwResourceExistsError = (error?: any) => {
  logger.debug('throwing resource exists error:', error);

  throw {
    reason: error?.name ?? 'ResourceExists',
    isIntentionalError: true,
    error: error?.message ?? error?.Error?.Message ?? error ?? 'A resource already exists with the given input.',
    statusCode: 409,
  };
};

export const throwThirdPartyFailureError = (error?: any) => {
  logger.debug('throwing third party failure error:', error);

  throw {
    reason: error?.name ?? 'ThirdPartyFailure',
    isIntentionalError: false,
    error:
      error?.message ??
      error?.Error?.Message ??
      error ??
      'The external service used to complete the operation timed out, returned an error, or failed in some way.',
    statusCode: error.$metadata?.httpStatusCode ?? 400,
  };
};

export const throwUnknownError = (error?: any) => {
  logger.debug('throwing unknown error:', error);

  throw {
    reason: error?.name ?? 'Unknown',
    isIntentionalError: false,
    error: error?.message ?? error?.Error?.Message ?? error ?? 'Unknown error - please report to the backend team',
    statusCode: error.$metadata?.httpStatusCode ?? 500,
  };
};
