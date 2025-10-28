import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import registerRoute from './routes/register';
import loginRoute from './routes/login';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use('/api/register', registerRoute);
app.use('/api/login', loginRoute);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;

