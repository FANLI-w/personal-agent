// Never print exception messages, SQL, validation inputs, credentials or model text.
// Keep only known error classes/codes and locations within our packaged source.
export function safeErrorDiagnostic(error) {
  const result = [];
  for (let current = error, depth = 0; current instanceof Error && depth < 3; current = current.cause, depth++) {
    const item = { type: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ZodError'].includes(current.name) ? current.name : 'Error' };
    if (['ERR_SQLITE_ERROR', 'ERR_INVALID_STATE', 'EPIPE', 'ECONNRESET', 'ETIMEDOUT'].includes(current.code)) item.code = current.code;
    if (Number.isSafeInteger(current.errcode) && current.errcode >= 0 && current.errcode < 65536) item.sqlite = current.errcode;
    const locations = [...String(current.stack ?? '').matchAll(/(?:file:\/\/\/)?[^\s()]*[\\/]((?:apps[\\/]api[\\/](?:dist|src)|deploy[\\/]openim)[\\/][a-zA-Z0-9_-]+\.(?:m?js|ts)):(\d+):(\d+)/g)];
    item.locations = locations.slice(0, 5).map(match => `${match[1].replaceAll('\\', '/')}:${match[2]}:${match[3]}`);
    result.push(item);
  }
  return result;
}
