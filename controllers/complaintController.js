import pool from "../db/db.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { GoogleGenAI } from "@google/genai";

// --- STUDENT CONTROLLERS ---
export const lodgeComplaint = async (req, res) => {
    const client = await pool.connect(); // Use a client for transaction safety
    try {
        const { department, sub_category, description, priority_score } =
            req.body;
        const student_id = req.user?.id;

        // 1. Strict Input Validation
        if (
            !department?.trim() ||
            !sub_category?.trim() ||
            !description?.trim()
        ) {
            return res.status(400).json({
                error: "Department, sub-category, and description are required.",
            });
        }

        const trimmedDesc = description.trim();
        if (trimmedDesc.split(/\s+/).length > 40) {
            return res
                .status(400)
                .json({ error: "Description must be 40 words or less." });
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
            const uploadResult = await uploadToCloudinary(
                req.file.buffer,
                "hostel_complaints",
            );
            complaint_image = uploadResult.secure_url;
        }

        // 4. Find the student's hostel
        const studentRes = await client.query(
            "SELECT hostel_name FROM students WHERE id = $1",
            [student_id],
        );
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

        const worker_id =
            workerRes.rows.length > 0 ? workerRes.rows[0].id : null;
        const status = worker_id ? "Worker assigned" : "Initiated";
        const assigned_at = worker_id ? new Date() : null;

        // 6. Save to Database
        const newComplaint = await client.query(
            `INSERT INTO complaints (
                student_id, department, sub_category, description, 
                complaint_image, worker_id, status, assigned_at, priority_score
             ) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
                student_id,
                department.trim(),
                sub_category.trim(),
                trimmedDesc,
                complaint_image,
                worker_id,
                status,
                assigned_at,
                priority_score || "Medium",
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

        res.status(500).json({
            error: "An unexpected error occurred while lodging the complaint.",
        });
    } finally {
        client.release();
    }
};

export const generateAIComplaintDetails = async (req, res) => {
    try {
        const { description } = req.body;

        if (!description?.trim()) {
            return res
                .status(400)
                .json({ error: "Description is required for AI processing." });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res
                .status(500)
                .json({
                    error: "Gemini API key is not configured on the server.",
                });
        }

        // Fetch valid departments and sub-categories from DB
        let categoryString = "";
        try {
            const deptRes = await pool.query(
                "SELECT department, sub_category FROM work_department",
            );
            const validCategories = deptRes.rows;

            if (validCategories.length === 0) {
                throw new Error("No work departments found in the database.");
            }

            // Format them for the prompt (e.g. "Electrical": ["Fan Repair", "Light Issue"])
            const categoryMap = {};
            validCategories.forEach((row) => {
                if (!categoryMap[row.department])
                    categoryMap[row.department] = [];
                categoryMap[row.department].push(row.sub_category);
            });
            categoryString = JSON.stringify(categoryMap, null, 2);
        } catch (dbErr) {
            console.warn(
                "Could not fetch categories from DB, using fallback:",
                dbErr.message,
            );
            // Fallback to constants if DB connection times out
            categoryString = JSON.stringify(
                {
                    Civil: ["Carpentry", "Plumbing", "Wall and roof"],
                    Electrical: ["Electrician", "Lift maintainer"],
                    "IT/Network": ["No signal incoming", "Software Problem"],
                    Sanitation: ["Room Cleaning"],
                },
                null,
                2,
            );
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const prompt = `
        You are an intelligent triage system for a university hostel maintenance app.
        Analyze the following student complaint description. If an image is provided, also analyze the image to better understand the issue.
        Categorize the issue and return a strict JSON object with the following fields:
        - "department": Must be one of the keys from the valid categories below.
        - "sub_category": Must be one of the strings from the array corresponding to the chosen department. Choose the most appropriate one based on the description and image.
        - "description": A properly formatted and grammatical version of the student's description, kept strictly under 40 words. Include key details visible in the image.
        - "priority_score": Predict the urgency as exactly "Low", "Medium", or "High". Emergency issues like severe water leakage or sparking wires should be High.

        VALID CATEGORIES (DO NOT INVENT NEW ONES):
        ${categoryString}

        Ensure the response is ONLY a valid JSON object without any markdown wrapping, code blocks, or additional text.

        Student Complaint:
        "${description}"
        `;

        const requestContents = [{ text: prompt }];

        if (req.file) {
            requestContents.push({
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype,
                },
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: requestContents,
        });

        const rawText = response.text;
        // Clean up possible markdown formatting from Gemini
        const jsonStr = rawText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let aiResult;
        try {
            aiResult = JSON.parse(jsonStr);
        } catch (e) {
            console.error("AI response was not valid JSON:", rawText);
            return res
                .status(500)
                .json({ error: "AI failed to generate a valid response." });
        }

        res.json(aiResult);
    } catch (err) {
        console.error("Error in generateAIComplaintDetails:", err);
        res.status(500).json({ error: "Failed to process AI triage." });
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
        const priority = req.query.priority || "";
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
                statusCondition += " AND c.is_escalated = true";
            } else {
                queryParams.push(status);
                statusCondition += ` AND c.status = $${queryParams.length}`;
            }
        }

        if (priority) {
            queryParams.push(priority);
            statusCondition += ` AND c.priority_score = $${queryParams.length}`;
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
            pagination: { totalRecords, totalPages, currentPage: page, limit },
        });
    } catch (err) {
        console.error("Error fetching student stats:", err);
        res.status(500).json({
            error: "Failed to fetch dashboard statistics.",
        });
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
        res.status(500).json({
            error: "An unexpected error occurred during escalation.",
        });
    }
};

export const provideFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, feedback } = req.body;
        const student_id = req.user?.id;

        if (!rating || rating < 1 || rating > 5) {
            return res
                .status(400)
                .json({ error: "Rating must be an integer between 1 and 5." });
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

        const complaint = updated.rows[0];

        // Recalculate and update the worker's average rating if assigned
        if (complaint.worker_id) {
            const statsResult = await pool.query(
                `SELECT ROUND(AVG(rating)::numeric, 1) as avg_rating, COUNT(rating) as rating_count 
                 FROM complaints 
                 WHERE worker_id = $1 AND rating IS NOT NULL`,
                [complaint.worker_id]
            );

            const { avg_rating, rating_count } = statsResult.rows[0];

            await pool.query(
                `UPDATE workers 
                 SET current_rating = $1, rating_count = $2 
                 WHERE id = $3`,
                [avg_rating || 0, rating_count || 0, complaint.worker_id]
            );
        }

        res.json(complaint);
    } catch (err) {
        console.error("Error submitting feedback:", err);
        res.status(500).json({
            error: "An unexpected error occurred while submitting feedback.",
        });
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
        const priority = req.query.priority || "";
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
                statusCondition += " AND c.is_escalated = true";
            } else {
                queryParams.push(status);
                statusCondition += ` AND c.status = $${queryParams.length}`;
            }
        }

        if (priority) {
            queryParams.push(priority);
            statusCondition += ` AND c.priority_score = $${queryParams.length}`;
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
            pagination: { totalRecords, totalPages, currentPage: page, limit },
        });
    } catch (err) {
        console.error("Error fetching worker stats:", err);
        res.status(500).json({
            error: "Failed to fetch dashboard statistics.",
        });
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
            const uploadResult = await uploadToCloudinary(
                req.file.buffer,
                "resolved_complaints",
            );
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
        res.status(500).json({
            error: "An unexpected error occurred while resolving the complaint.",
        });
    }
};

export const summarizeWorkerComplaints = async (req, res) => {
    try {
        const worker_id = req.user?.id;
        
        // Fetch worker's active/unresolved complaints
        const complaintsResult = await pool.query(
            `SELECT complaint_no, department, sub_category, description, priority_score, status, lodged_at
             FROM complaints
             WHERE worker_id = $1 AND status != 'Resolved'
             ORDER BY priority_score DESC, lodged_at ASC`,
            [worker_id]
        );

        if (complaintsResult.rowCount === 0) {
            return res.json({ summary: "You currently have no active assigned tasks. Great job!" });
        }

        const complaintsData = JSON.stringify(complaintsResult.rows);

        const prompt = `
        You are an AI assistant for a campus maintenance system. Summarize the following active tasks for a maintenance worker.
        Format your response in Markdown.
        Highlight high-priority tasks, group similar tasks if applicable, and provide a concise, encouraging, and actionable summary of their current workload under 100 words.
        
        Tasks Data:
        ${complaintsData}
        `;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        res.json({ summary: response.text });
    } catch (err) {
        console.error("Error summarizing worker complaints:", err);
        res.status(500).json({ error: "Failed to generate summary." });
    }
};
