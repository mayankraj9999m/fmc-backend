import pool from "../db/db.js";

export const getWorkerPerformance = async (req, res) => {
    try {
        // Assuming the warden's hostel is stored in the token payload
        const hostel_name = req.user?.hostel_name;
        if (!hostel_name) return res.status(403).json({ error: "Warden hostel context missing." });

        const department = req.query.department || "";

        let queryParams = [hostel_name];
        let deptCondition = "";

        if (department) {
            deptCondition = " AND w.department = $2";
            queryParams.push(department);
        }

        // Query to get workers and count their assigned complaints based on status
        const query = `
            SELECT 
                w.id, w.name, w.department, w.sub_work_category, w.current_rating, w.rating_count,
                COUNT(c.id) FILTER (WHERE c.status = 'Resolved') AS resolved_count,
                COUNT(c.id) FILTER (WHERE c.is_escalated = true AND c.status != 'Resolved') AS defaulted_count,
                COUNT(c.id) FILTER (WHERE c.status = 'Worker assigned' AND c.is_escalated = false) AS pending_count
            FROM workers w
            LEFT JOIN complaints c ON w.id = c.worker_id
            WHERE w.hostel_name = $1 ${deptCondition}
            GROUP BY w.id
            ORDER BY resolved_count DESC, defaulted_count ASC
        `;

        const result = await pool.query(query, queryParams);

        // Aggregate overall stats for the cards
        let totalResolved = 0;
        let totalDefaulted = 0;
        let totalPending = 0;

        result.rows.forEach((row) => {
            totalResolved += parseInt(row.resolved_count || 0);
            totalDefaulted += parseInt(row.defaulted_count || 0);
            totalPending += parseInt(row.pending_count || 0);
        });

        res.json({
            stats: { totalResolved, totalDefaulted, totalPending },
            workers: result.rows,
        });
    } catch (err) {
        console.error("Error fetching worker performance:", err);
        res.status(500).json({ error: "Failed to fetch performance stats." });
    }
};

export const getWorkerComplaintsForWarden = async (req, res) => {
    try {
        const { id } = req.params; // worker ID
        const warden_hostel = req.user?.hostel_name;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Security check: Ensure the worker belongs to the warden's hostel
        const workerCheck = await pool.query("SELECT hostel_name FROM workers WHERE id = $1", [id]);
        if (workerCheck.rowCount === 0 || workerCheck.rows[0].hostel_name !== warden_hostel) {
            return res.status(403).json({ error: "Unauthorized access to this worker's data." });
        }

        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) FROM complaints WHERE worker_id = $1`;
        const totalCountRes = await pool.query(countQuery, [id]);
        const totalRecords = parseInt(totalCountRes.rows[0].count);
        const totalPages = Math.ceil(totalRecords / limit);

        // Fetch paginated complaints with student details
        const complaintsQuery = `
            SELECT c.*, s.name AS student_name, s.room_no, s.hostel_name, s.phone_no AS student_phone
            FROM complaints c
            LEFT JOIN students s ON c.student_id = s.id
            WHERE c.worker_id = $1
            ORDER BY c.assigned_at DESC NULLS LAST
            LIMIT $2 OFFSET $3
        `;
        const complaintsRes = await pool.query(complaintsQuery, [id, limit, offset]);

        res.json({
            history: complaintsRes.rows,
            pagination: { totalRecords, totalPages, currentPage: page, limit },
        });
    } catch (error) {
        console.error("Error fetching worker complaints:", error);
        res.status(500).json({ error: "Failed to fetch complaints." });
    }
};
