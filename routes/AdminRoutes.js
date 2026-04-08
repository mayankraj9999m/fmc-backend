import express from "express";
import multer from "multer";
import csvParser from "csv-parser";
import fs from "fs";
import pool from "../db/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Setup Multer for temporary file storage
const upload = multer({ dest: "uploads/" });

// Middleware to authorize ONLY Admins
const isAdmin = async (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admins only." });
    }
    try {
        // Fetch position and hostel_name to attach them to the request for reliable RBAC
        const adminResult = await pool.query("SELECT position, hostel_name FROM admins WHERE id = $1", [req.user.id]);
        if (adminResult.rows.length === 0) {
            return res.status(403).json({ error: "Access denied. Admin only." });
        }
        req.user.position = adminResult.rows[0].position;
        req.user.hostel_name = adminResult.rows[0].hostel_name;
        next();
    } catch (error) {
        res.status(500).json({ error: "Database error while verifying role." });
    }
};

// Helper function to check if the admin is restricted to a specific hostel
const isRestrictedAdmin = (user) => {
    return user.position === "Hostel Warden" || user.position === "Associate Warden";
};

// Apply authentication middleware to all routes below
router.use(verifyToken);
router.use(isAdmin);

// 1. GET: Fetch all students
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || "room_no";
        const sortOrder = req.query.sortOrder === "DESC" ? "DESC" : "ASC";
        const search = req.query.search || "";
        const offset = (page - 1) * limit;

        const allowedSortColumns = ["roll_no", "name", "email", "hostel_name", "room_no", "floor_no"];
        const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "room_no";

        let countQuery = "SELECT COUNT(*) FROM students WHERE 1=1";
        let dataQuery = "SELECT * FROM students WHERE 1=1";
        let queryParams = [];

        // --- ROLE BASED ACCESS CONTROL ---
        if (isRestrictedAdmin(req.user)) {
            queryParams.push(req.user.hostel_name);
            const hostelClause = ` AND hostel_name = $${queryParams.length}`;
            countQuery += hostelClause;
            dataQuery += hostelClause;
        }

        // Apply Search Filter globally
        if (search) {
            queryParams.push(`%${search}%`);
            const searchClause = ` AND (name ILIKE $${queryParams.length} OR roll_no ILIKE $${queryParams.length} OR email ILIKE $${queryParams.length} OR hostel_name ILIKE $${queryParams.length} OR room_no ILIKE $${queryParams.length})`;
            countQuery += searchClause;
            dataQuery += searchClause;
        }

        // Apply Global Sorting & Pagination
        dataQuery += ` ORDER BY ${validSortBy} ${sortOrder} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

        // Execute queries
        const countResult = await pool.query(
            countQuery,
            isRestrictedAdmin(req.user)
                ? [req.user.hostel_name, search ? `%${search}%` : null].filter(Boolean)
                : search
                  ? [`%${search}%`]
                  : [],
        );
        const totalStudents = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalStudents / limit);

        queryParams.push(limit, offset);
        const result = await pool.query(dataQuery, queryParams);

        res.status(200).json({
            students: result.rows,
            pagination: { totalStudents, fetchedStudents: result.rows.length, totalPages, currentPage: page, limit },
        });
    } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).json({ error: "Failed to fetch students." });
    }
});

// 2. POST: Upload & Parse CSV
router.post("/upload-csv", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const isCsvMimeType = req.file.mimetype === "text/csv" || req.file.mimetype === "application/vnd.ms-excel";
    const isCsvExtension = req.file.originalname.toLowerCase().endsWith(".csv");

    if (!isCsvMimeType && !isCsvExtension) {
        fs.unlinkSync(req.file.path); 
        return res.status(400).json({ error: "Invalid file format. Please upload a valid .csv file." });
    }

    const results = [];
    const errors = [];
    let successfulCount = 0;
    const isRestricted = isRestrictedAdmin(req.user);

    const stream = fs.createReadStream(req.file.path);

    stream
        .pipe(
            csvParser({
                mapHeaders: ({ header }) =>
                    header
                        .toLowerCase()
                        .trim()
                        .replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, ""),
            }),
        )
        .on("error", (error) => {
            console.error("CSV Parse Error:", error);
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
            res.status(500).json({ error: "Failed to read or parse the CSV file. It might be corrupted." });
        })
        .on("data", (data) => {
            if (Object.keys(data).length > 0 && Object.values(data).some((val) => val !== "")) {
                results.push(data);
            }
        })
        .on("end", async () => {
            try {
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

                if (results.length === 0) {
                    return res.status(400).json({ error: "The uploaded CSV file is empty or contains no valid data." });
                }

                const firstRow = results[0];
                const hasRollNo = firstRow.hasOwnProperty("roll_no");
                const hasName = firstRow.hasOwnProperty("name");

                if (!hasRollNo || !hasName) {
                    return res.status(400).json({
                        error: "Invalid CSV structure. The file must contain 'roll_no' and 'name' columns.",
                    });
                }

                // --- DATABASE PROCESSING ---
                for (const student of results) {
                    const roll_no = student["roll_no"];
                    const name = student["name"];
                    const room_no = student["room_no"] || null;
                    const floor_no = student["floor_no"] || null;
                    let hostel_name = student["hostel_name"] || null;
                    const email = student["email"] || `${roll_no?.toLowerCase()}@nitdelhi.ac.in`;

                    if (!roll_no || !name) {
                        errors.push({ type: "row", message: "Missing Roll No or Name for row", data: student });
                        errors.push({ type: "message", message: "Missing Roll No or Name for row" });
                        continue;
                    }

                    // RBAC check for Wardens
                    if (isRestricted) {
                        if (hostel_name && hostel_name !== req.user.hostel_name) {
                            errors.push({ type: "message", message: `Permission Denied for ${roll_no}: Cannot assign to ${hostel_name}.` });
                            continue;
                        }
                        hostel_name = req.user.hostel_name; // Force assigned hostel
                    }

                    try {
                        const checkQuery = await pool.query(
                            `SELECT id, hostel_name FROM students WHERE roll_no = $1 OR email = $2`,
                            [roll_no, email],
                        );

                        if (checkQuery.rows.length > 1) {
                            errors.push({
                                type: "message",
                                message: `Data Conflict for ${roll_no}: This Roll No belongs to one student, but the Email '${email}' belongs to another. Skipping row.`,
                            });
                            continue;
                        }

                        if (checkQuery.rows.length === 1) {
                            const existingStudent = checkQuery.rows[0];
                            
                            // RBAC: Verify if the restricted admin owns the existing student
                            if (isRestricted && existingStudent.hostel_name !== req.user.hostel_name) {
                                errors.push({ type: "message", message: `Permission Denied for ${roll_no}: Student currently belongs to another hostel.` });
                                continue;
                            }

                            const studentId = existingStudent.id;
                            await pool.query(
                                `UPDATE students 
                                 SET name = $1, roll_no = $2, email = $3, room_no = $4, floor_no = $5, hostel_name = $6
                                 WHERE id = $7`,
                                [name, roll_no, email, room_no, parseInt(floor_no), hostel_name, studentId],
                            );
                            successfulCount++;
                        }
                        else {
                            await pool.query(
                                `INSERT INTO students (roll_no, name, email, room_no, floor_no, hostel_name)
                                 VALUES ($1, $2, $3, $4, $5, $6)`,
                                [roll_no, name, email, room_no, parseInt(floor_no), hostel_name],
                            );
                            successfulCount++;
                        }
                    } catch (dbError) {
                        errors.push({ type: "message", message: `DB Error for ${roll_no}: ${dbError.message}` });
                    }
                }

                res.status(200).json({
                    message: `Processed CSV. Students added/updated: ${successfulCount}, Errors: ${errors.length}`,
                    errors,
                });
            } catch (error) {
                console.error("CSV Processing Error:", error);
                res.status(500).json({ error: "An unexpected error occurred during database processing." });
            }
        });
});

// 3. PUT: Update a specific student
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const isRestricted = isRestrictedAdmin(req.user);

    // RBAC: Prevent Warden from moving a student to another hostel
    if (isRestricted && req.body.hostel_name && req.body.hostel_name !== req.user.hostel_name) {
        return res.status(403).json({ error: "You cannot move a student to another hostel." });
    }

    const allowedFields = ["name", "roll_no", "email", "hostel_name", "room_no", "floor_no"];
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex}`);
            if (field === "floor_no") values.push(req.body[field] ? parseInt(req.body[field]) : null);
            else values.push(req.body[field]);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) return res.status(400).json({ error: "No valid fields provided to update." });

    values.push(id);
    let query = `UPDATE students SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`;

    // RBAC: Warden can only update if the student belongs to their hostel
    if (isRestricted) {
        paramIndex++;
        values.push(req.user.hostel_name);
        query += ` AND hostel_name = $${paramIndex}`;
    }

    // Return the id to confirm a row was updated
    query += ` RETURNING id`; 

    try {
        const result = await pool.query(query, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Student not found or permission denied to update." });
        }
        res.status(200).json({ message: "Student updated successfully." });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Failed to update student." });
    }
});

