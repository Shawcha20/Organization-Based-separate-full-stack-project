const request = require('supertest');

const app = require('../src/app');
const User = require('../src/models/User');
const { createTenant, createPlatformAdmin, bearer } = require('./helpers');
const { ROLES } = require('../src/utils/constants');

// Role checks live in middleware on the server. These tests hit the API
// directly, so they prove the rules hold even when the UI is bypassed.
describe('role authorization', () => {
  describe('organization member', () => {
    it('cannot read billing, subscription, transactions or members', async () => {
      const { member } = await createTenant();
      const forbidden = [
        '/api/org',
        '/api/org/members',
        '/api/org/subscription',
        '/api/org/payments',
        '/api/org/transactions',
      ];

      for (const url of forbidden) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(app).get(url).set(bearer(member.token));
        expect([403]).toContain(res.status);
      }
    });

    it('cannot invite or remove members', async () => {
      const { member, admin } = await createTenant();

      const invite = await request(app)
        .post('/api/org/members')
        .set(bearer(member.token))
        .send({ name: 'Someone', email: 'someone@test.dev', role: ROLES.ORG_MEMBER });
      expect(invite.status).toBe(403);

      const remove = await request(app)
        .delete(`/api/org/members/${admin.user._id}`)
        .set(bearer(member.token));
      expect(remove.status).toBe(403);
    });

    it('cannot reach any platform admin endpoint', async () => {
      const { member } = await createTenant();

      const stats = await request(app).get('/api/admin/stats').set(bearer(member.token));
      const orgs = await request(app).get('/api/admin/organizations').set(bearer(member.token));

      expect(stats.status).toBe(403);
      expect(orgs.status).toBe(403);
    });

    it('can read its own profile and a redacted view of its organization', async () => {
      const { member } = await createTenant();

      const profile = await request(app).get('/api/me').set(bearer(member.token));
      const info = await request(app).get('/api/org/info').set(bearer(member.token));

      expect(profile.status).toBe(200);
      expect(info.status).toBe(200);
      expect(info.body).toHaveProperty('planName');
      // No financial detail is exposed to a plain member.
      expect(info.body).not.toHaveProperty('billingEmail');
      expect(info.body).not.toHaveProperty('stripeCustomerId');
    });
  });

  describe('organization admin', () => {
    it('cannot reach platform admin endpoints', async () => {
      const { admin } = await createTenant();

      const res = await request(app).get('/api/admin/organizations').set(bearer(admin.token));

      expect(res.status).toBe(403);
    });

    it('cannot create a platform admin through the invite endpoint', async () => {
      const { admin } = await createTenant();

      const res = await request(app)
        .post('/api/org/members')
        .set(bearer(admin.token))
        .send({ name: 'Sneaky', email: 'sneaky@test.dev', role: ROLES.PLATFORM_ADMIN });

      expect(res.status).toBe(400);
      expect(await User.exists({ email: 'sneaky@test.dev' })).toBeFalsy();
    });

    it('cannot remove the last remaining admin', async () => {
      const { admin } = await createTenant();

      const res = await request(app)
        .delete(`/api/org/members/${admin.user._id}`)
        .set(bearer(admin.token));

      expect(res.status).toBe(400);
    });
  });

  describe('platform admin', () => {
    it('reads platform-wide stats and organizations', async () => {
      await createTenant();
      const platform = await createPlatformAdmin();

      const stats = await request(app).get('/api/admin/stats').set(bearer(platform.token));
      const orgs = await request(app).get('/api/admin/organizations').set(bearer(platform.token));

      expect(stats.status).toBe(200);
      expect(stats.body.organizations).toBeGreaterThanOrEqual(1);
      expect(orgs.body.items[0]).toHaveProperty('memberCount');
    });

    it('cannot use tenant-scoped endpoints, having no tenant of its own', async () => {
      const platform = await createPlatformAdmin();

      const res = await request(app).get('/api/org/members').set(bearer(platform.token));

      expect(res.status).toBe(403);
    });

    it('can suspend and reactivate an organization', async () => {
      const { organization } = await createTenant();
      const platform = await createPlatformAdmin();

      const suspend = await request(app)
        .patch(`/api/admin/organizations/${organization._id}/status`)
        .set(bearer(platform.token))
        .send({ status: 'SUSPENDED', reason: 'Non-payment' });
      expect(suspend.status).toBe(200);
      expect(suspend.body.status).toBe('SUSPENDED');

      const reactivate = await request(app)
        .patch(`/api/admin/organizations/${organization._id}/status`)
        .set(bearer(platform.token))
        .send({ status: 'ACTIVE' });
      expect(reactivate.body.status).toBe('ACTIVE');
    });
  });
});
