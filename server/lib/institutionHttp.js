import { httpError } from './errors.js';

const pageSize = 20;

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path[0];
  throw httpError(400, field ? `Check the value of ${field}.` : 'Check the submitted fields.');
}

export function pageOptions(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw httpError(400, 'Invalid page.');
  return { offset: (page - 1) * pageSize, limit: pageSize + 1 };
}

export function pageResult(items, serialize = (item) => item) {
  return { items: items.slice(0, pageSize).map(serialize), hasMore: items.length > pageSize };
}
