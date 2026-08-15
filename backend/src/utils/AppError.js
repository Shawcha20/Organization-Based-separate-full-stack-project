// Errors we raise on purpose. The error handler trusts the message of an
// AppError and shows it to the client; anything else becomes a generic 500 so
// we never leak stack traces or driver messages.
class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Not authenticated') {
    return new AppError(401, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new AppError(409, message);
  }
}

module.exports = AppError;
