const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const User = require('../src/models/User');
const { createTenant, createUser, bearer } = require('./helpers');
const { hashToken } = require('../src/utils/tokens');
const { USER_STATUS, ORG_STATUS } = require('../src/utils/constants');

describe('authentication', () => {
  it('logs in with valid credentials and returns a token', async () => {
    const { admin } = await createTenant();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.user.email, password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(admin.user.email);
    // The hash must never leave the server.
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a wrong password with the same message as an unknown email', async () => {
    const { admin } = await createTenant();

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.user.email, password: 'NotThePassword1' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'NotThePassword1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('stores passwords hashed, never in plain text', async () => {
    const { user } = await createUser({ password: 'Password1' });
    const stored = await User.findById(user._id).select('+passwordHash');

    expect(stored.passwordHash).not.toBe('Password1');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
    expect(await stored.checkPassword('Password1')).toBe(true);
  });

  it('rejects an expired token', async () => {
    const { admin } = await createTenant();
    const expired = jwt.sign(
      { sub: admin.user._id.toString(), role: admin.user.role, org: admin.user.organization.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app).get('/api/auth/me').set(bearer(expired));

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const { admin } = await createTenant();
    const forged = jwt.sign({ sub: admin.user._id.toString(), role: 'PLATFORM_ADMIN' }, 'wrong-secret');

    const res = await request(app).get('/api/auth/me').set(bearer(forged));

    expect(res.status).toBe(401);
  });

  it('rejects a valid token whose role no longer matches the database', async () => {
    const { admin } = await createTenant();
    // Someone is demoted after their token was issued.
    await User.updateOne({ _id: admin.user._id }, { role: 'ORG_MEMBER' });

    const res = await request(app).get('/api/auth/me').set(bearer(admin.token));

    expect(res.status).toBe(401);
  });

  it('locks out a disabled user immediately, without waiting for expiry', async () => {
    const { member } = await createTenant();
    await User.updateOne({ _id: member.user._id }, { status: USER_STATUS.DISABLED });

    const res = await request(app).get('/api/auth/me').set(bearer(member.token));

    expect(res.status).toBe(401);
  });

  it('blocks login for a suspended organization', async () => {
    const { organization, admin } = await createTenant();
    organization.status = ORG_STATUS.SUSPENDED;
    await organization.save();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.user.email, password: 'Password1' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it('requires authentication on protected routes', async () => {
    const res = await request(app).get('/api/org/members');
    expect(res.status).toBe(401);
  });
});

describe('password reset', () => {
  it('does not reveal whether an email exists', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.dev' });
    expect(known.status).toBe(200);
    expect(known.body.message).toMatch(/if that email exists/i);
  });

  it('stores only the hash of the reset token and lets it be used once', async () => {
    const { member } = await createTenant();

    await request(app).post('/api/auth/forgot-password').send({ email: member.user.email });

    const stored = await User.findById(member.user._id).select('+resetTokenHash');
    expect(stored.resetTokenHash).toEqual(expect.any(String));

    // Reconstruct the raw token the way the email would carry it.
    const raw = 'a'.repeat(64);
    stored.resetTokenHash = hashToken(raw);
    stored.resetTokenExpiresAt = new Date(Date.now() + 60000);
    await stored.save();

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, password: 'BrandNew123' });
    expect(first.status).toBe(200);

    // The token is cleared, so a replay fails.
    const replay = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, password: 'Another123' });
    expect(replay.status).toBe(400);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: member.user.email, password: 'BrandNew123' });
    expect(login.status).toBe(200);
  });

  it('rejects an expired reset token', async () => {
    const { member } = await createTenant();
    const raw = 'b'.repeat(64);

    await User.updateOne(
      { _id: member.user._id },
      { resetTokenHash: hashToken(raw), resetTokenExpiresAt: new Date(Date.now() - 1000) }
    );

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, password: 'BrandNew123' });

    expect(res.status).toBe(400);
  });
});
