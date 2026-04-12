// new/routes/WardenRoutes.js
import express from "express";
import pool from "../db/db.js";
import bcrypt from "bcrypt";
import { verifyToken } from "../middleware/authMiddleware.js";
import { getWorkerComplaintsForWarden, getWorkerPerformance } from "../controllers/wardenController.js";

const router = express.Router();

// Middleware: Enforce Warden or Associate Warden access using req.user
const verifyWarden = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin authorization required." });
    }

    const { position, hostel_name } = req.user;

    if (position !== "Hostel Warden" && position !== "Associate Warden") {
        return res.status(403).json({ error: "Access denied. Warden authorization required." });
    }

    if (!hostel_name) {
        return res.status(403).json({ error: "No hostel assigned to your account." });
    }

    // Attach the hostel name to the request for subsequent routes to use
    req.wardenHostel = hostel_name;
    next();
};

router.use(verifyToken);
router.use(verifyWarden);

const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    let password = "";
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

// ==========================================
// 1. GET ALL WORKERS FOR WARDEN'S HOSTEL
// ==========================================
router.get("/workers", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, phone_no, gender, department, sub_work_category, current_rating, rating_count, created_at, last_login 
             FROM workers 
             WHERE hostel_name = $1 
             ORDER BY created_at DESC`,
            [req.wardenHostel],
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Fetch Workers Error:", error);
        res.status(500).json({ error: "Failed to fetch workers." });
    }
});

// ==========================================
// 2. CREATE NEW WORKER
// ==========================================
router.post("/workers", async (req, res) => {
    try {
        const { name, email, phone_no, gender, department, sub_work_category } = req.body;

        if (!name || !email || !department) {
            return res.status(400).json({ error: "Name, email, and department are required." });
        }

        const generatedPassword = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        const result = await pool.query(
            `INSERT INTO workers (name, email, password_hash, phone_no, gender, hostel_name, department, sub_work_category) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING id, name, email, department, sub_work_category`,
            [
                name,
                email,
                hashedPassword,
                phone_no || null,
                gender || null,
                req.wardenHostel,
                department,
                sub_work_category || null,
            ],
        );

        res.status(201).json({
            message: "Worker account created successfully.",
            worker: result.rows[0],
            generatedPassword: generatedPassword,
        });
    } catch (error) {
        console.error("Create Worker Error:", error);
        if (error.code === "23505") return res.status(400).json({ error: "Email already exists." });
        res.status(500).json({ error: "Failed to create worker account." });
    }
});

// ==========================================
// 3. UPDATE WORKER
// ==========================================
router.put("/workers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone_no, gender, department, sub_work_category, password } = req.body;

        // Ensure the worker belongs to the warden's hostel before updating
        const checkOwnership = await pool.query("SELECT id FROM workers WHERE id = $1 AND hostel_name = $2", [
            id,
            req.wardenHostel,
        ]);
        if (checkOwnership.rows.length === 0) {
            return res.status(404).json({ error: "Worker not found in your assigned hostel." });
        }

        let updateQuery =
            "UPDATE workers SET name = $1, email = $2, phone_no = $3, gender = $4, department = $5, sub_work_category = $6";
        let values = [name, email, phone_no || null, gender || null, department, sub_work_category || null];

        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += ", password_hash = $7 WHERE id = $8 RETURNING id, name, email, department";
            values.push(hashedPassword, id);
        } else {
            updateQuery += " WHERE id = $7 RETURNING id, name, email, department";
            values.push(id);
        }

        const result = await pool.query(updateQuery, values);
        res.status(200).json({ message: "Worker account updated successfully", worker: result.rows[0] });
    } catch (error) {
        console.error("Update Worker Error:", error);
        if (error.code === "23505") return res.status(400).json({ error: "Email already in use." });
        res.status(500).json({ error: "Failed to update worker account." });
    }
});

// ==========================================
// 4. DELETE WORKER
// ==========================================
router.delete("/workers/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Ensure the worker belongs to the warden's hostel before deleting
        const result = await pool.query("DELETE FROM workers WHERE id = $1 AND hostel_name = $2 RETURNING id", [
            id,
            req.wardenHostel,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Worker not found in your assigned hostel." });
        }

        res.status(200).json({ message: "Worker account deleted successfully." });
    } catch (error) {
        console.error("Delete Worker Error:", error);
        res.status(500).json({ error: "Failed to delete worker account." });
    }
});

router.get("/performance", getWorkerPerformance);
router.get("/workers/:id/complaints", getWorkerComplaintsForWarden);

export default router;
