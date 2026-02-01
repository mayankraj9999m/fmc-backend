import express from "express";
import axios from "axios"; // Changed: Use Axios to fetch user info
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/db.js";
import { verifyToken, verifyAdmin, verifyMasterKey } from "../middleware/authMiddleware.js";

const router = express.Router();

const generateTokenAndSetCookie = (res, user, role) => {
    const token = jwt.sign(
        { 
            id: user.google_id || user.id, 
            email: user.email, 
            role: role,
            hostel_name: user.hostel_name
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, 
    });
};

// ==========================================
// 1. STUDENT AUTHENTICATION (Google) DONE
// ==========================================
router.post("/auth/google", async (req, res) => {
    const { token } = req.body;

    try {
        // [MODIFIED] Fetch user info from Google using the Access Token
        const googleResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const { sub: google_id, email, name, picture } = googleResponse.data;

        if (!email.endsWith("@nitdelhi.ac.in")) {
            return res.status(403).json({ error: "Access restricted to @nitdelhi.ac.in emails only." });
        }

        const userCheck = await pool.query("SELECT * FROM students WHERE google_id = $1", [google_id]);
        let user;
        let needsOnboarding = false;

        if (userCheck.rows.length === 0) {
            const newUser = await pool.query(
                `INSERT INTO students (google_id, name, email, profile_picture) VALUES ($1, $2, $3, $4) RETURNING *`,
                [google_id, name, email, picture]
            );
            user = newUser.rows[0];
            needsOnboarding = true;
        } else {
            // Existing student
            user = userCheck.rows[0];
            needsOnboarding = !user.hostel_name;
        }

        // 3. Generate Session
        generateTokenAndSetCookie(res, user, "student");

        res.status(200).json({ user, needsOnboarding, role: "student", message: "Login successful" });
    } catch (error) {
        console.error("Auth Error:", error.message);
        res.status(500).json({ error: "Authentication failed. Invalid Google Token." });
    }
});

// ==========================================
// 2. WORKER & ADMIN LOGIN (Email/Password + ROLE)
// ==========================================
router.post("/auth/login", async (req, res) => {
    // 1. Get Role from request body
    const { email, password, role } = req.body; 

    if (!role || !['admin', 'worker'].includes(role)) {
        return res.status(400).json({ error: "Invalid role specified." });
    }

    try {
        let user;
        
        // 2. Query Specific Table based on Role
        if (role === 'admin') {
            const adminCheck = await pool.query("SELECT * FROM admins WHERE email = $1", [email]);
            if (adminCheck.rows.length === 0) return res.status(401).json({ error: "Admin account not found." });
            user = adminCheck.rows[0];
        } 
        else if (role === 'worker') {
            const workerCheck = await pool.query("SELECT * FROM workers WHERE email = $1", [email]);
            if (workerCheck.rows.length === 0) return res.status(401).json({ error: "Worker account not found." });
            user = workerCheck.rows[0];
        }

        // 3. Verify Password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid password." });
        }

        // 4. Generate Token & Cookie
        generateTokenAndSetCookie(res, user, role);

        return res.json({ user, role, message: "Login successful" });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});

// ==========================================
// 3. SECURE REGISTRATION ROUTES
// ==========================================

/**
 * [PROTECTED] Create New Admin
 * Requirement: Must provide valid MASTER_ADMIN_KEY in body.
 */
router.post("/admin/create", verifyMasterKey, async (req, res) => {
    const { name, phone, hostel_name, position, email, photo, password } = req.body;

    try {
        // Check if email already exists
        const check = await pool.query("SELECT * FROM admins WHERE email = $1", [email]);
        if (check.rows.length > 0) return res.status(400).json({ error: "Admin already exists" });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const newAdmin = await pool.query(
            `INSERT INTO admins (name, phone, hostel_name, position, email, photo, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, phone, hostel_name, position, email, photo, hash]
        );

        res.status(201).json({ 
            message: "Admin created successfully", 
        });

    } catch (error) {
        console.error("Create Admin Error:", error);
        res.status(500).json({ error: "Failed to create admin" });
    }
});

/**
 * [PROTECTED] Add Worker
 * Requirement: Must be logged in as ADMIN.
 * Constraint: Admin can only add workers to THEIR OWN hostel.
 */
router.post("/admin/add-worker", verifyToken, verifyAdmin, async (req, res) => {
    // req.user is populated by verifyToken middleware
    const requestingAdminHostel = req.user.hostel_name; 

    const { name, phone_no, hostel_name, department, sub_work_category, email, photo, password } = req.body;

    try {
        // STRICT CHECK: Ensure Admin isn't creating workers for other hostels
        if (requestingAdminHostel && requestingAdminHostel !== hostel_name) {
             return res.status(403).json({ 
                 error: `Unauthorized. You can only add workers to ${requestingAdminHostel}` 
             });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const newWorker = await pool.query(
            `INSERT INTO workers (name, phone_no, hostel_name, department, sub_work_category, email, photo, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [name, phone_no, hostel_name, department, sub_work_category, email, photo, hash]
        );

        res.status(201).json({ 
            message: "Worker added successfully", 
            worker: { ...newWorker.rows[0], password_hash: undefined }
        });

    } catch (error) {
        console.error("Add Worker Error:", error);
        res.status(500).json({ error: "Failed to add worker" });
    }
});

// ==========================================
// 4. PROFILE ROUTE (Secure & Role-Aware)
// ==========================================
router.get("/profile", verifyToken, async (req, res) => {
    try {
        const { id, role } = req.user; // Decoded from JWT
        let userQuery;
        let queryParams = [id];

        // Explicitly select columns to EXCLUDE password_hash
        if (role === "student") {
            // Students (Google Auth) - No password to hide, but good practice
            userQuery = `
                SELECT google_id, name, email, profile_picture, hostel_name, 
                       room_no, floor_no, phone_number, is_onboarded, created_at 
                FROM students WHERE google_id = $1`;

        } else if (role === "admin") {
            // Admins - Exclude password_hash
            userQuery = `
                SELECT id, name, email, phone, hostel_name, position, 
                       photo, created_at 
                FROM admins WHERE id = $1`;

        } else if (role === "worker") {
            // Workers - Exclude password_hash
            userQuery = `
                SELECT id, name, email, phone_no, hostel_name, department, 
                       sub_work_category, photo, current_rating, rating_count, created_at 
                FROM workers WHERE id = $1`;
        } else {
            return res.status(400).json({ error: "Invalid role" });
        }

        const result = await pool.query(userQuery, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = result.rows[0];
        res.json({ user, role });

    } catch (error) {
        console.error("Profile Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// Logout Route
router.post("/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
});

export default router;