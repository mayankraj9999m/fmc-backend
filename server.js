import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser"; // MUST BE INSTALLED: npm install cookie-parser
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/AdminRoutes.js";
import chiefWardenRoutes from "./routes/ChiefWardenRoutes.js";
import wardenRoutes from "./routes/WardenRoutes.js";
import complaintRoutes from './routes/complaintRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';

const app = express();

// 1. CORS Configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true, // ABSOLUTELY REQUIRED for cookies to be sent/received
}));

// 2. Middlewares
app.use(express.json());
app.use(cookieParser()); // REQUIRED to parse req.cookies.token

// 3. Routes
app.use("/api/auth", authRoutes);
app.use('/api/announcements', announcementRoutes);
app.use("/api/admin/students", adminRoutes);
app.use("/api/admin/chief", chiefWardenRoutes);
app.use("/api/admin/warden", wardenRoutes);
app.use('/api/complaints', complaintRoutes);

if (process.env.NODE_ENV !== 'production') {
    app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));
}

export default app; 