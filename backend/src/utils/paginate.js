// Every list endpoint returns the same envelope so the frontend table can be
// written once.
function readPageParams(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

async function paginate(model, filter, { query, sort = { createdAt: -1 }, populate = [], select }) {
  const { page, limit, skip } = readPageParams(query);

  let q = model.find(filter).sort(sort).skip(skip).limit(limit);
  populate.forEach((p) => {
    q = q.populate(p);
  });
  if (select) q = q.select(select);

  const [items, total] = await Promise.all([q.lean(), model.countDocuments(filter)]);

  return { items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) };
}

module.exports = { paginate, readPageParams };
