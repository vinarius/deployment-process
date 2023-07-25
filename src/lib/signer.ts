import { createSign } from 'crypto';

// https://github.com/aws/aws-sdk-js-v3/issues/1822
// This code was taken from above url as the signed cookie methods were not added to sdk3.
type GetSignedCookieOptions =
  | {
    url: string;
    expires: number;
    policy?: never;
  }
  | {
    url?: never;
    expires?: never;
    policy: string;
  };

interface GetSignedUrlBase {
  url: string;
}

interface GetSignedUrlWithExpires extends GetSignedUrlBase {
  expires: number;
  policy?: never;
}

interface GetSignedUrlWithPolicy extends GetSignedUrlBase {
  expires?: never;
  policy: string;
}

type GetSignedUrlOptions = GetSignedUrlWithExpires | GetSignedUrlWithPolicy;

const queryEncode = function (string: string) {
  const replacements = {
    '+': '-',
    '=': '_',
    '/': '~'
  } as Record<string, string>;
  return string.replace(/[+=/]/g, function (match) {
    return replacements[match];
  });
};

const determineScheme = function (url: string) {
  const parts = url.split('://');
  if (parts.length < 2) {
    throw new Error('Invalid URL.');
  }

  return parts[0].replace('*', '');
};

const getRtmpUrl = function (rtmpUrl: string) {
  const parsed = new URL(rtmpUrl);
  return parsed.pathname.replace(/^\//, '') + parsed.search + parsed.hash;
};

const getResource = function (url: string): string {
  switch (determineScheme(url)) {
    case 'http':
    case 'https':
      return url;
    case 'rtmp':
      return getRtmpUrl(url);
    default:
      throw new Error(
        'Invalid URI scheme. Scheme must be one of' + ' http, https, or rtmp'
      );
  }
};

const signPolicy = function (policy: string, privateKey: string) {
  const sign = createSign('RSA-SHA1');
  sign.write(policy);
  return queryEncode(sign.sign(privateKey, 'base64'));
};

const signWithCannedPolicy = function (
  url: string,
  expires: number,
  keyPairId: string,
  privateKey: string
) {
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: url,
        Condition: { DateLessThan: { 'AWS:EpochTime': expires } }
      }
    ]
  });

  return {
    Expires: expires,
    'Key-Pair-Id': keyPairId,
    Signature: signPolicy(policy.toString(), privateKey)
  };
};

const signWithCustomPolicy = function (
  policy: string,
  keyPairId: string,
  privateKey: string
): { Policy: string; 'Key-Pair-Id': string; Signature: string } {
  const modifiedPolicy = policy.replace(/\s/gm, '');

  return {
    Policy: queryEncode(Buffer.from(modifiedPolicy).toString('base64')),
    'Key-Pair-Id': keyPairId,
    Signature: signPolicy(policy, privateKey)
  };
};

export class Signer {
  private keyPairId: string;
  private privateKey: string;

  constructor(keyPairId: string, privateKey: string) {
    if (keyPairId === void 0 || privateKey === void 0) {
      throw new Error('A key pair ID and private key are required');
    }

    this.keyPairId = keyPairId;
    this.privateKey = privateKey;
  }

  getSignedCookie(options: GetSignedCookieOptions) {
    const signatureHash = options.policy
      ? signWithCustomPolicy(options.policy, this.keyPairId, this.privateKey)
      : options.url
        ? (signWithCannedPolicy(
          options.url,
          options.expires!,
          this.keyPairId,
          this.privateKey
        ) as Record<string, unknown>)
        : {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookieHash: Record<string, any> = {};
    for (const key in signatureHash) {
      if (Object.prototype.hasOwnProperty.call(signatureHash, key)) {
        cookieHash['CloudFront-' + key] = (signatureHash as Record<string, string>)[key];
      }
    }

    return cookieHash;
  }

  getSignedUrl(options: GetSignedUrlOptions) {
    const resource = getResource(options.url);
    const parsedUrl = new URL(options.url);
    const signatureHash = options.policy
      ? signWithCustomPolicy(options.policy, this.keyPairId, this.privateKey)
      : options.expires
        ? (signWithCannedPolicy(
          resource,
          options.expires,
          this.keyPairId,
          this.privateKey
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as Record<string, any>)
        : {};

    parsedUrl.search = '';
    const searchParams = parsedUrl.searchParams;
    for (const key in signatureHash) {
      if (Object.prototype.hasOwnProperty.call(signatureHash, key)) {
        searchParams.set(key, (signatureHash as Record<string, string>)[key]);
      }
    }

    const signedUrl =
      determineScheme(options.url) === 'rtmp'
        ? getRtmpUrl(parsedUrl.toString())
        : parsedUrl.toString();

    return signedUrl;
  }
}

