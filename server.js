import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser"; // Import this
import authRouter from "./routes/authRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 1. CORS Configuration (CRITICAL for Cookies)
app.use(cors({
    origin: "http://localhost:5173", // Your React Frontend URL
    credentials: true, // Allow cookies to be sent/received
}));

// 2. Middleware
app.use(express.json());
app.use(cookieParser()); // Parse cookies from requests

// 3. Routes
app.use("/api", authRouter);

app.get("/", (req, res) => {
    res.send("FixMyCampus Backend is running!");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});