const User = require('../models/User');
const Organization = require('../models/Organization');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { signAccessToken, createRandomToken, hashToken } = require('../utils/tokens');
const { USER_STATUS, ORG_STATUS } = require('../utils/constants');
const { notify } = require('../services/email.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message and roughly the same work for "no such user" and "wrong
  // password", so the endpoint cannot be used to enumerate accounts.
  const ok = user ? await user.checkPassword(password) : false;
  if (!user || !ok) {
    throw AppError.unauthorized('Email or password is incorrect');
  }

  if (user.status === USER_STATUS.DISABLED) {
    throw AppError.forbidden('This account has been disabled');
  }
  if (user.status === USER_STATUS.INVITED) {
    throw AppError.forbidden('Please accept your invitation email before logging in');
  }

  let organization = null;
  if (user.organization) {
    organization = await Organization.findById(user.organization);
    if (!organization) throw AppError.unauthorized('Your organization no longer exists');
    if (organization.status === ORG_STATUS.SUSPENDED) {
      throw AppError.forbidden('This organization is suspended. Contact the platform administrator.');
    }
    if (organization.status === ORG_STATUS.PENDING) {
      throw AppError.forbidden('This organization has not completed payment yet');
    }
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: signAccessToken(user),
    user: user.toSafeJSON(),
    organization: organization
      ? { id: organization._id, name: organization.name, status: organization.status }
      : null,
  });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    user: req.user.toSafeJSON(),
    organization: req.organization
      ? { id: req.organization._id, name: req.organization.name, status: req.organization.status }
      : null,
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Always the same response, whether or not the address exists.
  if (user && user.status !== USER_STATUS.DISABLED) {
    const { raw, hash } = createRandomToken();
    user.resetTokenHash = hash;
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    await notify('passwordReset', user.email, {
      name: user.name,
      resetUrl: `${env.APP_URL}/reset-password?token=${raw}`,
    });
  }

  res.json({ message: 'If that email exists, a reset link is on its way' });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    resetTokenHash: hashToken(token),
    resetTokenExpiresAt: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpiresAt');

  if (!user) throw AppError.badRequest('This reset link is invalid or has expired');

  user.passwordHash = await User.hashPassword(password);
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  await user.save();

  res.json({ message: 'Password updated. You can now log in.' });
});

// Invited members land here from the invitation email: they set a password and
// their account flips from INVITED to ACTIVE.
const acceptInvite = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    inviteTokenHash: hashToken(token),
    inviteTokenExpiresAt: { $gt: new Date() },
  }).select('+inviteTokenHash +inviteTokenExpiresAt');

  if (!user) throw AppError.badRequest('This invitation is invalid or has expired');

  user.passwordHash = await User.hashPassword(password);
  user.status = USER_STATUS.ACTIVE;
  user.inviteTokenHash = null;
  user.inviteTokenExpiresAt = null;
  await user.save();

  res.json({ token: signAccessToken(user), user: user.toSafeJSON() });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.checkPassword(currentPassword))) {
    throw AppError.badRequest('Your current password is incorrect');
  }

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();

  res.json({ message: 'Password changed' });
});

module.exports = { login, me, forgotPassword, resetPassword, acceptInvite, changePassword };
