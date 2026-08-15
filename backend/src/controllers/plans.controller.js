const Plan = require('../models/Plan');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { slugify } = require('../utils/slug');

// Public: the signup page and the org admin's subscription page both use this.
const listActive = asyncHandler(async (req, res) => {
  const plans = await Plan.find({ active: true }).sort({ price: 1 }).lean();
  res.json({ items: plans });
});

// Platform admin sees disabled plans too.
const listAll = asyncHandler(async (req, res) => {
  const plans = await Plan.find().sort({ price: 1 }).lean();
  res.json({ items: plans });
});

const create = asyncHandler(async (req, res) => {
  const slug = slugify(req.body.slug || req.body.name);
  if (await Plan.exists({ slug })) {
    throw AppError.conflict('A plan with that name already exists');
  }
  const plan = await Plan.create({ ...req.body, slug });
  res.status(201).json(plan);
});

const update = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw AppError.notFound('Plan not found');

  // The price of an existing plan is intentionally editable, but subscriptions
  // keep the snapshot they were sold at, so historic invoices do not change.
  Object.assign(plan, req.body);
  await plan.save();

  res.json(plan);
});

// Plans are disabled, never deleted - existing subscriptions still point here.
const setActive = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw AppError.notFound('Plan not found');

  plan.active = Boolean(req.body.active);
  await plan.save();

  res.json(plan);
});

module.exports = { listActive, listAll, create, update, setActive };
