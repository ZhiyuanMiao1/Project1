import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import registerRoute from './routes/register';
import loginRoute from './routes/login';
import accountRoute from './routes/account';
import mentorRoute from './routes/mentor';
import mentorsRoute from './routes/mentors';
import favoritesRoute from './routes/favorites';
import ossRoute from './routes/oss';
import requestsRoute from './routes/requests';
import attachmentsRoute from './routes/attachments';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use('/api/register', registerRoute);
app.use('/api/login', loginRoute);
app.use('/api/account', accountRoute);
app.use('/api/mentor', mentorRoute);
app.use('/api/mentors', mentorsRoute);
app.use('/api/favorites', favoritesRoute);
app.use('/api/oss', ossRoute);
app.use('/api/requests', requestsRoute);
app.use('/api/attachments', attachmentsRoute);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
