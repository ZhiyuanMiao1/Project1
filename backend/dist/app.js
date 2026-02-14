"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const register_1 = __importDefault(require("./routes/register"));
const login_1 = __importDefault(require("./routes/login"));
const auth_1 = __importDefault(require("./routes/auth"));
const account_1 = __importDefault(require("./routes/account"));
const mentor_1 = __importDefault(require("./routes/mentor"));
const mentors_1 = __importDefault(require("./routes/mentors"));
const favorites_1 = __importDefault(require("./routes/favorites"));
const oss_1 = __importDefault(require("./routes/oss"));
const requests_1 = __importDefault(require("./routes/requests"));
const attachments_1 = __importDefault(require("./routes/attachments"));
const messages_1 = __importDefault(require("./routes/messages"));
const paypalApi_1 = __importDefault(require("./routes/paypalApi"));
const paypal_1 = __importDefault(require("./routes/paypal"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
const parseCorsOrigins = (value) => {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};
const corsAllowlist = new Set([
    ...parseCorsOrigins(process.env.CORS_ORIGIN),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (corsAllowlist.has(origin))
            return callback(null, true);
        try {
            const url = new URL(origin);
            if (url.protocol !== 'http:' && url.protocol !== 'https:')
                return callback(null, false);
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
                return callback(null, true);
        }
        catch { }
        return callback(null, false);
    },
    credentials: true,
}));
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.use('/api/register', register_1.default);
app.use('/api/login', login_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/account', account_1.default);
app.use('/api/mentor', mentor_1.default);
app.use('/api/mentors', mentors_1.default);
app.use('/api/favorites', favorites_1.default);
app.use('/api/oss', oss_1.default);
app.use('/api/requests', requests_1.default);
app.use('/api/attachments', attachments_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/paypal-api', paypalApi_1.default);
app.use('/api/paypal', paypal_1.default);
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
exports.default = app;
