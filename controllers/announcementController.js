import pool from "../db/db.js";

// ==========================================
// 1. CREATE ANNOUNCEMENT
// ==========================================
export const createAnnouncement = async (req, res) => {
    try {
        const { title, content, type } = req.body;
        const user = req.user;

        if (!title || !content || !type) {
            return res.status(400).json({ error: "Title, content, and type are required." });
        }

        let finalHostelName = null;

        // --- RBAC: Rules for Admins ---
        if (user.role === "admin") {
            if (user.position === "Chief Warden" || user.position === "Junior Assistant") {
                if (type !== "Common") {
                    return res.status(403).json({ error: "Chief Warden and Junior Assistant can only announce as 'Common' type." });
                }
                // finalHostelName remains null for Common
            } 
            else if (user.position === "Hostel Warden" || user.position === "Associate Warden") {
                if (!["Common", "Hostel", "Worker"].includes(type)) {
                    return res.status(400).json({ error: "Wardens can only announce as 'Common', 'Hostel', or 'Worker'." });
                }
                // If it's a specific hostel or worker announcement, bind it to the Warden's hostel
                if (type !== "Common") {
                    finalHostelName = user.hostel_name;
                }
            } else {
                return res.status(403).json({ error: "Unauthorized admin position." });
            }
        } 
        // --- RBAC: Rules for Workers ---
        else if (user.role === "worker") {
            if (type !== "Worker") {
                return res.status(403).json({ error: "Workers can only create 'Worker' type announcements." });
            }
            finalHostelName = user.hostel_name;
        } 
        // --- Deny Others (Students) ---
        else {
            return res.status(403).json({ error: "Only admins and workers can create announcements." });
        }

        // Insert into database
        const result = await pool.query(
            `INSERT INTO announcements (title, content, type, hostel_name, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, content, type, finalHostelName, user.id]
        );

        res.status(201).json({ message: "Announcement created successfully", announcement: result.rows[0] });
    } catch (error) {
        console.error("Error creating announcement:", error);
        if (error.code === '23503') {
            return res.status(400).json({ error: "Database constraint error. Ensure you dropped the fk_announcements_admin constraint to allow workers to announce."});
        }
        res.status(500).json({ error: "Server error while creating announcement." });
    }
};

// ==========================================
// 2. GET ANNOUNCEMENTS (Role-based fetch)
// ==========================================
export const getAnnouncements = async (req, res) => {
    try {
        const user = req.user;
        
        // Coalesce author name since it could be an Admin or a Worker now
        let query = `
            SELECT a.*, COALESCE(ad.name, w.name) as author_name 
            FROM announcements a
            LEFT JOIN admins ad ON a.created_by = ad.id
            LEFT JOIN workers w ON a.created_by = w.id
            WHERE 1=1
        `;
        const values = [];

        // --- Fetch Rules based on Identity ---
        if (user.role === "student") {
            // Students see Common, plus Hostel/Worker announcements for their specific hostel
            values.push(user.hostel_name);
            query += ` AND (a.type = 'Common' OR ((a.type = 'Hostel' OR a.type = 'Worker') AND a.hostel_name = $1))`;
        } 
        else if (user.role === "admin") {
            if (user.position === "Chief Warden" || user.position === "Junior Assistant") {
                // These admins see EVERYTHING (Common, all Hostels, all Workers)
                // No extra filtering needed.
            } 
            else if (user.position === "Hostel Warden" || user.position === "Associate Warden") {
                // See Common + anything scoped to their specific hostel
                values.push(user.hostel_name);
                query += ` AND (a.type = 'Common' OR a.hostel_name = $1)`;
            }
        } 
        else if (user.role === "worker") {
            // Workers see Common + anything scoped to their hostel
            values.push(user.hostel_name);
            query += ` AND (a.type = 'Common' OR a.hostel_name = $1)`;
        }

        query += " ORDER BY a.created_at DESC LIMIT 150";

        const result = await pool.query(query, values);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching announcements:", error);
        res.status(500).json({ error: "Server error while fetching announcements." });
    }
};