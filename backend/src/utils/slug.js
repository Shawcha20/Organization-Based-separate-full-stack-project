// Turns "Acme Widgets, Inc." into "acme-widgets-inc". Collisions are resolved
// by the caller appending a short suffix.
function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'org';
}

module.exports = { slugify };
