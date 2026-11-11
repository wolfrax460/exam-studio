// Storage-neutral repository for institutions, memberships, groups, group members and
// assignments.
//
// MongoDB uses the Mongoose models; the JSON file backend uses the same validation helpers
// and uniqueness rules.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  initStorage,
  storageMode,
  getFileStore,
  saveFileStore,
} from './repository.js';
import Institution from './models/Institution.js';
import Membership from './models/Membership.js';
import User from './models/User.js';
import Group from './models/Group.js';
import GroupMember from './models/GroupMember.js';
import Assignment from './models/Assignment.js';
import {
  INSTITUTION_TYPES,
  INSTITUTION_STATUSES,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  GROUP_MEMBER_ROLES,
  assertEnum,
  normalizeText,
  normalizeSlug,
  normalizeInvitedEmail,
  normalizeDailyLimit,
  normalizeDate,
  normalizeOptionalDate,
  normalizeBoolean,
  normalizeId,
  normalizeIdList,
  validateAssignmentShape,
  validationError,
} from './workspaceValidation.js';

const newId = () => crypto.randomUUID();
const asIso = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const stringId = (value) => (value === null || value === undefined ? null : String(value));

function duplicateError(message) {
  const error = new Error(message);
  error.code = 11000;
  error.status = 409;
  return error;
}

function asMongoId(value, field) {
  if (!mongoose.isValidObjectId(value)) throw validationError(`${field} must be a valid id`);
  return new mongoose.Types.ObjectId(String(value));
}

function asMongoIdList(values, field) {
  return values.map((value) => asMongoId(value, field));
}

function ensureFileCollections() {
  const store = getFileStore();
  for (const key of ['institutions', 'memberships', 'groups', 'groupMembers', 'assignments']) {
    if (!Array.isArray(store[key])) store[key] = [];
  }
  return store;
}

const isMongo = () => storageMode() === 'mongo';

// ---------------------------------------------------------------- normalizers
function normalizeInstitution(doc) {
  return {
    id: String(doc._id ?? doc.id),
    name: doc.name,
    slug: doc.slug,
    type: doc.type,
    status: doc.status,
    createdBy: stringId(doc.createdBy),
    aiDailyLimit: doc.aiDailyLimit === null || doc.aiDailyLimit === undefined ? null : Number(doc.aiDailyLimit),
    createdAt: asIso(doc.createdAt),
    profile: doc.profile?.toObject?.() ?? doc.profile ?? null,
    version: doc.reviewVersion ?? 0,
    history: (doc.history || []).map(({ from, status, by, at, reason }) => ({
      from, status, by: stringId(by), at: asIso(at), reason: reason || '',
    })),
  };
}

function normalizeMembership(doc) {
  return {
    id: String(doc._id ?? doc.id),
    userId: stringId(doc.userId),
    institutionId: stringId(doc.institutionId),
    role: doc.role,
    status: doc.status,
    invitedBy: stringId(doc.invitedBy),
    invitedEmail: doc.invitedEmail || '',
    createdAt: asIso(doc.createdAt),
    acceptedAt: asIso(doc.acceptedAt),
    inviteExpiresAt: asIso(doc.inviteExpiresAt),
  };
}

function normalizeGroup(doc) {
  return {
    id: String(doc._id ?? doc.id),
    institutionId: stringId(doc.institutionId),
    name: doc.name,
    createdBy: stringId(doc.createdBy),
    archived: Boolean(doc.archived),
  };
}

function normalizeGroupMember(doc) {
  return {
    id: String(doc._id ?? doc.id),
    groupId: stringId(doc.groupId),
    institutionId: stringId(doc.institutionId),
    userId: stringId(doc.userId),
    role: doc.role,
  };
}

function normalizeAssignment(doc) {
  return {
    id: String(doc._id ?? doc.id),
    institutionId: stringId(doc.institutionId),
    publicationId: stringId(doc.publicationId),
    groupId: stringId(doc.groupId),
    userIds: Array.isArray(doc.userIds) ? doc.userIds.map(String) : [],
    opensAt: asIso(doc.opensAt),
    dueAt: asIso(doc.dueAt),
    createdBy: stringId(doc.createdBy),
  };
}

