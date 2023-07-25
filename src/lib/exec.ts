import { ChildProcessWithoutNullStreams, exec as EXEC } from 'child_process';

export function exec(command: string, logToConsole = true): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    function stdoutHandler(data: string) {
      if (logToConsole) console.log(data);
    }
    function stderrHandler(data: string) {
      if (logToConsole) console.error(data);
    }

    const child = EXEC(command, (err, results) => {
      if (err) return reject(err);

      resolve(results);
    });

    (child as ChildProcessWithoutNullStreams).stdout.on('data', stdoutHandler);
    (child as ChildProcessWithoutNullStreams).stderr.on('data', stderrHandler);

    child.once('exit', code => {
      if (code !== 0) process.exit(1);

      (child as ChildProcessWithoutNullStreams).stdout.removeListener('data', stdoutHandler);
      (child as ChildProcessWithoutNullStreams).stderr.removeListener('data', stderrHandler);
    });
  });
}
