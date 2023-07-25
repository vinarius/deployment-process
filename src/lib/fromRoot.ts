import { resolve } from 'path';

export function fromRoot(path: string | string[] = ''): string {
  const segments: string[] = typeof path === 'string' ? path.split(/[/\\]/).filter((seg) => seg !== '') : path;
  return resolve(__dirname, '..', '..', ...segments);
}