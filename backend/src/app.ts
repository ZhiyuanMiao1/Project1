import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import registerRoute from './routes/register';
import loginRoute from './routes/login';
import authRoute from './routes/auth';
import accountRoute from './routes/account';
import mentorRoute from './routes/mentor';
import mentorsRoute from './routes/mentors';
import favoritesRoute from './routes/favorites';
import ossRoute from './routes/oss';
import requestsRoute from './routes/requests';
import attachmentsRoute from './routes/attachments';
import messagesRoute from './routes/messages';
import paypalApiRoute from './routes/paypalApi';
import paypalRoute from './routes/paypal';

dotenv.config();

const app = express();

app.use(express.json());

const parseCorsOrigins = (value: any) => {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const corsAllowlist = new Set<string>([
  ...parseCorsOrigins(process.env.CORS_ORIGIN),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (corsAllowlist.has(origin)) return callback(null, true);

      try {
        const url = new URL(origin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return callback(null, false);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return callback(null, true);
      } catch {}

      return callback(null, false);
    },
    credentials: true,
  })
);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use('/api/register', registerRoute);
app.use('/api/login', loginRoute);
app.use('/api/auth', authRoute);
app.use('/api/account', accountRoute);
app.use('/api/mentor', mentorRoute);
app.use('/api/mentors', mentorsRoute);
app.use('/api/favorites', favoritesRoute);
app.use('/api/oss', ossRoute);
app.use('/api/requests', requestsRoute);
app.use('/api/attachments', attachmentsRoute);
app.use('/api/messages', messagesRoute);
app.use('/api/paypal-api', paypalApiRoute);
app.use('/api/paypal', paypalRoute);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
