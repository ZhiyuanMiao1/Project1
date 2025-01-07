const express = require('express');
const app = express();
const registerRoute = require('./routes/register');
const loginRoute = require('./routes/login');

app.use(express.json());
app.use('/api/register', registerRoute);
app.use('/api/login', loginRoute);

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
