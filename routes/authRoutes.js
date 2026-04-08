import express from "express";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/db.js"; // Your Neon DB connection
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.FRONTEND_URL}/auth/callback`,
);

// Helper function to generate JWT and attach it to an HTTP-Only Cookie
const generateTokenAndSetCookie = (res, user, role) => {
    const payload = {
        id: user.id || user.google_id, // Works for both UUID and Google ID
        email: user.email,
        role: role,
        hostel_name: user.hostel_name || null,
        position: user.position || null,
        requires_password_change: user.requires_password_change || false,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
        httpOnly: true, // Prevents JavaScript (XSS) from reading the cookie
        secure: process.env.NODE_ENV === "production", // HTTPS only in production
        sameSite: "lax", // Protects against Cross-Site Request Forgery (CSRF)
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });
};

router.use(verifyToken);

// ==========================================
// 1. STUDENT LOGIN (Google OAuth)
// ==========================================
router.post("/google", async (req, res) => {
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: "Authorization code missing." });
    if (req.user) return res.status(200).json({ message: "Already logged in" });

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        const ticket = await oAuth2Client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const { sub: google_id, email, name, picture } = ticket.getPayload();

        if (!email.endsWith("@nitdelhi.ac.in")) {
            return res.status(403).json({ error: "Access restricted to institutional emails." });
        }

        // Check if student exists (usually created by JA)
        let userResult = await pool.query("SELECT * FROM students WHERE email = $1", [email]);

        let user;

        if (userResult.rows.length === 0) {
            res.status(403).json({ error: "You have not been alloted a hostel yet. Contact Hostel Administration" });
            // Register new student if they don't exist
            // userResult = await pool.query(
            //     `INSERT INTO students (google_id, name, email, profile_picture, is_onboarded) VALUES ($1, $2, $3, $4, true) RETURNING *`,
            //     [google_id, name, email, picture],
            // );
        } else {
            user = userResult.rows[0];
            // COALESCE ensures we ONLY update google_id and picture if they are currently NULL.
            // last_login is updated EVERY time.
            userResult = await pool.query(
                `UPDATE students 
                 SET google_id = COALESCE(google_id, $1), 
                     profile_picture = $2, 
                     last_login = CURRENT_TIMESTAMP 
                 WHERE id = $3 
                 RETURNING *`,
                [google_id, picture, user.id],
            );
        }

        user = userResult.rows[0];

        generateTokenAndSetCookie(res, user, "student");

        res.status(200).json({ user, role: "student" });
    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(500).json({ error: "Authentication failed." });
    }
});

router.put("/student/onboard", verifyToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== "student") {
            return res.status(403).json({ error: "Access denied." });
        }

        // Just update the flag so they aren't prompted next time
        const result = await pool.query("UPDATE students SET is_onboarded = true WHERE id = $1 RETURNING *", [
            req.user.id,
        ]);

        res.status(200).json({ message: "Onboarding skipped.", user: result.rows[0] });
    } catch (error) {
        console.error("Skip Onboarding Error:", error);
        res.status(500).json({ error: "Failed to update onboarding status." });
    }
});

// ==========================================
// UPDATE STUDENT PROFILE
// ==========================================
router.put("/student/profile", verifyToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== "student") {
            return res.status(403).json({ error: "Access denied. Students only." });
        }

        const { id } = req.user;
        const { phone_no, branch, year_of_joining, programme, gender } = req.body;

        // Ensure we are updating based on the logged-in user's ID
        // Note: is_onboarded should already be true from the Google Login update
        const updateQuery = `
            UPDATE students 
            SET phone_no = $1, branch = $2, year_of_joining = $3, programme = $4, gender = $5
            WHERE id::text = $6 OR google_id = $6
            RETURNING *
        `;

        const values = [
            phone_no || null,
            branch || null,
            year_of_joining ? parseInt(year_of_joining) : null,
            programme || null,
            gender || null,
            id,
        ];

        const result = await pool.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Student not found." });
        }

        res.status(200).json({ message: "Profile updated successfully.", user: result.rows[0] });
    } catch (error) {
        console.error("Profile Update Error:", error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

// ==========================================
// STAFF & ADMIN LOGIN (Email & Password)
// ==========================================
router.post("/login", async (req, res) => {
    const { email, password, role } = req.body;

    // 1. Validate inputs
    if (!email || !password || !role) {
        return res.status(400).json({ error: "Email, password, and role are required." });
    }

    // Ensure role is either 'admin' or 'worker' (matches our frontend tabs)
    if (!["admin", "worker"].includes(role)) {
        return res.status(400).json({ error: "Invalid role specified." });
    }

    try {
        let user;
        let query;

        // 2. Fetch user from the correct table based on their role
        if (role === "admin") {
            query = await pool.query("SELECT * FROM admins WHERE email = $1", [email]);
        } else if (role === "worker") {
            query = await pool.query("SELECT * FROM workers WHERE email = $1", [email]);
        }

        // If no email matches in the database
        if (query.rows.length === 0) {
            return res.status(401).json({ error: `No ${role} account found with that email.` });
        }

        user = query.rows[0];

        // 3. Verify Password using Bcrypt
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid password." });
        }

        // 4. Update the last_login timestamp in Neon DB
        const tableName = role === "admin" ? "admins" : "workers";
        await pool.query(`UPDATE ${tableName} SET last_login = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);

        // 5. Generate Session Token & Set HTTP-Only Cookie
        generateTokenAndSetCookie(res, user, role);

        // 6. Security: Strip the password hash before sending the user object to React
        delete user.password_hash;

        return res.status(200).json({ user, role, message: "Login successful" });
    } catch (error) {
        console.error("Staff Login Error:", error);
        res.status(500).json({ error: "Server error during login." });
    }
});