// ---------------------------------------------------------------- input validation
function validateInstitutionInput(input = {}) {
  const name = normalizeText(input.name, 'name', 160);
  const slug = normalizeSlug(input.slug);
  const type = assertEnum(input.type, INSTITUTION_TYPES, 'type');
  const status = assertEnum(input.status ?? 'pending', INSTITUTION_STATUSES, 'status');
  const createdBy = normalizeId(input.createdBy, 'createdBy');
  const aiDailyLimit = normalizeDailyLimit(input.aiDailyLimit);
  const createdAt = input.createdAt === undefined ? new Date() : normalizeDate(input.createdAt, 'createdAt');
  const profile = input.profile === undefined ? {} : { profile: input.profile };
  return { name, slug, type, status, createdBy, aiDailyLimit, createdAt, ...profile };
}

function validateMembershipInput(input = {}) {
  const userId = normalizeId(input.userId, 'userId');
  const institutionId = normalizeId(input.institutionId, 'institutionId');
  const role = assertEnum(input.role, MEMBERSHIP_ROLES, 'role');
  const status = assertEnum(input.status ?? 'invited', MEMBERSHIP_STATUSES, 'status');
  const invitedBy = input.invitedBy === undefined || input.invitedBy === null
    ? null
    : normalizeId(input.invitedBy, 'invitedBy');
  const invitedEmail = normalizeInvitedEmail(input.invitedEmail);
  const createdAt = input.createdAt === undefined ? new Date() : normalizeDate(input.createdAt, 'createdAt');
  const acceptedAt = normalizeOptionalDate(input.acceptedAt, 'acceptedAt');
  return { userId, institutionId, role, status, invitedBy, invitedEmail, createdAt, acceptedAt };
}

function validateGroupInput(input = {}) {
  return {
    institutionId: normalizeId(input.institutionId, 'institutionId'),
    name: normalizeText(input.name, 'name', 120),
    createdBy: normalizeId(input.createdBy, 'createdBy'),
    archived: normalizeBoolean(input.archived, false),
  };
}

function validateGroupMemberInput(input = {}) {
  return {
    groupId: normalizeId(input.groupId, 'groupId'),
    institutionId: normalizeId(input.institutionId, 'institutionId'),
    userId: normalizeId(input.userId, 'userId'),
    role: assertEnum(input.role, GROUP_MEMBER_ROLES, 'role'),
  };
}

function validateAssignmentInput(input = {}) {
  const shape = validateAssignmentShape({
    groupId: input.groupId,
    userIds: input.userIds,
    opensAt: input.opensAt,
    dueAt: input.dueAt,
  });
  return {
    institutionId: normalizeId(input.institutionId, 'institutionId'),
    publicationId: normalizeId(input.publicationId, 'publicationId'),
    groupId: shape.groupId,
    userIds: shape.userIds,
    opensAt: shape.opensAt,
    dueAt: shape.dueAt,
    createdBy: normalizeId(input.createdBy, 'createdBy'),
  };
}

// ---------------------------------------------------------------- institutions
export async function createInstitution(input) {
  await initStorage();
  const data = validateInstitutionInput(input);

  if (isMongo()) {
    try {
      const doc = await Institution.create({
        ...data,
        createdBy: asMongoId(data.createdBy, 'createdBy'),
      });
      return normalizeInstitution(doc);
    } catch (error) {
      if (error?.code === 11000) throw duplicateError('An institution with this slug already exists.');
      throw error;
    }
  }

  const store = ensureFileCollections();
  if (store.institutions.some((entry) => entry.slug === data.slug)) {
    throw duplicateError('An institution with this slug already exists.');
  }
  const record = {
    id: newId(),
    ...data,
    createdAt: data.createdAt.toISOString(),
  };
  store.institutions.push(record);
  try {
    saveFileStore();
  } catch (error) {
    store.institutions.pop();
    throw error;
  }
  return normalizeInstitution(record);
}

