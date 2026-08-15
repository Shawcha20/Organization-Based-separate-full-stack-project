const Organization = require('../models/Organization');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate } = require('../utils/paginate');
const {
  ROLES,
  ORG_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  TRANSACTION_STATUS,
} = require('../utils/constants');

// These endpoints are the only ones in the app that read across tenants, and
// they sit behind requireRole(PLATFORM_ADMIN).

const stats = asyncHandler(async (req, res) => {
  const [organizations, users, activeSubscriptions, revenue, failedPayments, recentSignups] =
    await Promise.all([
      Organization.countDocuments(),
      User.countDocuments({ role: { $ne: ROLES.PLATFORM_ADMIN } }),
      Subscription.countDocuments({ status: SUBSCRIPTION_STATUS.ACTIVE }),
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.SUCCESS } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.countDocuments({ status: PAYMENT_STATUS.FAILED }),
      Organization.find().sort({ createdAt: -1 }).limit(5).select('name status createdAt').lean(),
    ]);

  res.json({
    organizations,
    users,
    activeSubscriptions,
    totalRevenue: revenue[0]?.total || 0,
    failedPayments,
    recentSignups,
  });
});

const listOrganizations = asyncHandler(async (req, res) => {
  const { search, status } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (search) filter.name = { $regex: String(search).trim(), $options: 'i' };

  const result = await paginate(Organization, filter, {
    query: req.query,
    populate: [{ path: 'plan', select: 'name price interval' }],
  });

  // Member counts in one grouped query rather than one query per row.
  const ids = result.items.map((o) => o._id);
  const counts = await User.aggregate([
    { $match: { organization: { $in: ids } } },
    { $group: { _id: '$organization', count: { $sum: 1 } } },
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

  result.items = result.items.map((org) => ({
    ...org,
    memberCount: countBy[org._id.toString()] || 0,
  }));

  res.json(result);
});

const getOrganization = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.params.id).populate('plan').lean();
  if (!organization) throw AppError.notFound('Organization not found');

  const orgFilter = { organization: organization._id };
  const [members, subscriptions, payments, transactions] = await Promise.all([
    User.find(orgFilter).sort({ createdAt: 1 }).lean(),
    Subscription.find(orgFilter).sort({ createdAt: -1 }).populate('plan', 'name price').lean(),
    Payment.find(orgFilter).sort({ createdAt: -1 }).limit(50).lean(),
    Transaction.find(orgFilter).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  res.json({
    organization,
    members: members.map(({ passwordHash, ...m }) => m),
    subscriptions,
    payments,
    transactions,
  });
});

const setOrganizationStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  const organization = await Organization.findById(req.params.id);
  if (!organization) throw AppError.notFound('Organization not found');

  organization.status = status;
  organization.suspendedAt = status === ORG_STATUS.SUSPENDED ? new Date() : null;
  organization.suspensionReason = status === ORG_STATUS.SUSPENDED ? reason || '' : '';
  await organization.save();

  res.json(organization);
});

// Platform-wide ledger, filterable by org, status and date range.
const listTransactions = asyncHandler(async (req, res) => {
  const { organization, status, from, to } = req.query;

  const filter = {};
  if (organization) filter.organization = organization;
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const result = await paginate(Transaction, filter, {
    query: req.query,
    populate: [{ path: 'organization', select: 'name slug' }],
  });

  res.json({ ...result, statuses: Object.values(TRANSACTION_STATUS) });
});

module.exports = {
  stats,
  listOrganizations,
  getOrganization,
  setOrganizationStatus,
  listTransactions,
};
