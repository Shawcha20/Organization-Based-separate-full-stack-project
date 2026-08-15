# Octopi Digital — Multi-Tenant SaaS Subscription Platform

A subscription platform where organizations register, pay to activate, and then operate in a fully
isolated space with their own users, subscription and payment history.

Built for the Octopi Digital Jr. Full-Stack technical assessment.

---

## Contents

- [Stack](#stack)
- [Running it locally](#running-it-locally)
- [Test credentials](#test-credentials)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Database design](#database-design)
- [Multi-tenant isolation](#multi-tenant-isolation)
- [Authentication and authorization](#authentication-and-authorization)
- [Payment flow](#payment-flow)
- [Transactions and rollback](#transactions-and-rollback)
- [Idempotency](#idempotency)
- [Email notifications](#email-notifications)
- [Invoices](#invoices)
- [Error handling](#error-handling)
- [Tests](#tests)
- [Security notes](#security-notes)
- [How AI tools were used](#how-ai-tools-were-used)
- [What is done, partial, and not done](#what-is-done-partial-and-not-done)
- [Known limitations](#known-limitations)

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router), React 19 | File-based routing gives each panel its own layout, and the layout is a natural place to hang the role guard. |
| Data fetching | TanStack Query | The app is almost entirely server state — lists, detail pages, mutations that invalidate. Redux would have added a store to describe data the server already owns. |
| Styling | Tailwind CSS | A small shared component kit (`Button`, `Card`, `Table`, `Badge`) keeps the three panels visually consistent without a component library. |
| Backend | Node.js + Express | Small, explicit, and the middleware chain maps directly onto the layered checks this task needs: authenticate → authorize → scope to tenant → validate. |
| Database | MongoDB (Atlas) + Mongoose | Atlas clusters are replica sets, which is what makes multi-document transactions available. Schemas and indexes are declared per model. |
| Payments | Stripe Checkout (subscription mode) + webhooks | Card data never reaches this application. |
| Validation | Zod | One schema per endpoint, and it strips unknown keys before a controller ever sees the body. |
| Tests | Jest + Supertest + `mongodb-memory-server` | Runs against a real single-node replica set, so the transaction tests exercise genuine Mongo transactions. |

---

## Running it locally

**Prerequisites:** Node.js 18+, a MongoDB replica set (an Atlas free cluster works — a standalone
`mongod` will not, see [Transactions and rollback](#transactions-and-rollback)), and the
[Stripe CLI](https://stripe.com/docs/stripe-cli).

### 1. Backend

```bash
cd backend
npm install
# create backend/.env — see Environment variables below
npm run seed     # plans, platform admin, and one demo organization
npm run dev      # http://localhost:5000
```

### 2. Stripe webhooks

Payments are only ever confirmed by webhook, so this has to be running for signup to complete:

```bash
stripe login
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET` in `backend/.env` and restart the
API. The server refuses to boot without it — a missing webhook secret would silently break payment
confirmation, so it fails loudly instead.

### 3. Frontend

```bash
cd frontend
npm install
# create frontend/.env — see Environment variables below
npm run dev      # http://localhost:3000
```

### 4. Try the paid signup

Go to `/signup`, fill in the form, pick a plan, and pay with Stripe's test card:

```
4242 4242 4242 4242   any future expiry   any CVC   any postcode
```

To watch the failure path instead, use `4000 0000 0000 9995` (card declined).

### Other commands

```bash
cd backend
npm test         # 46 tests
npm run lint
```

---

## Test credentials

Created by `npm run seed`.

| Role | Email | Password |
| --- | --- | --- |
| Platform Admin | `admin@octopi.test` | `Admin1234` |
| Organization Admin | `owner@northwind.test` | `Owner1234` |
| Organization Member | `member@northwind.test` | `Member1234` |

The demo organization (*Northwind Labs*) is inserted directly by the seed script so all three roles
can be logged into immediately. It has no Stripe customer attached, so **"Manage payment method"
and plan changes will not work for it** — register a fresh organization through `/signup` to
exercise those. A real signup always goes through Stripe Checkout and the webhook.

---

## Environment variables

### `backend/.env`

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `PORT` | no | Defaults to `5000` |
| `MONGODB_URI` | **yes** | Must be a replica set |
| `JWT_SECRET` | **yes** | At least 16 characters |
| `JWT_EXPIRES_IN` | no | Defaults to `1d` |
| `STRIPE_SECRET_KEY` | **yes** | Test-mode `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | **yes** | `whsec_...` from `stripe listen` |
| `APP_URL` | no | Frontend origin; used for CORS, Stripe redirects and email links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | no | Leave empty to auto-create an Ethereal test inbox |
| `MAIL_FROM` | no | Sender shown on notification emails |

Every variable is validated by Zod at boot (`src/config/env.js`). A missing or malformed value stops
the process with a readable message rather than failing later inside a payment webhook.

### `frontend/.env`

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Defaults to `http://localhost:5000/api` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Test-mode `pk_test_...` |

Both `.env` files are gitignored. Secrets are never read from anywhere but the environment.

---

## Architecture

```
backend/src
  config/      env validation, database connection
  models/      Mongoose schemas and indexes
  middleware/  auth, role guards, tenant guard, validation, rate limits, error handler
  validators/  Zod schemas, one module per route group
  controllers/ request/response only
  services/    billing (transactions), stripe, email, invoice PDF
  routes/      route tables; guards are applied here, visibly
  jobs/        renewal reminder
  seed.js
```

```
frontend/src
  app/
    login, signup, forgot-password, reset-password, accept-invite, checkout/*
    admin/*   Platform Admin panel  (layout locks the subtree to PLATFORM_ADMIN)
    org/*     Organization Admin panel
    me/*      Member panel
  components/  DashboardLayout, AuthShell, PlanCard, ui/ kit
  lib/         api client, auth context, formatting
```

Two rules shaped the layout:

1. **Controllers stay thin.** Anything that touches more than one collection at a time lives in
   `services/billing.service.js`, because that is where the transaction boundary belongs.
2. **Guards are visible at the route table.** You can read `routes/org.routes.js` top to bottom and
   see that everything requires authentication, requires a tenant, and that billing requires
   `ORG_ADMIN`. Security that is easy to audit is security that stays correct.

---

## Database design

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `plans` | Platform-wide catalogue | `slug` unique, `{ active, price }` |
| `organizations` | The tenant root | `slug` unique, `status`, `createdAt`, text on `name` |
| `users` | Platform admins and tenant users | `email` unique, `{ organization, role }`, `{ organization, createdAt }` |
| `subscriptions` | One per organization (history kept) | `{ organization, status }`, `stripeSubscriptionId` |
| `payments` | One per money movement Stripe reports | `{ organization, createdAt }`, `{ organization, status }`, partial-unique `stripeInvoiceId` |
| `transactions` | Audit ledger | `{ organization, createdAt }`, `{ status, createdAt }` |
| `pendingregistrations` | Signup parked until payment confirms | `email`, `stripeSessionId`, TTL on `expiresAt` |
| `webhookevents` | Idempotency ledger | `stripeEventId` **unique** |
| `counters` | Sequential invoice numbers | `_id` |

Three decisions worth calling out:

**Money is stored in cents as integers.** No floating point anywhere. Formatting to `$49.00`
happens once, in `frontend/src/lib/format.js`.

**Subscriptions snapshot the plan.** `planName`, `amount`, `interval` are copied onto the
subscription and again onto each payment. When an admin edits a plan's price, historical invoices
and past subscriptions still show what was actually sold.

**`Payment` and `Transaction` are separate on purpose.** A `Payment` is what Stripe did; a
`Transaction` is what our system did about it — including attempts that failed. That is why the
transactions page can show a `FAILED` row that has no successful payment behind it.

**`stripeInvoiceId` uses a partial index, not a sparse one.** The field defaults to `null`, and a
sparse index still indexes an explicit `null` — so any two payments without a Stripe invoice id
would have collided with a duplicate-key error. The index is therefore
`partialFilterExpression: { stripeInvoiceId: { $type: 'string' } }`. This was caught by the test
suite, not by reading the code.

---

## Multi-tenant isolation

**Approach: a shared database with a mandatory tenant key, enforced in the application layer.**

Every tenant-scoped document carries an `organization` reference, and the tenant that a request may
touch is derived from **one place only — the JWT**:

```js
// middleware/auth.js
req.orgId = user.organization || null;
```

That value is read back from the database on every request (not just trusted from the token), and
every tenant query is written against it:

```js
// A list is always "this org's rows"
await User.find({ organization: req.orgId });

// A lookup by id is always scoped, so another tenant's id simply does not match
await User.findOne({ _id: req.params.id, organization: req.orgId });
```

Consequences that fall out of this, and that the tests assert:

- There is **no code path** where an organization id from a request body, query string, route param
  or header widens the scope. Zod validators strip unknown keys, so a body containing
  `{ organization: "<other tenant>" }` is discarded before the controller runs.
- A cross-tenant id returns **404, not 403** — the scoped lookup finds nothing, so the API never
  even confirms that the id exists.
- A `PLATFORM_ADMIN` has `organization: null` and is blocked from tenant endpoints by
  `requireTenant`. Their cross-tenant reads live on separate `/api/admin/*` routes behind
  `requireRole(PLATFORM_ADMIN)`, so cross-tenant access is a deliberate, greppable exception rather
  than a leak in the normal path.

**Why not a database per tenant?** Stronger isolation, but the platform admin's job — "total
revenue across all organizations", "all transactions filterable by org" — becomes a fan-out across
N connections, and every new signup becomes a provisioning step inside a payment webhook. For this
scale, a mandatory tenant key with the scoping rule enforced in one middleware is the better
trade-off. The main risk of this approach is a developer forgetting the filter on a new query, which
is why the isolation tests exist and why every scoped lookup follows the same shape.

---

## Authentication and authorization

- **Passwords:** bcrypt, cost 10. The hash column is `select: false`, so a stray `User.find()`
  cannot serialise it.
- **Sessions:** stateless JWT (`sub`, `role`, `org`), `Bearer` header, 1-day expiry.
- **Revocation:** the user is reloaded from the database on every request. A disabled or deleted
  user loses access immediately rather than when their token happens to expire. If the token's
  `role` or `org` no longer matches the database, the token is rejected — a stale token cannot keep
  privileges that were taken away.
- **Suspension:** a suspended organization blocks login *and* every subsequent request from its
  members.
- **Roles:** `PLATFORM_ADMIN`, `ORG_ADMIN`, `ORG_MEMBER`, enforced by `requireRole` on the server.
  The frontend's `DashboardLayout` guard exists only so users do not see a screen they would be
  refused anyway.
- **Privilege escalation:** the invite validator accepts only `ORG_ADMIN | ORG_MEMBER`, so a tenant
  cannot mint a platform admin. An organization cannot remove or demote its last admin.
- **Password reset and invites:** a random 32-byte token goes in the email; only its SHA-256 hash is
  stored, with an expiry (1 hour for resets, 7 days for invites). The token is cleared on use, so it
  cannot be replayed.
- **Account enumeration:** wrong-password and unknown-email return the same 401 message, and
  "forgot password" returns the same confirmation either way.
- **Rate limiting:** 10 login attempts / 15 min, 5 password-reset or invite requests / hour, 20
  checkout attempts / 15 min, 500 general API requests / 15 min.

---

## Payment flow

Registration is **paid onboarding**, so the organization does not exist until the money does.

```
1. POST /api/checkout/register
   └─ validate, hash password, write a PendingRegistration  ← nothing in the tenant tables yet
   └─ create a Stripe Checkout Session (subscription mode)
       metadata: { kind: REGISTRATION, pendingRegistrationId }
   └─ return the hosted checkout URL

2. Browser redirects to Stripe. Card details never touch this app.

3. Stripe → POST /api/webhooks/stripe   (signature verified against the raw body)
   checkout.session.completed
   └─ ONE Mongo transaction:
        claim the event id  →  Organization  →  admin User  →  Subscription (ACTIVE)
        →  invoice number  →  Payment (SUCCESS)  →  Transaction (SUCCESS)
        →  PendingRegistration = COMPLETED
   └─ after commit: send the "payment received" email

4. Browser lands on /checkout/success, which polls OUR database until the
   pending registration flips to COMPLETED.
```

**The redirect is never trusted.** Step 4 polls `/api/checkout/status`, which reports our own
state — a user who types the success URL by hand sees "pending" forever, because only a signed
webhook can change it.

**Failure and abandonment.** `checkout.session.expired` marks the registration `FAILED`. No
organization is created, nothing is charged, and `/checkout/cancelled` offers a retry that reuses
the saved details to create a fresh Checkout Session.

**Ongoing billing.** `invoice.payment_succeeded` records a renewal and extends the period;
`invoice.payment_failed` records a `FAILED` payment, flips the subscription to `FAILED` and emails
the billing contact. The first invoice of a subscription (`billing_reason: subscription_create`) is
deliberately skipped here, because the registration handler already recorded it — that keeps
ownership of the first payment in exactly one place regardless of which event arrives first.

**Upgrades and downgrades** swap the Stripe subscription item in place with
`proration_behavior: 'create_prorations'`, so the customer is only charged the difference.
**Cancellation** sets `cancel_at_period_end`, so the customer keeps what they paid for, and
`customer.subscription.deleted` marks it `CANCELLED` when the period actually ends.

---

## Transactions and rollback

Confirming a payment touches six collections. All of it happens inside a single Mongo transaction:

```js
await mongoose.connection.transaction(async (session) => {
  await claimEvent(event, session);          // idempotency ledger
  ...Organization, User, Subscription, Counter, Payment, Transaction
  await pending.save({ session });
});
```

If any step throws, **every write from that attempt is discarded** — no orphaned organization, no
half-activated subscription, no invoice number burned. The webhook then returns `500`, which is
Stripe's signal to retry, and the retry runs against clean state. This is tested directly: a forced
failure at the last write leaves all six collections empty and the pending registration still
`PENDING`, and the following retry succeeds.

Two details that matter:

- **The email is sent after the commit, never inside it.** A paid subscription must not be rolled
  back because an SMTP server was unreachable.
- **This requires a replica set.** MongoDB only offers multi-document transactions on a replica set,
  which is why Atlas (or `mongod --replSet`) is a hard requirement, and why the test suite runs on
  `MongoMemoryReplSet` rather than a standalone in-memory server.

**On the `ROLLED_BACK` transaction status:** because a rollback discards its own writes, a genuinely
rolled-back attempt leaves no ledger row behind — that is the point. The status is modelled and
filterable so that a future compensating flow (a refund reversal, for instance) has somewhere to
land, but no current code path writes it. The same is true of `REFUNDED`; refunds were not in scope.

---

## Idempotency

Stripe delivers at least once, so the same event will arrive twice.

1. `WebhookEvent.stripeEventId` is **unique**, and the insert happens *inside* the transaction. A
   redelivered event fails that insert and aborts the whole transaction, so nothing is applied
   twice.
2. A completed `PendingRegistration` is refused, which blocks a replay arriving under a *different*
   event id.
3. `Payment.stripeInvoiceId` is unique (partial), so the same invoice can never produce two payment
   rows.

Duplicates are answered with `200 { received: true, duplicate: true }`. Acknowledging is correct —
the event *was* handled — and it stops Stripe retrying forever. Only genuine failures return `500`.

---

## Email notifications

Nodemailer. With no `SMTP_*` variables set, the server creates an [Ethereal](https://ethereal.email)
test inbox on first send and logs a preview URL to the console for every message:

```
Email sent to owner@acme.com - preview: https://ethereal.email/message/XyZ...
```

Sent for: member invited, payment succeeded, payment failed, subscription upgraded / downgraded /
cancelled, and a renewal reminder three days before the period ends (`jobs/expiryReminder.js`, which
records the period it reminded for so an organization is emailed once per cycle).

Delivery failures are logged, never thrown — email is not allowed to fail a payment.

---

## Invoices

Every successful payment gets a sequential invoice number (`INV-2026-00001`) allocated by a
`$inc` on a counter document *inside the payment transaction*, so concurrent webhooks cannot claim
the same number.

`GET /api/org/payments/:id/invoice` streams a one-page PDF built with `pdfkit` — organization name,
plan, billing period, amount, payment date and invoice number. The lookup is tenant-scoped, so ids
cannot be walked to read another organization's invoice. Nothing is written to disk.

`pdfkit` was chosen over Puppeteer deliberately: no headless Chromium download for a document that
is a table and four lines of text.

---

## Error handling

One error handler (`middleware/error.js`) is the single exit point. `AppError` instances are trusted
and their message is shown to the user; **anything else becomes a generic 500** — no stack traces,
Mongo driver text or Stripe internals ever reach a client. Mongoose validation and duplicate-key
errors are translated into 400/409 with field-level detail.

Handled explicitly, end to end:

| Case | Behaviour |
| --- | --- |
| Invalid login | 401, identical message to unknown email |
| Expired session | 401 "Your session has expired"; the client clears the token and redirects to `/login?expired=1` |
| Unauthorized role | 403 from the server, regardless of what the UI shows |
| Wrong-tenant access | 404 from a scoped lookup |
| Payment failure | Recorded as `FAILED` payment + transaction, subscription marked `FAILED`, email sent |
| Duplicate webhook | 200, nothing written twice |
| Webhook processing failure | Transaction rolled back, 500 returned so Stripe retries |
| Invalid webhook signature | 400 before any handler runs |
| Network error | The client distinguishes "cannot reach the server" from an API error |
| Bad form input | 400 with per-field messages rendered inline under each input |

Every list in the UI goes through one `Table` component that owns its loading, error and empty
states, so no page reimplements them.

---

## Tests

```bash
cd backend && npm test
```

**46 tests, all passing.** They run against a real single-node replica set via
`mongodb-memory-server`; Stripe is mocked, so no network calls and no test-account writes.

| File | Covers |
| --- | --- |
| `auth.test.js` | Hashing, identical failure messages, expired/forged tokens, stale-role tokens, disabled users, suspended orgs, reset-token single use and expiry |
| `authorization.test.js` | Member blocked from billing/members/admin routes, org admin blocked from platform routes, cannot invite a `PLATFORM_ADMIN`, cannot orphan the last admin, platform admin blocked from tenant routes |
| `tenantIsolation.test.js` | Two live tenants; cross-tenant reads, role changes, deletions and invoice downloads all fail; an `organization` id in the body is ignored |
| `payment.test.js` | Nothing created before payment, login impossible until the webhook lands, unpaid sessions ignored, expiry + retry, **duplicate webhooks**, **replay under a new event id**, **rollback leaves nothing behind**, retry-after-failure succeeds, renewals, failed renewals |

---

## Security notes

- **No card data is stored or received.** Payment happens on Stripe's hosted checkout; card
  management uses Stripe's hosted billing portal. This application only ever sees Stripe
  identifiers.
- **Webhook authenticity is verified** with `stripe.webhooks.constructEvent` against the raw request
  body. The webhook route is mounted *before* `express.json()` precisely so the bytes are not
  re-serialised — a forged POST is rejected before any handler runs.
- **Payment is confirmed server-side only.** A frontend redirect changes nothing.
- **Secrets live in the environment**, are validated at boot, and are never committed.
- Passwords are bcrypt-hashed; reset and invite tokens are stored only as SHA-256 hashes.
- `helmet` for security headers, CORS restricted to `APP_URL`, JSON body capped at 100 kB.
- Zod strips unknown keys, so mass-assignment through a request body is not possible; `status`,
  `plan` and Stripe ids are not tenant-editable.

---

## How AI tools were used

I used Claude Code throughout, mainly to scaffold repetitive layers quickly — model definitions,
the Zod schemas, the React component kit and much of the test boilerplate — and as a reviewer to
argue through the design decisions that carry the most weight here: where the transaction boundary
belongs, how idempotency should be enforced, and whether tenancy should be a shared database or one
per tenant.

What I did not do is accept output unread. Two examples of that mattering:

- The unique index on `Payment.stripeInvoiceId` was originally written as `sparse: true`. It looks
  right and passes casual inspection, but a sparse index still indexes an explicit `null`, and the
  field defaults to `null` — so the second invoice-less payment would have thrown a duplicate-key
  error in production. The test suite surfaced it and I changed it to a partial index.
- The first draft of the webhook handler recorded the initial payment in both
  `checkout.session.completed` and `invoice.payment_succeeded`, which double-counts revenue
  depending on delivery order. The `subscription_create` skip exists to give that payment exactly
  one owner.

Every file in this repository is one I can walk through and modify.

---

## What is done, partial, and not done

**Done**

- All three panels with the pages listed in the brief
- Paid registration through Stripe Checkout, confirmed by webhook only
- Multi-tenant isolation enforced at the API layer, with tests
- Atomic payment fulfilment with rollback, and idempotent webhooks
- Auth, roles, password reset, invitations, rate limiting, validation
- Email notifications for all listed events
- Transaction history with status filtering, per-tenant and platform-wide
- 46 backend tests
- **Bonus:** PDF invoice generation, downloadable from the billing page

**Partial**

- **Transaction statuses.** `PENDING`, `SUCCESS` and `FAILED` are produced by real flows.
  `REFUNDED` and `ROLLED_BACK` are modelled, displayed and filterable, but no current code path
  writes them (see [Transactions and rollback](#transactions-and-rollback) for why a true rollback
  leaves no row).
- **Renewal reminders** run on a `setInterval` inside the API process rather than a real scheduler.

**Not done**

- **CI/CD pipeline** (bonus) — `npm test` and `npm run lint` both pass locally and would drop
  straight into a GitHub Actions workflow, but I did not add one.
- **Per-organization SMTP settings** (bonus) — all mail is sent from the shared platform sender.
- **Frontend tests** — testing effort went to the backend, where the isolation, payment and rollback
  rules that actually matter are enforced.

---

## Known limitations

1. **The seeded demo organization has no Stripe customer.** "Manage payment method" and plan changes
   return a clear error for it. Register a fresh organization through `/signup` to exercise those.
2. **A replica set is mandatory.** On a standalone `mongod` the payment flow fails outright rather
   than silently degrading — which is the honest failure mode, but it does mean Atlas or
   `mongod --replSet` is required.
3. **Email addresses are globally unique**, so one person cannot belong to two organizations. A
   compound `{ organization, email }` index plus an org selector at login would lift this.
4. **JWTs are stored in `localStorage`**, which is XSS-exposed. An httpOnly refresh-token cookie
   with short-lived access tokens would be the production answer; it was more moving parts than this
   assessment needed.
5. **Rate limiting is in-memory**, so it is per-instance. Behind more than one process it needs a
   shared store such as Redis.
6. **No refund flow.** Refunds issued in the Stripe dashboard are not reflected back into the
   payment history.
7. **Plan changes update our copy immediately and reconcile on the webhook.** If the Stripe update
   succeeds but our write fails, the two are briefly out of step until the next
   `customer.subscription.updated` event.
