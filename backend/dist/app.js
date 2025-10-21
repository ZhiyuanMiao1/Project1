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
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.use('/api/register', register_1.default);
app.use('/api/login', login_1.default);
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
exports.default = app;
