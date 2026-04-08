// new/routes/chiefWardenRoutes.js
import express from "express";
import pool from "../db/db.js";
import bcrypt from "bcrypt";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Middleware: Strictly enforce Chief Warden access
const verifyChiefWarden = (req, res, next) => {    
    if (!req.user || req.user.role != "admin" || req.user.position != "Chief Warden") {
        return res.status(403).json({ error: "Access denied. Chief Warden authorization required." });
    }
    next();
};

// Apply authentication middleware to all routes below
router.use(verifyToken);
router.use(verifyChiefWarden);

// Helper function to generate a random secure password
const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    let password = "";
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

// ==========================================
// 1. GET ALL WARDENS / ADMINS
// ==========================================
router.get("/wardens", async (req, res) => {
    try {
        // Fetch everyone except other Chief Wardens
        const result = await pool.query(
            `SELECT id, name, email, phone_no, position, hostel_name, created_at, last_login 
             FROM admins 
             WHERE position IN ('Hostel Warden', 'Associate Warden', 'Junior Assistant') 
             ORDER BY created_at DESC`,
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Fetch Wardens Error:", error);
        res.status(500).json({ error: "Failed to fetch admin accounts." });
    }
});

// ==========================================
// 2. CREATE NEW WARDEN / ADMIN
// ==========================================
router.post("wardens", async (req, res) => {
    try {
        const { name, email, phone_no, position, hostel_name } = req.body;

        if (!name || !email || !position) {
            return res.status(400).json({ error: "Name, email, and position are required." });
        }

        if (!hostel_name && position != "Junior Assistant") {
            return res.status(400).json({ error: "Wardens and associate wardens should have their hostel assigned" });
        }

        // Auto-generate password
        const generatedPassword = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        const result = await pool.query(
            `INSERT INTO admins (name, email, password_hash, phone_no, position, hostel_name, requires_password_change) 
             VALUES ($1, $2, $3, $4, $5, $6, true) 
             RETURNING id, name, email, position, hostel_name`,
            [name, email, hashedPassword, phone_no || null, position, hostel_name || null],
        );

        // Return the plaintext password so the Chief Warden can share it
        res.status(201).json({
            message: "Account created successfully.",
            admin: result.rows[0],
            generatedPassword: generatedPassword,
        });
    } catch (error) {
        console.error("Create Warden Error:", error);
        if (error.code === "23505") return res.status(400).json({ error: "Email already exists." });
        res.status(500).json({ error: "Failed to create account." });
    }
});

// ==========================================
// 3. UPDATE WARDEN / ADMIN
// ==========================================
router.put("wardens/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone_no, position, hostel_name, password } = req.body;
        if (!hostel_name && position != "Junior Assistant") {
            return res.status(400).json({ error: "Wardens and associate wardens should have their hostel assigned" });
        }

        let updateQuery = "UPDATE admins SET name = $1, email = $2, phone_no = $3, position = $4, hostel_name = $5";
        let values = [name, email, phone_no || null, position, hostel_name || null];

        // If Chief Warden provided a new password, update it too
        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += ", password_hash = $6 WHERE id = $7 RETURNING id, name, email, position, hostel_name";
            values.push(hashedPassword, id);
        } else {
            updateQuery += " WHERE id = $6 RETURNING id, name, email, position, hostel_name";
            values.push(id);
        }

        const result = await pool.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Account not found." });
        }

        res.status(200).json({ message: "Account updated successfully", admin: result.rows[0] });
    } catch (error) {
        console.error("Update Warden Error:", error);
        if (error.code === "23505") return res.status(400).json({ error: "Email already in use." });
        res.status(500).json({ error: "Failed to update account." });
    }
});

// ==========================================
// 4. DELETE WARDEN / ADMIN
// ==========================================
router.delete("wardens/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM admins WHERE id = $1 RETURNING id", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Account not found." });
        }

        res.status(200).json({ message: "Account deleted successfully." });
    } catch (error) {
        console.error("Delete Warden Error:", error);
        res.status(500).json({ error: "Failed to delete account." });
    }
});

export default router;
