import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser"; // MUST BE INSTALLED: npm install cookie-parser
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/juniorAssistantRoutes.js";

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
app.use("/api", authRoutes);
app.use("/api", adminRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));