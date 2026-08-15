const AppError = require('../utils/AppError');
const env = require('../config/env');

const notFound = (req, res, next) => {
  next(AppError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
};

// Single exit point for every error. Anything that is not an AppError is
// translated into a safe message - clients never see stack traces, Mongo
// driver text or Stripe internals.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Please check the highlighted fields';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'That identifier is not valid';
    details = undefined;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'That record already exists';
    details = undefined;
  } else if (!err.isOperational) {
    // Unexpected: log the real thing server-side, tell the client nothing.
    statusCode = 500;
    message = 'Something went wrong on our side. Please try again.';
    details = undefined;
  }

  if (statusCode >= 500) {
    console.error('[error]', req.method, req.originalUrl, err);
  }

  const body = { message };
  if (details) body.details = details;
  if (!env.isProd && statusCode >= 500) body.debug = err.message;

  res.status(statusCode).json(body);
};

module.exports = { notFound, errorHandler };
