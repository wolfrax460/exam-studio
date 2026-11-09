// Shared ownership vocabulary for personal and institution-owned educational resources.
//
// The fields are deliberately optional in legacy data. A record with neither field is still a
// personal resource; it is only ever upgraded by the separate migration command, never by the
// normal read path.
import mongoose from 'mongoose';

export const OWNER_TYPES = Object.freeze(['personal', 'institution']);

export const ownershipSchemaFields = {
  ownerType: {
    type: String,
    enum: OWNER_TYPES,
    default: 'personal',
  },
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    default: null,
  },
};

export const normalizeOwnershipInput = normalizeOwnership;

export function ownershipError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/**
 * Validate and normalise ownership supplied to a write operation.
 * Personal resources always have institutionId: null. Institution resources always need an id.
 */
export function normalizeOwnership(input = {}) {
  const rawType = input.ownerType;
  const rawInstitutionId = input.institutionId;
  const hasInstitutionId = rawInstitutionId !== undefined && rawInstitutionId !== null && String(rawInstitutionId).trim() !== '';

  if (rawType === 'institution') {
    if (!hasInstitutionId) throw ownershipError('institutionId is required for an institution-owned resource');
    return { ownerType: 'institution', institutionId: String(rawInstitutionId) };
  }

  if (rawType === 'personal' || rawType === undefined || rawType === null || rawType === '') {
    if (hasInstitutionId) throw ownershipError('A personal resource cannot have an institutionId');
    return { ownerType: 'personal', institutionId: null };
  }

  throw ownershipError('ownerType must be personal or institution');
}

/** Read-side view: legacy rows without either field are personal. */
export function ownershipView(record = {}) {
  try {
    return normalizeOwnership(record);
  } catch {
    return {
      ownerType: record.ownerType || 'personal',
      institutionId: record.institutionId === null || record.institutionId === undefined
        ? null
        : String(record.institutionId),
    };
  }
}

export function isPersonalOwnership(record = {}) {
  const type = record.ownerType;
  return (type === undefined || type === null || type === '' || type === 'personal')
    && (record.institutionId === undefined || record.institutionId === null || record.institutionId === '');
}

/** Mongo query that includes legacy rows that predate the ownership fields. */
export function personalOwnershipQuery() {
  return {
    $and: [
      { $or: [{ ownerType: 'personal' }, { ownerType: { $exists: false } }, { ownerType: null }] },
      { $or: [{ institutionId: null }, { institutionId: { $exists: false } }] },
    ],
  };
}

export function institutionalOwnershipQuery(institutionId) {
  return { ownerType: 'institution', institutionId };
}

/**
 * Classify a stored record for the migration. The evidence field is the existing owner/creator
 * field (userId on library items, ownerId on publications and attempts). We never infer an
 * institution from membership or from a missing value.
 */
export function classifyOwnership(record = {}, evidenceField = 'userId') {
  const rawType = record.ownerType === undefined || record.ownerType === null || record.ownerType === ''
    ? null
    : String(record.ownerType);
  const hasInstitutionId = record.institutionId !== undefined
    && record.institutionId !== null
    && String(record.institutionId).trim() !== '';
  const hasPersonalEvidence = evidenceField
    ? record[evidenceField] !== undefined
      && record[evidenceField] !== null
      && String(record[evidenceField]).trim() !== ''
    : true;

  if (rawType === 'personal') {
    if (hasInstitutionId) return { status: 'ambiguous', reason: 'personal ownership has an institutionId' };
    if (record.institutionId === null) return { status: 'compliant' };
    return { status: 'needs-default' };
  }
  if (rawType === 'institution') {
    if (!hasInstitutionId) return { status: 'ambiguous', reason: 'institution ownership has no institutionId' };
    return { status: 'compliant' };
  }
  if (rawType !== null) return { status: 'ambiguous', reason: `unknown ownerType "${rawType}"` };
  if (hasInstitutionId) return { status: 'ambiguous', reason: 'ownership is missing but institutionId is present; refusing to infer an institution' };
  if (!hasPersonalEvidence) return { status: 'ambiguous', reason: `no ${evidenceField} evidence for a personal owner` };
  return { status: 'needs-default' };
}
