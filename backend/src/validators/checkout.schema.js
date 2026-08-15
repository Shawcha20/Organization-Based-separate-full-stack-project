const { z } = require('zod');
const { email, password } = require('./auth.schema');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

const registerSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name is too short').max(100),
  adminName: z.string().trim().min(2, 'Your name is too short').max(100),
  email,
  password,
  planId: objectId,
});

module.exports = { registerSchema, objectId };
