// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function verboseLog(message?: any, ...optionalParams: any[]): void {
  if (process.env.VERBOSE === 'true') {
    console.log(message, ...optionalParams);
  }
}
