import { spawn as spawnAsync } from 'child_process';

export async function spawn(command: string, envVars?: { [key: string]: string }): Promise<void> {
  const errors: string[] = [];

  return new Promise((resolve, reject) => {
    const child = spawnAsync(command, [], {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...envVars,
      },
    });

    child.on('error', error => {
      errors.push(error.toString());
    });

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}:`));
      } else {
        resolve();
      }
    });

    child.on('exit', code => {
      if (errors.length) reject(errors.join(' '));
      if (code !== 0) reject(`Exited with code ${code}`);
      resolve();
    });
  });
}
