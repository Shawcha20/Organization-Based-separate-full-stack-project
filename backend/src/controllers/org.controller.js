const Organization = require('../models/Organization');
const User = require('../models/User');
const Plan = require('../models/Plan');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { createRandomToken } = require('../utils/tokens');
const { notify } = require('../services/email.service');
const { ROLES, USER_STATUS } = require('../utils/constants');

// Every query below is scoped by req.orgId, which comes from the JWT. There is
// no code path where an organization id from the request body or params can
// widen that scope.

const getProfile = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.orgId).populate('plan', 'name price interval');
  if (!organization) throw AppError.notFound('Organization not found');
  res.json(organization);
});

const updateProfile = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.orgId);
  if (!organization) throw AppError.notFound('Organization not found');

  // Only these fields; status, plan and Stripe ids are not editable by tenants.
  const { name, contactEmail, contactPhone, billingEmail } = req.body;
  if (name !== undefined) organization.name = name;
  if (contactEmail !== undefined) organization.contactEmail = contactEmail;
  if (contactPhone !== undefined) organization.contactPhone = contactPhone;
  if (billingEmail !== undefined) organization.billingEmail = billingEmail;

  await organization.save();
  res.json(organization);
});

const listMembers = asyncHandler(async (req, res) => {
  const members = await User.find({ organization: req.orgId }).sort({ createdAt: 1 }).lean();
  res.json({ items: members.map(({ passwordHash, ...m }) => m) });
});

const inviteMember = asyncHandler(async (req, res) => {
  const { name, email, role } = req.body;

  if (await User.exists({ email })) {
    throw AppError.conflict('Someone is already using that email address');
  }

  const organization = await Organization.findById(req.orgId).populate('plan', 'name memberLimit');
  const memberCount = await User.countDocuments({ organization: req.orgId });
  const limit = organization.plan?.memberLimit;
  if (limit && memberCount >= limit) {
    throw AppError.badRequest(
      `Your ${organization.plan.name} plan allows ${limit} members. Upgrade to invite more.`
    );
  }

  const { raw, hash } = createRandomToken();

  const member = await User.create({
    organization: req.orgId,
    name,
    email,
    // Placeholder: the account is unusable until the invite is accepted and a
    // real password is set. A random hash means it can never be guessed.
    passwordHash: await User.hashPassword(createRandomToken().raw),
    role,
    status: USER_STATUS.INVITED,
    inviteTokenHash: hash,
    inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await notify('memberInvited', member.email, {
    orgName: organization.name,
    invitedBy: req.user.name,
    inviteUrl: `${env.APP_URL}/accept-invite?token=${raw}`,
  });

  res.status(201).json(member.toSafeJSON());
});

const changeMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  // Scoped find: an id from another tenant simply does not match.
  const member = await User.findOne({ _id: req.params.id, organization: req.orgId });
  if (!member) throw AppError.notFound('Member not found');

  if (member._id.equals(req.user._id)) {
    throw AppError.badRequest('You cannot change your own role');
  }

  // Never leave a tenant without an admin who can pay the bill.
  if (member.role === ROLES.ORG_ADMIN && role !== ROLES.ORG_ADMIN) {
    const admins = await User.countDocuments({ organization: req.orgId, role: ROLES.ORG_ADMIN });
    if (admins <= 1) throw AppError.badRequest('An organization must keep at least one admin');
  }

  member.role = role;
  await member.save();

  res.json(member.toSafeJSON());
});

const removeMember = asyncHandler(async (req, res) => {
  const member = await User.findOne({ _id: req.params.id, organization: req.orgId });
  if (!member) throw AppError.notFound('Member not found');

  if (member._id.equals(req.user._id)) {
    throw AppError.badRequest('You cannot remove yourself');
  }
  if (member.role === ROLES.ORG_ADMIN) {
    const admins = await User.countDocuments({ organization: req.orgId, role: ROLES.ORG_ADMIN });
    if (admins <= 1) throw AppError.badRequest('An organization must keep at least one admin');
  }

  await member.deleteOne();
  res.json({ message: 'Member removed' });
});

// --- member panel --------------------------------------------------------

const getOwnProfile = asyncHandler(async (req, res) => {
  res.json(req.user.toSafeJSON());
});

const updateOwnProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (req.body.name !== undefined) user.name = req.body.name;
  await user.save();
  res.json(user.toSafeJSON());
});

/**
 * Read-only org view for regular members: name and plan name only. No prices,
 * no billing email, no financial detail.
 */
const getOrgInfoForMember = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.orgId).select('name status plan createdAt');
  if (!organization) throw AppError.notFound('Organization not found');

  const plan = organization.plan ? await Plan.findById(organization.plan).select('name') : null;
  const memberCount = await User.countDocuments({ organization: req.orgId });

  res.json({
    id: organization._id,
    name: organization.name,
    status: organization.status,
    planName: plan?.name || null,
    memberCount,
    createdAt: organization.createdAt,
  });
});

module.exports = {
  getProfile,
  updateProfile,
  listMembers,
  inviteMember,
  changeMemberRole,
  removeMember,
  getOwnProfile,
  updateOwnProfile,
  getOrgInfoForMember,
};