export async function findInstitutionById(id) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await Institution.findById(id).lean();
    return doc ? normalizeInstitution(doc) : null;
  }
  const doc = ensureFileCollections().institutions.find((entry) => entry.id === String(id));
  return doc ? normalizeInstitution(doc) : null;
}

export async function findInstitutionBySlug(slug) {
  await initStorage();
  const wanted = normalizeSlug(slug);
  if (isMongo()) {
    const doc = await Institution.findOne({ slug: wanted }).lean();
    return doc ? normalizeInstitution(doc) : null;
  }
  const doc = ensureFileCollections().institutions.find((entry) => entry.slug === wanted);
  return doc ? normalizeInstitution(doc) : null;
}

export async function listInstitutions({ createdBy, status, offset = 0, limit } = {}) {
  await initStorage();
  const filters = {
    ...(createdBy ? { createdBy } : {}),
    ...(status ? { status } : {}),
  };
  if (isMongo()) {
    const query = Institution.find(filters).sort({ createdAt: -1, _id: -1 }).skip(offset);
    if (limit) query.limit(limit);
    const docs = await query.lean();
    return docs.map(normalizeInstitution);
  }
  return ensureFileCollections().institutions
    .filter((entry) => Object.entries(filters).every(([key, value]) => entry[key] === value))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id))
    .slice(offset, limit ? offset + limit : undefined)
    .map(normalizeInstitution);
}

export async function transitionInstitution(institution, { status, by, reason }) {
  await initStorage();
  const event = { from: institution.status, status, by, reason, at: new Date().toISOString() };
  if (isMongo()) {
    const version = institution.version === 0
      ? { $or: [{ reviewVersion: 0 }, { reviewVersion: { $exists: false } }] }
      : { reviewVersion: institution.version };
    const doc = await Institution.findOneAndUpdate(
      { _id: institution.id, status: institution.status, ...version },
      { $set: { status }, $inc: { reviewVersion: 1 }, $push: { history: event } },
      { new: true, runValidators: true },
    ).lean();
    return doc ? normalizeInstitution(doc) : null;
  }

  const store = ensureFileCollections();
  const index = store.institutions.findIndex((entry) => entry.id === institution.id);
  const previous = store.institutions[index];
  if (previous?.status !== institution.status || (previous.reviewVersion ?? 0) !== institution.version) return null;
  const updated = {
    ...previous, status, reviewVersion: institution.version + 1, history: [...(previous.history || []), event],
  };
  store.institutions[index] = updated;
  try {
    saveFileStore();
  } catch (error) {
    store.institutions[index] = previous;
    throw error;
  }
  return normalizeInstitution(updated);
}

// ---------------------------------------------------------------- memberships
export async function createMembership(input) {
  await initStorage();
  const data = validateMembershipInput(input);

  if (isMongo()) {
    await Membership.init();
    try {
      const doc = await Membership.create({
        ...data,
        userId: asMongoId(data.userId, 'userId'),
        institutionId: asMongoId(data.institutionId, 'institutionId'),
        invitedBy: data.invitedBy === null ? null : asMongoId(data.invitedBy, 'invitedBy'),
      });
      return normalizeMembership(doc);
    } catch (error) {
      if (error?.code === 11000) throw duplicateError('This user is already a member of the institution.');
      throw error;
    }
  }

  const store = ensureFileCollections();
  if (store.memberships.some((entry) => entry.userId === data.userId && entry.institutionId === data.institutionId)) {
    throw duplicateError('This user is already a member of the institution.');
  }
  const record = {
    id: newId(),
    ...data,
    createdAt: data.createdAt.toISOString(),
    acceptedAt: data.acceptedAt ? data.acceptedAt.toISOString() : null,
  };
  store.memberships.push(record);
  try {
    saveFileStore();
  } catch (error) {
    store.memberships.pop();
    throw error;
  }
  return normalizeMembership(record);
}

