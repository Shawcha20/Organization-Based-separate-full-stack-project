// Express 4 does not catch rejected promises from async handlers, so every
// controller is wrapped in this instead of a try/catch per route.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
