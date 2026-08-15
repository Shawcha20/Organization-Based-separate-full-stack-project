const { z } = require('zod');
const { ORG_STATUS, BILLING_INTERVAL } = require('../utils/constants');

const planSchema = z.object({
  name: z.string().trim().min(2, 'Plan name is too short').max(60),
  slug: z.string().trim().optional(),
  description: z.string().trim().max(300).optional(),
  // Entered in cents so we never deal with floating point money.
  price: z.coerce.number().int('Price must be a whole number of cents').min(0),
  currency: z.string().length(3).toLowerCase().default('usd'),
  interval: z.enum(Object.values(BILLING_INTERVAL)),
  features: z.array(z.string().trim().min(1)).max(20).default([]),
  memberLimit: z.coerce.number().int().min(1).default(10),
  active: z.boolean().default(true),
});

const planUpdateSchema = planSchema.partial().omit({ slug: true });

const orgStatusSchema = z.object({
  // Only these two transitions are exposed; the rest are driven by payments.
  status: z.enum([ORG_STATUS.ACTIVE, ORG_STATUS.SUSPENDED]),
  reason: z.string().trim().max(200).optional(),
});

module.exports = { planSchema, planUpdateSchema, orgStatusSchema };