export async function findMembership(userId, institutionId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(institutionId)) return null;
    const doc = await Membership.findOne({ userId, institutionId }).lean();
    return doc ? normalizeMembership(doc) : null;
  }
  const doc = ensureFileCollections().memberships.find(
    (entry) => entry.userId === String(userId) && entry.institutionId === String(institutionId),
  );
  return doc ? normalizeMembership(doc) : null;
}

export async function listMembershipsForUser(userId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(userId)) return [];
    const docs = await Membership.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(normalizeMembership);
  }
  return ensureFileCollections().memberships
    .filter((entry) => entry.userId === String(userId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(normalizeMembership);
}

export async function listMembershipsForInstitution(institutionId, { statuses, offset = 0, limit } = {}) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(institutionId)) return [];
    const filter = { institutionId, ...(statuses && { status: { $in: statuses } }) };
    const query = Membership.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset);
    if (limit) query.limit(limit);
    const docs = await query.lean();
    return docs.map(normalizeMembership);
  }
  return ensureFileCollections().memberships
    .filter((entry) => entry.institutionId === String(institutionId) && (!statuses || statuses.includes(entry.status)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id))
    .slice(offset, limit ? offset + limit : undefined)
    .map(normalizeMembership);
}

export async function findInstitutionMembership(institutionId, id) {
  await initStorage();
  const doc = isMongo()
    ? (mongoose.isValidObjectId(id) && await Membership.findOne({ institutionId, _id: id }).lean())
    : ensureFileCollections().memberships.find((entry) => entry.institutionId === institutionId && entry.id === id);
  return doc ? normalizeMembership(doc) : null;
}

