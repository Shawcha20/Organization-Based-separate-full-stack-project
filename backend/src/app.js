const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');
const { apiLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth.routes');
const checkoutRoutes = require('./routes/checkout.routes');
const planRoutes = require('./routes/plans.routes');
const platformRoutes = require('./routes/platform.routes');
const orgRoutes = require('./routes/org.routes');
const meRoutes = require('./routes/me.routes');
const webhookRoutes = require('./routes/webhook.routes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.APP_URL, credentials: true }));
if (!env.isTest) app.use(morgan('dev'));

// Mounted before express.json(): Stripe signatures are verified against the
// raw request body, so this route must not be parsed.
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '100kb' }));
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/admin', platformRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/me', meRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