// ==========================================
// 3. GET CURRENT SESSION (Auto-Login via Cookie)
// ==========================================
router.get("/profile", async (req, res) => {
    // Because verifyToken passed, we know req.user has the valid decoded JWT data
    try {
        if (!req.user)
            return res.status(401).json({
                error: "Please login first.",
            });
        const { id, role } = req.user;
        let queryStr;

        if (role === "student") {
            queryStr = "SELECT * FROM students WHERE google_id = $1 OR id::text = $1";
        } else if (role === "admin") {
            queryStr =
                "SELECT id, name, email, phone_no, photo, position, hostel_name, requires_password_change, last_login, created_at FROM admins WHERE id = $1";
        } else if (role === "worker") {
            queryStr =
                "SELECT id, name, email, phone_no, gender, photo, hostel_name, department, sub_work_category, current_rating, rating_count, last_login, created_at FROM workers WHERE id = $1";
        }

        const result = await pool.query(queryStr, [id]);

        if (result.rows.length === 0) {
            res.clearCookie("token");
            return res.status(404).json({ error: "User no longer exists." });
        }

        res.status(200).json({ user: result.rows[0], role, message: "Profile Data Fetched Successfully" });
    } catch (error) {
        console.error("Profile Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch session." });
    }
});

// ==========================================
// 4. LOGOUT
// ==========================================
router.post("/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
    });
    res.status(200).json({ message: "Logged out successfully" });
});

// ==========================================
// UPDATE ADMIN PASSWORD
// ==========================================
router.put("/admin/profile/password", async (req, res) => {
    try {
        if (!req.user || req.user.role !== "admin") {
            return res.status(403).json({ error: "Access denied." });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Invalid password format." });
        }

        // Fetch current admin
        const adminResult = await pool.query("SELECT * FROM admins WHERE id = $1", [req.user.id]);
        if (adminResult.rows.length === 0) return res.status(404).json({ error: "Admin not found." });
        const admin = adminResult.rows[0];

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: "Incorrect current password." });
        }

        // Hash new password and clear the requires_password_change flag
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE admins SET password_hash = $1, requires_password_change = false WHERE id = $2", [
            hashedNewPassword,
            req.user.id,
        ]);

        // Regenerate the cookie so the frontend knows the flag is now false
        admin.requires_password_change = false;
        generateTokenAndSetCookie(res, admin, "admin");

        res.status(200).json({ message: "Password updated successfully." });
    } catch (error) {
        console.error("Password Update Error:", error);
        res.status(500).json({ error: "Failed to update password." });
    }
});

export default router;
