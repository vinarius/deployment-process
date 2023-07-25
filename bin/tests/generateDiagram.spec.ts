import { spawn } from '../../lib/spawn';
import { generateDiagram } from '../generateDiagram';

jest.mock('path', () => ({
  __esModule: true,
  resolve: jest.fn(() => 'test-path')
}));
jest.mock('../../lib/spawn');

describe('generateDiagram', () => {
  beforeAll(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      return void 0 as never;
    });

    jest.spyOn(console, 'error');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a diagram', async () => {
    await generateDiagram();

    expect(process.exit).toHaveBeenCalledTimes(0);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('should throw an error when the docsLocation does not exist', async () => {
    (spawn as jest.Mock).mockImplementationOnce(() => {
      throw new Error('test-error');
    });

    jest.spyOn(console, 'error');

    await generateDiagram();

    expect(console.error).toBeCalledTimes(1);
    expect(process.exit).toBeCalledTimes(1);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});
