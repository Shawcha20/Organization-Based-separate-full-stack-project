const AppError = require('../utils/AppError');

// Validates and *replaces* the request part with the parsed result, so
// controllers only ever see stripped, typed data - unknown keys are dropped and
// cannot sneak into a Mongoose update.
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(AppError.badRequest('Please check the highlighted fields', details));
    }
    req[source] = result.data;
    next();
  };

module.exports = validate;
