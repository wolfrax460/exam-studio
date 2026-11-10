import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticateUser } from './auth.js';
import { httpError } from './errors.js';
import { findUserByEmail, findUserById } from './repository.js';
import { resolveWorkspace } from './workspaceAuth.js';
import {
  createInstitution, createMembership, findInstitutionById, findMembership, listInstitutions, transitionInstitution,
  acceptWorkspaceInvitation, changeWorkspaceMembership, inviteWorkspaceMember, listAuthorizedInstitutions,
  listInstitutionDirectory, listMembershipsForInstitution,
} from './workspaceRepository.js';
import { INSTITUTION_STATUSES, INSTITUTION_TYPES } from './workspaceValidation.js';

const enabled = () => process.env.EXAM_STUDIO_INSTITUTIONS_ENABLED === 'true';
const isSuperadmin = (id) => Boolean(id) && (process.env.EXAM_STUDIO_SUPERADMIN_IDS || '')
  .split(',').some((entry) => entry.trim().toLowerCase() === String(id).toLowerCase());

export function institutionAccess(user) {
  return { enabled: enabled(), canReview: enabled() && !user?.mustChangePassword && isSuperadmin(user?.id) };
}

export function protectSuperadminAccount(req, _res, next) {
  if (isSuperadmin(req.params.id) && !isSuperadmin(req.user.id)) {
    return next(httpError(403, 'This platform account is managed by a superadmin.'));
  }
  return next();
}

const registration = z.strictObject({
  name: z.string().trim().min(1).max(160),
  type: z.enum(INSTITUTION_TYPES),
  country: z.string().trim().min(1).max(100),
  location: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().max(254).pipe(z.email()).transform((email) => email.toLowerCase()),
  telephone: z.string().trim().max(40).regex(/^[0-9+(). /-]*$/).optional(),
  description: z.string().trim().max(1000).optional(),
});
const review = z.strictObject({
  status: z.enum(['active', 'suspended']),
  version: z.number().int().nonnegative(),
  reason: z.string().trim().max(300).optional(),
});
const memberRole = z.enum(['teacher', 'member']);
const invitation = z.strictObject({ email: z.string().trim().max(254).pipe(z.email()), role: memberRole });
const acceptance = z.strictObject({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/) });
const membershipChange = z.strictObject({
  role: memberRole.optional(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
}).refine((change) => change.role || change.status);
const invitationHash = (code) => createHash('sha256').update(code).digest('hex');
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path[0];
  throw httpError(400, field ? `Check the value of ${field}.` : 'Check the submitted fields.');
}

function privateRoute(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  if (!enabled()) return next(httpError(404, 'Not found.'));
  return authenticateUser(req, res, next);
}

function requireReviewer(req, _res, next) {
  if (!institutionAccess(req.user).canReview) return next(httpError(403, 'Platform superadmin access required.'));
  return next();
}

function requireInstitution(req, _res, next) {
  if (req.workspace.type !== 'institution') return next(httpError(400, 'Select an institution workspace.'));
  return next();
}

function requireInstitutionAdmin(req, _res, next) {
  if (req.workspace.membership.role !== 'admin') return next(httpError(403, 'Institution administrator access required.'));
  return next();
}

const handle = (fn) => (req, res, next) => fn(req, res).catch(next);
const publicRequest = ({ id, name, type, status, profile, createdAt }) => ({
  id, name, type, status, ...profile, createdAt,
});
const reviewRequest = (institution) => ({
  ...publicRequest(institution),
  createdBy: institution.createdBy,
  version: institution.version,
  history: institution.history,
});

function pageOptions(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw httpError(400, 'Invalid page.');
  return { offset: (page - 1) * 20, limit: 21 };
}

function sendPage(res, institutions, serialize) {
  res.json({ items: institutions.slice(0, 20).map(serialize), hasMore: institutions.length > 20 });
}

async function bootstrapMembership(institution, reviewerId) {
  const creator = await findUserById(institution.createdBy);
  if (!creator?.active) throw httpError(409, 'The applicant account must be active before approval.');
  try {
    await createMembership({
      userId: creator.id, institutionId: institution.id, role: 'admin', status: 'active',
      invitedBy: reviewerId, acceptedAt: new Date(),
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await findMembership(creator.id, institution.id);
    if (existing?.status !== 'active' || existing.role !== 'admin') {
      throw httpError(409, 'The applicant already has a different membership. Resolve it before approval.');
    }
  }
}

export const institutionRoutes = Router();
const registrationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many institution applications. Try again later.' },
});
const invitationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invitation requests. Try again later.' },
});

institutionRoutes.get('/institutions/requests', privateRoute, handle(async (req, res) => {
  const items = await listInstitutions({ createdBy: req.user.id, ...pageOptions(req.query) });
  sendPage(res, items, publicRequest);
}));

