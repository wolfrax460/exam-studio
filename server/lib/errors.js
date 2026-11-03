export function httpError(status, message) {
  const isObject = message && typeof message === 'object';
  const e = new Error(isObject ? (message.message || 'Request failed.') : message);
  e.status = status;
  if (isObject) e.details = message;
  return e;
}