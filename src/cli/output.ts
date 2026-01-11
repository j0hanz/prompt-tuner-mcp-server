export function writeStderr(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

export function writeCliOutput(message: string): void {
  const stream = process.stdout.isTTY ? process.stdout : process.stderr;
  stream.write(message.endsWith('\n') ? message : `${message}\n`);
}
