import { APIGatewayProxyEventQueryStringParameters } from 'aws-lambda';

import { Generic } from '../models/cloudResources';
import { throwBadRequestError } from './errors';

// Keep in mind that this function will change all of your keys to lowercase;
// try to avoid camelCase keys (i.e. type would be contenttype, etc)
export const getQueryParams = (
  queryStringParams: APIGatewayProxyEventQueryStringParameters | null,
  _requiredParams: string[] = [],
): Generic => {
  const input = queryStringParams ?? {};
  const decodedParams: Generic = {};
  const requiredParams = _requiredParams.map(param => param.toLowerCase());

  for (const [key, value] of Object.entries(input)) decodedParams[key.toLowerCase()] = decodeURIComponent((value ?? '').trim());

  const inputParams = Object.keys(decodedParams);
  const missingRequiredParams = requiredParams.filter(requiredParam => !inputParams.includes(requiredParam));

  if (missingRequiredParams.length > 0) throwBadRequestError();

  return decodedParams;
};
