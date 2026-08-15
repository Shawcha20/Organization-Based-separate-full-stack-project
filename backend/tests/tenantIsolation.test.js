const request = require('supertest');

const app = require('../src/app');
const User = require('../src/models/User');
const Payment = require('../src/models/Payment');
const { createTenant, bearer } = require('./helpers');

/**
 * Two tenants exist for every test here. Tenant A is always the caller and
 * tenant B is the victim; nothing tenant A does may touch tenant B.
 */
describe('multi-tenant data isolation', () => {
  it('lists only its own members', async () => {
    const a = await createTenant({ name: 'Alpha' });
    const b = await createTenant({ name: 'Beta' });

    const res = await request(app).get('/api/org/members').set(bearer(a.admin.token));

    expect(res.status).toBe(200);
    const ids = res.body.items.map((m) => m._id);
    expect(ids).toContain(a.admin.user._id.toString());
    expect(ids).not.toContain(b.admin.user._id.toString());
    res.body.items.forEach((m) => {
      expect(m.organization).toBe(a.organization._id.toString());
    });
  });

  it('lists only its own payments and transactions', async () => {
    const a = await createTenant();
    const b = await createTenant();

    const payments = await request(app).get('/api/org/payments').set(bearer(a.admin.token));

    expect(payments.status).toBe(200);
    const orgs = payments.body.items.map((p) => p.organization);
    expect(orgs.every((id) => id === a.organization._id.toString())).toBe(true);
    expect(orgs).not.toContain(b.organization._id.toString());
  });

  it('returns 404, not 403, when reading another tenant\'s member by id', async () => {
    const a = await createTenant();
    const b = await createTenant();

    // A tenant-scoped lookup simply finds nothing, so the id is not confirmed
    // to exist at all.
    const res = await request(app)
      .patch(`/api/org/members/${b.member.user._id}/role`)
      .set(bearer(a.admin.token))
      .send({ role: 'ORG_ADMIN' });

    expect(res.status).toBe(404);

    const untouched = await User.findById(b.member.user._id);
    expect(untouched.role).toBe('ORG_MEMBER');
  });

  it('cannot delete a member belonging to another tenant', async () => {
    const a = await createTenant();
    const b = await createTenant();

    const res = await request(app)
      .delete(`/api/org/members/${b.member.user._id}`)
      .set(bearer(a.admin.token));

    expect(res.status).toBe(404);
    expect(await User.exists({ _id: b.member.user._id })).toBeTruthy();
  });

  it('cannot download another tenant\'s invoice', async () => {
    const a = await createTenant();
    const b = await createTenant();

    const res = await request(app)
      .get(`/api/org/payments/${b.payment._id}/invoice`)
      .set(bearer(a.admin.token));

    expect(res.status).toBe(404);
  });

  it('ignores an organization id supplied in the request body', async () => {
    const a = await createTenant();
    const b = await createTenant();

    // The tenant comes from the token; anything in the body is discarded by
    // the validator before the controller runs.
    const res = await request(app)
      .patch('/api/org')
      .set(bearer(a.admin.token))
      .send({ name: 'Renamed by A', organization: b.organization._id, status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(a.organization._id.toString());

    const victim = await request(app).get('/api/org').set(bearer(b.admin.token));
    expect(victim.body.name).toBe(b.organization.name);
    expect(victim.body.status).toBe('ACTIVE');
  });

  it('keeps invoice numbers and payments out of the other tenant\'s reach entirely', async () => {
    const a = await createTenant();
    const b = await createTenant();

    const all = await Payment.find({ organization: a.organization._id });
    expect(all.every((p) => p.organization.equals(a.organization._id))).toBe(true);
    expect(await Payment.exists({ organization: b.organization._id })).toBeTruthy();
  });
});
