const User = require('../models/User');
const Organization = require('../models/Organization');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');
const { ROLES, USER_STATUS, ORG_STATUS } = require('../utils/constants');

// Reads the bearer token, reloads the user, and pins req.orgId to the tenant in
// the token. Everything downstream scopes its queries by req.orgId - it is
// never taken from the request body, params or a header.
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Authentication required');
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Your session has expired, please log in again');
    }
    throw AppError.unauthorized('Invalid session');
  }

  // Reloaded on every request so a removed or disabled user loses access
  // immediately instead of when their token happens to expire.
  const user = await User.findById(payload.sub);
  if (!user || user.status === USER_STATUS.DISABLED) {
    throw AppError.unauthorized('Your account is no longer active');
  }

  // A token issued before a role change must not keep the old privileges.
  const tokenOrg = payload.org || null;
  const userOrg = user.organization ? user.organization.toString() : null;
  if (payload.role !== user.role || tokenOrg !== userOrg) {
    throw AppError.unauthorized('Your access has changed, please log in again');
  }

  if (user.organization) {
    const org = await Organization.findById(user.organization).select('status name');
    if (!org) throw AppError.unauthorized('Your organization no longer exists');
    if (org.status === ORG_STATUS.SUSPENDED) {
      throw AppError.forbidden('This organization is suspended. Contact the platform administrator.');
    }
    req.organization = org;
  }

  req.user = user;
  req.orgId = user.organization || null;
  next();
});

// Role guard. Server-side only - the frontend hiding a button proves nothing.
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('Your role does not allow this action'));
    }
    next();
  };

// For routes that operate inside a tenant. A platform admin has no tenant of
// their own, so they cannot use these endpoints; they have their own panel.
const requireTenant = (req, res, next) => {
  if (!req.orgId) {
    return next(AppError.forbidden('This endpoint is scoped to an organization'));
  }
  next();
};

module.exports = { requireAuth, requireRole, requireTenant, ROLES };