export async function listAuthorizedInstitutions(userId) {
  const memberships = (await listMembershipsForUser(userId)).filter(({ status }) => status === 'active');
  const roles = new Map(memberships.map(({ institutionId, role }) => [institutionId, role]));
  const institutions = isMongo()
    ? await Institution.find({ _id: { $in: [...roles.keys()] }, status: 'active' }).select('name type').lean()
    : ensureFileCollections().institutions.filter(({ id, status }) => status === 'active' && roles.has(id));
  return institutions.map((doc) => {
    const id = String(doc._id ?? doc.id);
    return { id, name: doc.name, type: doc.type, role: roles.get(id) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listInstitutionDirectory(institutionId, options, includeEmail) {
  const memberships = await listMembershipsForInstitution(institutionId, options);
  const ids = new Set(memberships.map(({ userId }) => userId));
  const users = isMongo()
    ? await User.find({ _id: { $in: [...ids] } }).select(includeEmail ? 'name email' : 'name').lean()
    : getFileStore().users.filter(({ id }) => ids.has(id));
  const byId = new Map(users.map((user) => [String(user._id ?? user.id), user]));
  return memberships.map(({ id, userId, role, status, inviteExpiresAt }) => {
    const user = byId.get(userId);
    return { id, name: user?.name || 'Unavailable account', role, status, inviteExpiresAt, ...(includeEmail && { email: user?.email }) };
  });
}

function writeFileMembership(records, index, record) {
  const previous = records[index];
  records[index] = record;
  try {
    saveFileStore();
  } catch (error) {
    if (previous) records[index] = previous;
    else records.pop();
    throw error;
  }
  return normalizeMembership(record);
}

export async function inviteWorkspaceMember({ userId, institutionId, email, role, invitedBy, inviteHash, inviteExpiresAt }) {
  await initStorage();
  const now = new Date();
  const patch = {
    userId, institutionId, role, invitedBy, invitedEmail: email, inviteHash, inviteExpiresAt,
    status: 'invited', createdAt: now, acceptedAt: null,
  };
  const conflict = () => duplicateError('This account already has a membership or an outstanding invitation.');
  if (isMongo()) {
    await Membership.init();
    try {
      const doc = await Membership.findOneAndUpdate(
        { userId, institutionId, $or: [{ status: 'removed' }, { status: 'invited', inviteExpiresAt: { $lte: now } }] },
        { $set: patch }, { new: true, upsert: true, runValidators: true },
      ).lean();
      return normalizeMembership(doc);
    } catch (error) {
      if (error.code === 11000) throw conflict();
      throw error;
    }
  }
  const { memberships } = ensureFileCollections();
  const index = memberships.findIndex((member) => member.userId === userId && member.institutionId === institutionId);
  const previous = memberships[index];
  if (previous && previous.status !== 'removed'
    && !(previous.status === 'invited' && previous.inviteExpiresAt && new Date(previous.inviteExpiresAt) <= now)) throw conflict();
  return writeFileMembership(memberships, index === -1 ? memberships.length : index, {
    id: previous?.id || newId(), ...patch, createdAt: now.toISOString(), inviteExpiresAt: inviteExpiresAt.toISOString(),
  });
}

export async function acceptWorkspaceInvitation(userId, inviteHash) {
  await initStorage();
  const now = new Date();
  const filter = { userId, inviteHash, status: 'invited', inviteExpiresAt: { $gt: now } };
  const patch = { status: 'active', acceptedAt: now, inviteHash: null, inviteExpiresAt: null };
  if (isMongo()) {
    const invitation = await Membership.findOne(filter).lean();
    if (!invitation || !(await Institution.exists({ _id: invitation.institutionId, status: 'active' }))) return null;
    const doc = await Membership.findOneAndUpdate({ _id: invitation._id, ...filter }, { $set: patch }, { new: true }).lean();
    return doc ? normalizeMembership(doc) : null;
  }
  const store = ensureFileCollections();
  const index = store.memberships.findIndex((member) => member.userId === userId && member.inviteHash === inviteHash
    && member.status === 'invited' && new Date(member.inviteExpiresAt) > now);
  const previous = store.memberships[index];
  if (!previous || !store.institutions.some(({ id, status }) => id === previous.institutionId && status === 'active')) return null;
  return writeFileMembership(store.memberships, index, { ...previous, ...patch, acceptedAt: now.toISOString() });
}

export async function changeWorkspaceMembership(institutionId, membershipId, patch) {
  await initStorage();
  const statuses = patch.status === 'removed' ? ['invited', 'active', 'suspended'] : ['active', 'suspended'];
  const update = patch.status === 'removed' ? { ...patch, inviteHash: null, inviteExpiresAt: null } : patch;
  if (isMongo()) {
    if (!mongoose.isValidObjectId(membershipId)) return null;
    const doc = await Membership.findOneAndUpdate(
      { _id: membershipId, institutionId, status: { $in: statuses }, role: { $in: ['teacher', 'member'] } },
      { $set: update }, { new: true, runValidators: true },
    ).lean();
    return doc ? normalizeMembership(doc) : null;
  }
  const { memberships } = ensureFileCollections();
  const index = memberships.findIndex(({ id, institutionId: tenant, role, status }) =>
    id === membershipId && tenant === institutionId && ['teacher', 'member'].includes(role) && statuses.includes(status));
  if (index === -1) return null;
  return writeFileMembership(memberships, index, { ...memberships[index], ...update });
}

// ---------------------------------------------------------------- groups
export async function createGroup(input) {
  await initStorage();
  const data = validateGroupInput(input);

  if (isMongo()) {
    const doc = await Group.create({
      ...data,
      institutionId: asMongoId(data.institutionId, 'institutionId'),
      createdBy: asMongoId(data.createdBy, 'createdBy'),
    });
    return normalizeGroup(doc);
  }

  const store = ensureFileCollections();
  const record = { id: newId(), ...data };
  store.groups.push(record);
  saveFileStore();
  return normalizeGroup(record);
}

export async function findGroupById(id) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await Group.findById(id).lean();
    return doc ? normalizeGroup(doc) : null;
  }
  const doc = ensureFileCollections().groups.find((entry) => entry.id === String(id));
  return doc ? normalizeGroup(doc) : null;
}

export async function listGroupsForInstitution(institutionId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(institutionId)) return [];
    const docs = await Group.find({ institutionId }).sort({ name: 1 }).lean();
    return docs.map(normalizeGroup);
  }
  return ensureFileCollections().groups
    .filter((entry) => entry.institutionId === String(institutionId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(normalizeGroup);
}

// ---------------------------------------------------------------- group members
export async function createGroupMember(input) {
  await initStorage();
  const data = validateGroupMemberInput(input);

  if (isMongo()) {
    try {
      const doc = await GroupMember.create({
        ...data,
        groupId: asMongoId(data.groupId, 'groupId'),
        institutionId: asMongoId(data.institutionId, 'institutionId'),
        userId: asMongoId(data.userId, 'userId'),
      });
      return normalizeGroupMember(doc);
    } catch (error) {
      if (error?.code === 11000) throw duplicateError('This user is already in the group.');
      throw error;
    }
  }

  const store = ensureFileCollections();
  if (store.groupMembers.some((entry) => entry.groupId === data.groupId && entry.userId === data.userId)) {
    throw duplicateError('This user is already in the group.');
  }
  const record = { id: newId(), ...data };
  store.groupMembers.push(record);
  saveFileStore();
  return normalizeGroupMember(record);
}

export async function findGroupMember(groupId, userId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(userId)) return null;
    const doc = await GroupMember.findOne({ groupId, userId }).lean();
    return doc ? normalizeGroupMember(doc) : null;
  }
  const doc = ensureFileCollections().groupMembers.find(
    (entry) => entry.groupId === String(groupId) && entry.userId === String(userId),
  );
  return doc ? normalizeGroupMember(doc) : null;
}