institutionRoutes.post('/institutions/requests', privateRoute, registrationLimit, handle(async (req, res) => {
  const { name, type, ...profile } = parse(registration, req.body);
  const prefix = name.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 100).replace(/^-+|-+$/g, '') || 'institution';
  const slug = `${prefix}-${randomBytes(8).toString('hex')}`;
  const institution = await createInstitution({ name, type, profile, slug, createdBy: req.user.id });
  res.status(201).json(publicRequest(institution));
}));

institutionRoutes.get('/institutions/workspace', privateRoute, resolveWorkspace, (req, res) => {
  if (req.workspace.type !== 'institution') throw httpError(400, 'Select an institution workspace.');
  res.json({ institutionId: req.workspace.institutionId, role: req.workspace.membership.role });
});

const workspaceGuard = [privateRoute, resolveWorkspace, requireInstitution];
const memberAdminGuard = [...workspaceGuard, requireInstitutionAdmin];

institutionRoutes.get('/institutions/workspaces', privateRoute, handle(async (req, res) => {
  res.json({ items: await listAuthorizedInstitutions(req.user.id) });
}));

institutionRoutes.get('/institutions/workspace/overview', ...workspaceGuard, handle(async (req, res) => {
  const { institutionId, membership } = req.workspace;
  const [institution, members] = await Promise.all([
    findInstitutionById(institutionId),
    listMembershipsForInstitution(institutionId, { statuses: ['active'] }),
  ]);
  if (institution?.status !== 'active') throw httpError(404, 'Workspace not found.');
  const counts = { admin: 0, teacher: 0, member: 0 };
  for (const { role } of members) counts[role] += 1;
  const { name, type, profile } = institution;
  res.json({ id: institutionId, name, type, location: profile?.location, country: profile?.country, role: membership.role, counts });
}));

institutionRoutes.get('/institutions/members', ...workspaceGuard, handle(async (req, res) => {
  const { institutionId, membership } = req.workspace;
  const isAdmin = membership.role === 'admin';
  const statuses = isAdmin ? ['active', 'invited', 'suspended'] : ['active'];
  const members = await listInstitutionDirectory(institutionId, { statuses, ...pageOptions(req.query) }, isAdmin);
  sendPage(res, members, (member) => member);
}));

institutionRoutes.post('/institutions/members/invitations', ...memberAdminGuard, invitationLimit, handle(async (req, res) => {
  const { email, role } = parse(invitation, req.body);
  const invitee = await findUserByEmail(email);
  if (!invitee?.active) throw httpError(404, 'An active Exam Studio account is required for this address.');
  const code = randomBytes(32).toString('base64url');
  const inviteExpiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
  await inviteWorkspaceMember({
    userId: invitee.id, institutionId: req.workspace.institutionId, email: invitee.email, role,
    invitedBy: req.user.id, inviteHash: invitationHash(code), inviteExpiresAt,
  });
  res.status(201).json({ code, expiresAt: inviteExpiresAt.toISOString() });
}));

institutionRoutes.post('/institutions/invitations/accept', privateRoute, handle(async (req, res) => {
  const { code } = parse(acceptance, req.body);
  const membership = await acceptWorkspaceInvitation(req.user.id, invitationHash(code));
  if (!membership) throw httpError(404, 'The invitation is invalid, expired or unavailable for this account.');
  res.json({ institutionId: membership.institutionId });
}));

institutionRoutes.put('/institutions/members/:id', ...memberAdminGuard, handle(async (req, res) => {
  const change = parse(membershipChange, req.body);
  const member = await changeWorkspaceMembership(req.workspace.institutionId, req.params.id, change);
  if (!member) throw httpError(404, 'Manageable membership not found.');
  res.json({ id: member.id, role: member.role, status: member.status });
}));

institutionRoutes.get('/admin/institutions', privateRoute, requireReviewer, handle(async (req, res) => {
  const status = req.query.status;
  if (status !== undefined && !INSTITUTION_STATUSES.includes(status)) throw httpError(400, 'Invalid institution status.');
  const items = await listInstitutions({ status, ...pageOptions(req.query) });
  sendPage(res, items, reviewRequest);
}));

institutionRoutes.put('/admin/institutions/:id/status', privateRoute, requireReviewer, handle(async (req, res) => {
  const { status, version, reason } = parse(review, req.body);
  const institution = await findInstitutionById(req.params.id);
  if (!institution) throw httpError(404, 'Institution not found.');
  if (institution.version !== version) throw httpError(409, 'This request changed. Reload it and try again.');
  if (institution.status === status || (institution.status === 'pending' && status !== 'active')) {
    throw httpError(409, 'This status change is unavailable.');
  }
  // Prepare the unique creator membership before publishing the active status. The workspace
  // guard keeps it inaccessible while the request is pending, and a retry can reuse it.
  if (institution.status === 'pending') await bootstrapMembership(institution, req.user.id);
  const updated = await transitionInstitution(institution, { status, by: req.user.id, reason });
  if (!updated) throw httpError(409, 'This request changed. Reload it and try again.');
  res.json(reviewRequest(updated));
}));
