import pool from "../db/db.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// --- STUDENT CONTROLLERS ---
export const lodgeComplaint = async (req, res) => {
    const client = await pool.connect(); // Use a client for transaction safety
    try {
        const { department, sub_category, description } = req.body;
        const student_id = req.user?.id;

        // 1. Strict Input Validation
        if (!department?.trim() || !sub_category?.trim() || !description?.trim()) {
            return res.status(400).json({ error: "Department, sub-category, and description are required." });
        }

        const trimmedDesc = description.trim();
        if (trimmedDesc.split(/\s+/).length > 40) {
            return res.status(400).json({ error: "Description must be 40 words or less." });
        }

        await client.query("BEGIN");

        // 2. Prevent Duplicate Active Complaints
        // Check if the user already has a pending complaint in this exact department & sub-category
        const existingComplaintRes = await client.query(
            `SELECT id FROM complaints 
             WHERE student_id = $1 
               AND department = $2 
               AND sub_category = $3 
               AND status != 'Resolved' 
             LIMIT 1`,
            [student_id, department.trim(), sub_category.trim()],
        );

        if (existingComplaintRes.rows.length > 0) {
            await client.query("ROLLBACK"); // Abort transaction
            return res.status(400).json({
                error: "You already have an active complaint in this department and sub-category. Please wait for it to be resolved before lodging a new one.",
            });
        }

        // 3. Handle Cloudinary Upload (Only happens if the user passes the duplicate check)
        let complaint_image = null;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer, "hostel_complaints");
            complaint_image = uploadResult.secure_url;
        }

        // 4. Find the student's hostel
        const studentRes = await client.query("SELECT hostel_name FROM students WHERE id = $1", [student_id]);
        const hostel_name = studentRes.rows[0]?.hostel_name;

        // 5. Find the best worker candidate (Equal Assignment Logic)
        const workerRes = await client.query(
            `SELECT w.id, COUNT(c.id) as pending_count
             FROM workers w
             LEFT JOIN complaints c ON w.id = c.worker_id AND c.status != 'Resolved'
             WHERE w.hostel_name = $1 
               AND w.department = $2
               AND w.sub_work_category = $3
             GROUP BY w.id
             ORDER BY pending_count ASC
             LIMIT 1`,
            [hostel_name, department.trim(), sub_category.trim()],
        );

        const worker_id = workerRes.rows.length > 0 ? workerRes.rows[0].id : null;
        const status = worker_id ? "Worker assigned" : "Initiated";
        const assigned_at = worker_id ? new Date() : null;

        // 6. Save to Database
        const newComplaint = await client.query(
            `INSERT INTO complaints (
                student_id, department, sub_category, description, 
                complaint_image, worker_id, status, assigned_at
             ) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                student_id,
                department.trim(),
                sub_category.trim(),
                trimmedDesc,
                complaint_image,
                worker_id,
                status,
                assigned_at,
            ],
        );

        await client.query("COMMIT");
        res.status(201).json(newComplaint.rows[0]);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error lodging complaint:", err);

        if (err.code === "23503") {
            return res.status(400).json({
                error: "Invalid department or sub-category. Please select from the available options.",
            });
        }

        res.status(500).json({ error: "An unexpected error occurred while lodging the complaint." });
    } finally {
        client.release();
    }
};

export const getStudentDashboardStats = async (req, res) => {
    try {
        const student_id = req.user?.id;
        if (!student_id) return res.status(401).json({ error: "Unauthorized" });

        // Pagination & Filter params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status || "";
        const offset = (page - 1) * limit;

        // Fetch stats
        const stats = await pool.query(
            `SELECT 
                COUNT(*) FILTER (WHERE status = 'Initiated' OR status = 'Worker assigned') AS initiated,
                COUNT(*) FILTER (WHERE status = 'Resolved') AS resolved,
                COUNT(*) FILTER (WHERE is_escalated = true) AS escalated
            FROM complaints WHERE student_id = $1`,
            [student_id],
        );

        // Build dynamic history query
        let queryParams = [student_id];
        let statusCondition = "";

        if (status) {
            if (status === "Escalated") {
                statusCondition = " AND c.is_escalated = true";
            } else {
                statusCondition = " AND c.status = $2";
                queryParams.push(status);
            }
        }

        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) FROM complaints c WHERE c.student_id = $1 ${statusCondition}`;
        const totalCountRes = await pool.query(countQuery, queryParams);
        const totalRecords = parseInt(totalCountRes.rows[0].count);
        const totalPages = Math.ceil(totalRecords / limit);

        // Fetch paginated history
        const paginationParams = [...queryParams, limit, offset];
        const history = await pool.query(
            `SELECT c.*, w.name AS worker_name, w.phone_no AS worker_phone 
             FROM complaints c
             LEFT JOIN workers w ON c.worker_id = w.id
             WHERE c.student_id = $1 ${statusCondition}
             ORDER BY c.lodged_at DESC
             LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
            paginationParams,
        );

        res.json({
            stats: stats.rows[0] || { initiated: 0, resolved: 0, escalated: 0 },
            history: history.rows,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });
    } catch (err) {
        console.error("Error fetching student stats:", err);
        res.status(500).json({ error: "Failed to fetch dashboard statistics." });
    }
};

export const escalateComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const student_id = req.user?.id;

        // Security: We MUST check student_id = $2 to prevent users from escalating others' complaints.
        // We also check that it isn't already resolved or already escalated.
        const updated = await pool.query(
            `UPDATE complaints 
             SET is_escalated = true 
             WHERE id = $1 
               AND student_id = $2 
               AND status != 'Resolved' 
               AND is_escalated = false
               AND lodged_at <= NOW() - INTERVAL '3 days'
             RETURNING *`,
            [id, student_id],
        );

        // If rowCount is 0, it means the complaint doesn't exist, belongs to someone else, or is ineligible for escalation.
        if (updated.rowCount === 0) {
            return res.status(400).json({
                error: "Cannot escalate. Ensure the complaint exists, is not resolved, is not already escalated, and was lodged at least 3 days ago.",
            });
        }

        res.json(updated.rows[0]);
    } catch (err) {
        console.error("Error escalating complaint:", err);
        res.status(500).json({ error: "An unexpected error occurred during escalation." });
    }
};

export const provideFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, feedback } = req.body;
        const student_id = req.user?.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be an integer between 1 and 5." });
        }

        const updated = await pool.query(
            `UPDATE complaints 
             SET rating = $1, feedback = $2 
             WHERE id = $3 AND student_id = $4 AND status = 'Resolved' AND rating IS NULL
             RETURNING *`,
            [rating, feedback, id, student_id],
        );

        if (updated.rowCount === 0) {
            return res.status(400).json({
                error: "Cannot submit feedback. The complaint may not be resolved, or feedback was already provided.",
            });
        }

        res.json(updated.rows[0]);
    } catch (err) {
        console.error("Error submitting feedback:", err);
        res.status(500).json({ error: "An unexpected error occurred while submitting feedback." });
    }
};

// --- WORKER CONTROLLERS ---

export const getWorkerDashboardStats = async (req, res) => {
    try {
        const worker_id = req.user?.id;
        if (!worker_id) return res.status(401).json({ error: "Unauthorized" });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status || "";
        const offset = (page - 1) * limit;

        const stats = await pool.query(
            `SELECT 
                COUNT(*) FILTER (WHERE status = 'Worker assigned' AND is_escalated = false) AS pending,
                COUNT(*) FILTER (WHERE status = 'Resolved') AS resolved,
                COUNT(*) FILTER (WHERE status = 'Worker assigned' AND is_escalated = true) AS defaulted
            FROM complaints WHERE worker_id = $1`,
            [worker_id],
        );

        let queryParams = [worker_id];
        let statusCondition = "";

        if (status) {
            if (status === "Escalated") {
                statusCondition = " AND c.is_escalated = true";
            } else {
                statusCondition = " AND c.status = $2";
                queryParams.push(status);
            }
        }

        const countQuery = `SELECT COUNT(*) FROM complaints c WHERE c.worker_id = $1 ${statusCondition}`;
        const totalCountRes = await pool.query(countQuery, queryParams);
        const totalRecords = parseInt(totalCountRes.rows[0].count);
        const totalPages = Math.ceil(totalRecords / limit);

        const paginationParams = [...queryParams, limit, offset];
        const assigned = await pool.query(
            `SELECT c.*, s.name AS student_name, s.hostel_name, s.room_no, s.phone_no AS student_phone
             FROM complaints c
             LEFT JOIN students s ON c.student_id = s.id
             WHERE c.worker_id = $1 ${statusCondition}
             ORDER BY c.assigned_at DESC
             LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
            paginationParams,
        );

        res.json({
            stats: stats.rows[0] || { pending: 0, resolved: 0, defaulted: 0 },
            history: assigned.rows,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });
    } catch (err) {
        console.error("Error fetching worker stats:", err);
        res.status(500).json({ error: "Failed to fetch dashboard statistics." });
    }
};

export const resolveComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const worker_id = req.user?.id;
        const { resolution_message } = req.body; // NEW: Get the message

        // 1. Handle Cloudinary Upload via Memory Stream for resolution proof
        let resolved_image = null;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer, "resolved_complaints");
            resolved_image = uploadResult.secure_url;
        }

        // 2. Security: Atomic update. Includes resolution_message.
        const updated = await pool.query(
            `UPDATE complaints 
             SET status = 'Resolved', 
                 resolved_image = $1, 
                 resolution_message = $2,
                 resolved_at = CURRENT_TIMESTAMP 
             WHERE id = $3 
               AND worker_id = $4 
               AND is_escalated = false 
               AND status != 'Resolved'
             RETURNING *`,
            [resolved_image, resolution_message || null, id, worker_id],
        );

        if (updated.rowCount === 0) {
            return res.status(400).json({
                error: "Cannot resolve. The complaint may be escalated, already resolved, assigned to someone else, or does not exist.",
            });
        }

        res.json(updated.rows[0]);
    } catch (err) {
        console.error("Error resolving complaint:", err);
        res.status(500).json({ error: "An unexpected error occurred while resolving the complaint." });
    }
};