export async function listGroupMembers(groupId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(groupId)) return [];
    const docs = await GroupMember.find({ groupId }).lean();
    return docs.map(normalizeGroupMember);
  }
  return ensureFileCollections().groupMembers
    .filter((entry) => entry.groupId === String(groupId))
    .map(normalizeGroupMember);
}

// ---------------------------------------------------------------- assignments
export async function createAssignment(input) {
  await initStorage();
  const data = validateAssignmentInput(input);

  if (isMongo()) {
    const doc = await Assignment.create({
      ...data,
      institutionId: asMongoId(data.institutionId, 'institutionId'),
      publicationId: asMongoId(data.publicationId, 'publicationId'),
      groupId: data.groupId === null ? null : asMongoId(data.groupId, 'groupId'),
      userIds: asMongoIdList(data.userIds, 'userIds'),
      createdBy: asMongoId(data.createdBy, 'createdBy'),
    });
    return normalizeAssignment(doc);
  }

  const store = ensureFileCollections();
  const record = {
    id: newId(),
    ...data,
    opensAt: data.opensAt.toISOString(),
    dueAt: data.dueAt.toISOString(),
  };
  store.assignments.push(record);
  saveFileStore();
  return normalizeAssignment(record);
}

export async function findAssignmentById(id) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await Assignment.findById(id).lean();
    return doc ? normalizeAssignment(doc) : null;
  }
  const doc = ensureFileCollections().assignments.find((entry) => entry.id === String(id));
  return doc ? normalizeAssignment(doc) : null;
}

export async function listAssignmentsForInstitution(institutionId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(institutionId)) return [];
    const docs = await Assignment.find({ institutionId }).sort({ opensAt: 1 }).lean();
    return docs.map(normalizeAssignment);
  }
  return ensureFileCollections().assignments
    .filter((entry) => entry.institutionId === String(institutionId))
    .sort((a, b) => String(a.opensAt).localeCompare(String(b.opensAt)))
    .map(normalizeAssignment);
}

export async function listAssignmentsForGroup(groupId) {
  await initStorage();
  if (isMongo()) {
    if (!mongoose.isValidObjectId(groupId)) return [];
    const docs = await Assignment.find({ groupId }).sort({ opensAt: 1 }).lean();
    return docs.map(normalizeAssignment);
  }
  return ensureFileCollections().assignments
    .filter((entry) => entry.groupId === String(groupId))
    .sort((a, b) => String(a.opensAt).localeCompare(String(b.opensAt)))
    .map(normalizeAssignment);
}

export { initStorage, storageMode, Institution, Membership, Group, GroupMember, Assignment };