// 4. DELETE: Remove a student
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const isRestricted = isRestrictedAdmin(req.user);

    let query = "DELETE FROM students WHERE id = $1";
    let params = [id];

    // RBAC: Only delete if student is in the Warden's hostel
    if (isRestricted) {
        query += " AND hostel_name = $2";
        params.push(req.user.hostel_name);
    }
    
    query += " RETURNING id";

    try {
        const result = await pool.query(query, params);
        if (result.rowCount === 0) {
             return res.status(404).json({ error: "Student not found or permission denied." });
        }
        res.status(200).json({ message: "Student deleted successfully." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete student." });
    }
});

// 5. POST: Add a single student manually
router.post("/add", async (req, res) => {
    const { roll_no, name, email, hostel_name, room_no, floor_no } = req.body;

    if (!roll_no || !name || !email) {
        return res.status(400).json({ error: "Roll No, Name, and Email are required." });
    }

    let finalHostelName = hostel_name;
    const isRestricted = isRestrictedAdmin(req.user);

    // RBAC: Enforce Warden's own hostel
    if (isRestricted) {
        if (hostel_name && hostel_name !== req.user.hostel_name) {
            return res.status(403).json({ error: "You can only add students to your assigned hostel." });
        }
        finalHostelName = req.user.hostel_name;
    }

    try {
        await pool.query(
            `INSERT INTO students (roll_no, name, email, hostel_name, room_no, floor_no)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [roll_no, name, email, finalHostelName || null, room_no || null, floor_no ? parseInt(floor_no) : null],
        );

        res.status(201).json({ message: "Student added successfully." });
    } catch (error) {
        console.error("Add Student Error:", error);

        if (error.code === "23505") {
            return res.status(400).json({ error: "A student with this Roll No or Email already exists." });
        }

        res.status(500).json({ error: "Failed to add student." });
    }
});

// 6. POST: Bulk Delete Students
router.post("/bulk-delete", async (req, res) => {
    const { ids } = req.body;
    const isRestricted = isRestrictedAdmin(req.user);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No student IDs provided for deletion." });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validIds = ids.filter((id) => typeof id === "string" && uuidRegex.test(id));

    if (validIds.length === 0) {
        return res.status(400).json({ error: "No valid student IDs provided." });
    }

    try {
        let query = "DELETE FROM students WHERE id = ANY($1::uuid[])";
        let params = [validIds];

        // RBAC: Prevent Warden from bulk-deleting students outside their hostel
        if (isRestricted) {
            query += " AND hostel_name = $2";
            params.push(req.user.hostel_name);
        }

        const result = await pool.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "No matching students found to delete or permission denied." });
        }

        if (result.rowCount < validIds.length) {
            return res.status(200).json({
                message: `Partially successful. Deleted ${result.rowCount} students, but some were not found or you lacked permission.`,
            });
        }

        res.status(200).json({ message: `Successfully deleted ${result.rowCount} students.` });
    } catch (error) {
        console.error("Bulk Delete Error:", error);
        res.status(500).json({ error: "Failed to delete selected students." });
    }
});

// GET: Export all students to CSV
router.get("/export", async (req, res) => {
    try {
        // Extract filtering and sorting parameters from the query string
        const sortBy = req.query.sortBy || "room_no";
        const sortOrder = req.query.sortOrder === "DESC" ? "DESC" : "ASC";
        const search = req.query.search || "";

        // Validate sort columns to prevent SQL injection
        const allowedSortColumns = ["roll_no", "name", "email", "hostel_name", "room_no", "floor_no"];
        const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "room_no";

        let exportQuery = "SELECT roll_no, name, email, hostel_name, room_no, floor_no FROM students WHERE 1=1";
        let params = [];

        // 1. Apply RBAC for export
        if (isRestrictedAdmin(req.user)) {
            params.push(req.user.hostel_name);
            exportQuery += ` AND hostel_name = $${params.length}`;
        }

        // 2. Apply Search Filter globally (Matches the frontend search)
        if (search) {
            params.push(`%${search}%`);
            exportQuery += ` AND (name ILIKE $${params.length} OR roll_no ILIKE $${params.length} OR email ILIKE $${params.length} OR hostel_name ILIKE $${params.length} OR room_no ILIKE $${params.length})`;
        }

        // 3. Apply Dynamic Sorting (Matches the frontend column order)
        exportQuery += ` ORDER BY ${validSortBy} ${sortOrder}`;

        // Execute the query
        const result = await pool.query(exportQuery, params);

        const students = result.rows;
        if (students.length === 0) {
            return res.status(404).json({ error: "No students found to export with the current filters." });
        }

        // Construct CSV
        const headers = ["Roll No", "Name", "Email", "Hostel Name", "Room No", "Floor No"];
        const csvRows = [headers.join(",")];

        for (const student of students) {
            const values = [
                student.roll_no || "",
                student.name || "",
                student.email || "",
                student.hostel_name || "",
                student.room_no || "",
                student.floor_no || "",
            ];
            // Wrap in quotes to prevent commas inside data from breaking columns, just in case
            csvRows.push(values.map(val => `"${val}"`).join(",")); 
        }

        const csvString = csvRows.join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=students_export.csv");
        res.status(200).send(csvString);
    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).json({ error: "Failed to export students." });
    }
});

export default router;