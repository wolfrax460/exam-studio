// Workspace authorization for personal and institution-owned resources.
//
// Existing clients do not send a workspace header, so the default is the signed-in user's
// personal workspace and current behavior is unchanged. Institution routes can opt in with:
//
//   X-Workspace-Type: institution
//   X-Institution-Id: <institution id>
//
// The institution id is only a request for a workspace. It is never trusted on its own: the
// user must have an ACTIVE membership in that institution. A missing institution, an inactive
// membership, and a resource owned by another institution all answer 404 so they cannot be
// used to probe for other tenants.
//
// This module deliberately does not read req.body or req.query for workspace selection.
import { httpError } from './errors.js';
import { findInstitutionById, findMembership } from './workspaceRepository.js';

export const WORKSPACE_TYPES = Object.freeze(['personal', 'institution']);
export const WORKSPACE_HEADERS = Object.freeze({
  type: 'x-workspace-type',
  institutionId: 'x-institution-id',
});

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function headerValue(req, name) {
  const value = typeof req.get === 'function' ? req.get(name) : req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

const notFound = () => httpError(404, 'Workspace not found.');

/**
 * Resolve the workspace selected for this request after authentication.
 *
 * Personal workspace is the default. Institution workspace requires both an institution id and
 * an active membership for req.user. The resolved values live on req.workspace for route guards.
 */
export async function resolveWorkspace(req, _res, next) {
  try {
    const userId = String(req.user?.id || req.userId || '').trim();
    if (!userId) return next(httpError(401, 'Please sign in to continue.'));

    const explicitType = text(headerValue(req, WORKSPACE_HEADERS.type)).toLowerCase();
    const institutionId = text(headerValue(req, WORKSPACE_HEADERS.institutionId));
    const type = explicitType || (institutionId ? 'institution' : 'personal');

    if (!WORKSPACE_TYPES.includes(type)) {
      return next(httpError(400, 'Workspace type must be personal or institution.'));
    }

    if (type === 'personal') {
      if (institutionId) {
        return next(httpError(400, 'A personal workspace cannot specify an institution.'));
      }
      req.workspace = {
        type: 'personal',
        ownerType: 'personal',
        userId,
        institutionId: null,
        membership: null,
      };
      return next();
    }

    if (!institutionId) {
      return next(httpError(400, 'An institution workspace requires an institution id.'));
    }

    const [institution, membership] = await Promise.all([
      findInstitutionById(institutionId),
      findMembership(userId, institutionId),
    ]);
    if (!institution || !membership || membership.status !== 'active') {
      return next(notFound());
    }

    req.workspace = {
      type: 'institution',
      ownerType: 'institution',
      userId,
      institutionId: String(institution.id),
      membership,
    };
    return next();
  } catch (error) {
    if (error.status) return next(error);
    return next(httpError(503, `Workspace could not be checked: ${error.message}`));
  }
}

/**
 * Does this workspace allow access to this resource?
 *
 * Personal access requires a personal resource whose owner matches the signed-in user. Legacy
 * records without ownership fields count as personal. Institution access requires an institution
 * resource in the selected institution; any active member may access it, while role permissions
 * remain a later concern.
 */
export function canAccessResource(workspace, resource, ownerField = 'userId') {
  if (!workspace || !resource || !workspace.userId) return false;

  const ownerType = resource.ownerType === undefined || resource.ownerType === null || resource.ownerType === ''
    ? 'personal'
    : String(resource.ownerType);
  const resourceInstitutionId = resource.institutionId === undefined || resource.institutionId === null
    ? null
    : String(resource.institutionId);

  if (workspace.type === 'personal') {
    if (ownerType !== 'personal' || resourceInstitutionId !== null) return false;
    const ownerFields = Array.isArray(ownerField) ? ownerField : [ownerField];
    return ownerFields.some((field) => {
      const owner = resource[field];
      return owner !== undefined && owner !== null && String(owner) === String(workspace.userId);
    });
  }

  if (workspace.type === 'institution') {
    if (!workspace.institutionId) return false;
    if (workspace.membership?.status !== 'active') return false;
    return ownerType === 'institution'
      && resourceInstitutionId !== null
      && resourceInstitutionId === String(workspace.institutionId);
  }

  return false;
}

export const workspaceAllows = canAccessResource;

/**
 * Load a resource and enforce workspace ownership.
 *
 * A missing resource and a resource owned by another workspace both answer the same 404. That
 * keeps cross-institution access indistinguishable from an unknown id.
 *
 * @param {(req: object) => Promise<object|null>|object|null} loadResource
 * @param {{ownerField?: string|string[], message?: string}} [options]
 */
export function requireWorkspaceResource(loadResource, options = {}) {
  const { ownerField = 'userId', message = 'That resource was not found.' } = options;
  return async function workspaceResource(req, _res, next) {
    try {
      if (!req.workspace) return next(httpError(401, 'Please sign in to continue.'));
      const resource = await loadResource(req);
      if (!resource || !canAccessResource(req.workspace, resource, ownerField)) {
        return next(httpError(404, message));
      }
      req.resource = resource;
      return next();
    } catch (error) {
      if (error.status) return next(error);
      return next(httpError(503, `Workspace resource could not be checked: ${error.message}`));
    }
  };
}

export const requireResourceAccess = requireWorkspaceResource;

export default {
  WORKSPACE_TYPES,
  WORKSPACE_HEADERS,
  resolveWorkspace,
  canAccessResource,
  workspaceAllows,
  requireWorkspaceResource,
  requireResourceAccess,
};
