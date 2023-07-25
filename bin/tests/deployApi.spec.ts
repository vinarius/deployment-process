import fs from 'fs';

import { deployApi } from '../deployApi';

jest.mock('../../lib/spawn');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: () => ({
    toString: () => JSON.stringify({
      [`${process.env.PROJECT}-api-stack-${process.env.STAGE}`]: {
        [`${process.env.PROJECT}apiIdOutput${(process.env.STAGE as string).replace(/\W/g, '')}`]: 'api-id'
      }
    })
  })
}));

let preservedEnv: NodeJS.ProcessEnv;

describe('deployApi', () => {
  beforeAll(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      return void 0 as never;
    });

    jest.spyOn(console, 'error');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    preservedEnv = { ...process.env };
  });

  it('should deploy the api', async () => {
    await deployApi();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should deploy the api without a profile as codebuild', async () => {
    process.env.IS_CODEBUILD = 'true';
    await deployApi();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should throw an error and call process.exit', async () => {
    jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('readFileSync error');
    });

    await deployApi();
    expect(process.exit).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    process.env = preservedEnv;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});