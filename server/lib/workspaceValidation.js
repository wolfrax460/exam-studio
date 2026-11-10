// Validation shared by the Mongoose models and the JSON file repository.
//
// Mongoose handles casting and indexes in MongoDB mode, but the file store has no schema
// engine. Keeping the allowed enums and the assignment shape checks here means both
// backends reject the same records for the same reasons.

export const INSTITUTION_TYPES = Object.freeze(['school', 'college', 'university', 'training', 'other']);
export const INSTITUTION_STATUSES = Object.freeze(['pending', 'active', 'suspended']);
export const MEMBERSHIP_ROLES = Object.freeze(['admin', 'teacher', 'member']);
export const MEMBERSHIP_STATUSES = Object.freeze(['invited', 'active', 'removed', 'suspended']);
export const GROUP_MEMBER_ROLES = Object.freeze(['teacher', 'member']);

export function validationError(message) {
  const error = new Error(message);
  error.name = 'ValidationError';
  error.status = 400;
  return error;
}

export function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

export function normalizeText(value, field, maxLength = 0) {
  if (typeof value !== 'string') throw validationError(`${field} is required`);
  const text = value.trim();
  if (!text) throw validationError(`${field} is required`);
  if (maxLength > 0 && text.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`);
  }
  return text;
}

export function normalizeSlug(value) {
  if (typeof value !== 'string') throw validationError('slug is required');
  const slug = value.trim().toLowerCase();
  if (!slug) throw validationError('slug is required');
  if (slug.length > 120) throw validationError('slug must be at most 120 characters');
  return slug;
}

export function normalizeInvitedEmail(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw validationError('invitedEmail must be a string');
  const email = value.trim().toLowerCase();
  if (!email) return '';
  if (email.length > 254) throw validationError('invitedEmail is too long');
  // Keep this deliberately simple: invitation delivery is a later concern, but an empty
  // or malformed address should never become a stored invitation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError('invitedEmail must be a valid email address');
  }
  return email;
}

export function normalizeDailyLimit(value) {
  if (value === undefined || value === null) return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0) {
    throw validationError('aiDailyLimit must be a non-negative integer or null');
  }
  return limit;
}

export function normalizeDate(value, field) {
  if (value === undefined || value === null || value === '') {
    throw validationError(`${field} is required`);
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError(`${field} must be a valid date`);
  return date;
}

export function normalizeOptionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeDate(value, field);
}

export function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw validationError('archived must be a boolean');
  return value;
}

export function normalizeId(value, field) {
  if (value === undefined || value === null || value === '') {
    throw validationError(`${field} is required`);
  }
  const id = String(value).trim();
  if (!id) throw validationError(`${field} is required`);
  return id;
}

export function normalizeIdList(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw validationError(`${field} must be an array`);
  const ids = value.map((entry) => normalizeId(entry, field));
  if (new Set(ids).size !== ids.length) throw validationError(`${field} must not contain duplicates`);
  return ids;
}

/**
 * Validate the assignment target and date window.
 *
 * Exactly one target mode is allowed: a group id, or a non-empty list of user ids.
 */
export function validateAssignmentShape({ groupId, userIds, opensAt, dueAt }) {
  const ids = normalizeIdList(userIds, 'userIds');
  const hasGroup = groupId !== undefined && groupId !== null && groupId !== '';
  const normalizedGroupId = hasGroup ? normalizeId(groupId, 'groupId') : null;

  if (hasGroup && ids.length > 0) {
    throw validationError('An assignment must target a group or a list of users, not both');
  }
  if (!hasGroup && ids.length === 0) {
    throw validationError('An assignment must target a group or at least one user');
  }

  const open = normalizeDate(opensAt, 'opensAt');
  const due = normalizeDate(dueAt, 'dueAt');
  if (due.getTime() <= open.getTime()) {
    throw validationError('dueAt must be after opensAt');
  }

  return { groupId: normalizedGroupId, userIds: ids, opensAt: open, dueAt: due };
}
