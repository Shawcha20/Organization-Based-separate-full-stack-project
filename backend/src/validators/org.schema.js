const { z } = require('zod');
const { email } = require('./auth.schema');
const { objectId } = require('./checkout.schema');
const { ROLES } = require('../utils/constants');

const orgProfileSchema = z.object({
  name: z.string().trim().min(2, 'Organization name is too short').max(100).optional(),
  billingEmail: email.optional(),
  contactEmail: z.union([email, z.literal('')]).optional(),
  contactPhone: z.string().trim().max(30).optional(),
});

const inviteMemberSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email,
  // A tenant can only ever create users inside its own two roles - never a
  // PLATFORM_ADMIN.
  role: z.enum([ROLES.ORG_ADMIN, ROLES.ORG_MEMBER]).default(ROLES.ORG_MEMBER),
});

const changeRoleSchema = z.object({
  role: z.enum([ROLES.ORG_ADMIN, ROLES.ORG_MEMBER]),
});

const changePlanSchema = z.object({ planId: objectId });

const ownProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
});

module.exports = {
  orgProfileSchema,
  inviteMemberSchema,
  changeRoleSchema,
  changePlanSchema,
  ownProfileSchema,
};
