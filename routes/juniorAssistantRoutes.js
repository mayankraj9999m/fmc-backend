import express from "express";
import multer from "multer";
import csvParser from "csv-parser";
import fs from "fs";
import pool from "../db/db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Setup Multer for temporary file storage
const upload = multer({ dest: "uploads/" });

// Middleware to authorize ONLY Junior Assistants
const isJuniorAssistant = async (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admins only." });
    }
    try {
        const adminResult = await pool.query("SELECT position FROM admins WHERE id = $1", [req.user.id]);
        if (
            adminResult.rows.length === 0 ||
            adminResult.rows[0].position.toLowerCase() !== "Junior Assistant".toLowerCase()
        ) {
            return res.status(403).json({ error: "Access denied. Junior Assistants only." });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: "Database error while verifying role." });
    }
};

// Apply authentication middleware to all routes below
router.use(verifyToken);
router.use(isJuniorAssistant);

// 1. GET: Fetch all students
router.get("/admin/jas/students", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || "room_no";
        const sortOrder = req.query.sortOrder === "DESC" ? "DESC" : "ASC";
        const search = req.query.search || "";
        const offset = (page - 1) * limit;

        // Validation for sortBy to prevent SQL injection
        const allowedSortColumns = ["roll_no", "name", "email", "hostel_name", "room_no", "floor_no"];
        const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "room_no";

        let countQuery = "SELECT COUNT(*) FROM students";
        let dataQuery = "SELECT * FROM students";
        let queryParams = [];
        let countParams = [];

        // Apply Search Filter globally
        if (search) {
            const searchPattern = `%${search}%`;
            const searchClause = ` WHERE name ILIKE $1 OR roll_no ILIKE $1 OR email ILIKE $1 OR hostel_name ILIKE $1 OR room_no ILIKE $1`;
            countQuery += searchClause;
            dataQuery += searchClause;
            queryParams.push(searchPattern);
            countParams.push(searchPattern);
        }

        // Apply Global Sorting
        dataQuery += ` ORDER BY ${validSortBy} ${sortOrder}`;

        // Apply Pagination
        const limitIndex = queryParams.length + 1;
        const offsetIndex = queryParams.length + 2;
        dataQuery += ` LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
        queryParams.push(limit, offset);

        const countResult = await pool.query(countQuery, countParams);
        const totalStudents = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalStudents / limit);

        const result = await pool.query(dataQuery, queryParams);

        res.status(200).json({
            students: result.rows,
            pagination: {
                totalStudents,
                fetchedStudents: result.rows.length,
                totalPages,
                currentPage: page,
                limit,
            },
        });
    } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).json({ error: "Failed to fetch students." });
    }
});

// 2. POST: Upload & Parse CSV
router.post("/admin/jas/upload-students", upload.single("file"), (req, res) => {
    // 1. Basic Check: Did the file upload at all?
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    // 2. File Type Validation: Ensure it's actually a CSV
    const isCsvMimeType = req.file.mimetype === "text/csv" || req.file.mimetype === "application/vnd.ms-excel";
    const isCsvExtension = req.file.originalname.toLowerCase().endsWith(".csv");

    if (!isCsvMimeType && !isCsvExtension) {
        fs.unlinkSync(req.file.path); // Cleanup the invalid file
        return res.status(400).json({ error: "Invalid file format. Please upload a valid .csv file." });
    }

    const results = [];
    const errors = [];
    let successfulCount = 0;

    const stream = fs.createReadStream(req.file.path);

    stream
        .pipe(
            csvParser({
                // Cleans hidden characters/spaces from headers to prevent matching errors
                mapHeaders: ({ header }) =>
                    header
                        .toLowerCase()
                        .trim()
                        .replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, ""),
            }),
        )
        .on("error", (error) => {
            console.error("CSV Parse Error:", error);
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); // Ensure cleanup on error
            res.status(500).json({ error: "Failed to read or parse the CSV file. It might be corrupted." });
        })
        .on("data", (data) => {
            // Prevent pushing completely empty rows (often caused by trailing commas in Excel)
            if (Object.keys(data).length > 0 && Object.values(data).some((val) => val !== "")) {
                results.push(data);
            }
        })
        .on("end", async () => {
            try {
                // Delete the temporary file as soon as reading is done
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

                // 3. Empty File Check
                if (results.length === 0) {
                    return res.status(400).json({ error: "The uploaded CSV file is empty or contains no valid data." });
                }

                // 4. Schema/Header Validation: Check if the required columns exist
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
                    const hostel_name = student["hostel_name"] || null;
                    const email = student["email"] || `${roll_no?.toLowerCase()}@nitdelhi.ac.in`;

                    if (!roll_no || !name) {
                        errors.push({ type: "row", message: "Missing Roll No or Name for row", data: student });
                        errors.push({ type: "message", message: "Missing Roll No or Name for row" });
                        continue;
                    }

                    try {
                        // Check if a student exists with this Roll No OR Email
                        const checkQuery = await pool.query(
                            `SELECT id FROM students WHERE roll_no = $1 OR email = $2`,
                            [roll_no, email],
                        );

                        // Conflict Handling: Mismatched Data
                        if (checkQuery.rows.length > 1) {
                            errors.push({
                                type: "message",
                                message: `Data Conflict for ${roll_no}: This Roll No belongs to one student, but the Email '${email}' belongs to another. Skipping row.`,
                            });
                            continue;
                        }

                        // Update Existing Student
                        if (checkQuery.rows.length === 1) {
                            const studentId = checkQuery.rows[0].id;
                            await pool.query(
                                `UPDATE students 
                                 SET name = $1, roll_no = $2, email = $3, room_no = $4, floor_no = $5, hostel_name = $6
                                 WHERE id = $7`,
                                [name, roll_no, email, room_no, parseInt(floor_no), hostel_name, studentId],
                            );
                            successfulCount++;
                        }
                        // Insert New Student
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

                // Final Response
                res.status(200).json({
                    message: `Processed CSV. Students added: ${successfulCount}, Errors: ${errors.length}`,
                    errors,
                });
            } catch (error) {
                console.error("CSV Processing Error:", error);
                res.status(500).json({ error: "An unexpected error occurred during database processing." });
            }
        });
});

// 3. PUT: Update a specific student
router.put("/admin/jas/students/:id", async (req, res) => {
    const { id } = req.params;

    // 1. Define the fields that the Junior Assistant is allowed to update
    const allowedFields = ["name", "roll_no", "email", "hostel_name", "room_no", "floor_no"];

    // 2. Dynamically build the query parts
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex}`);

            // Handle specific integer parsing for floor_no
            if (field === "floor_no") values.push(req.body[field] ? parseInt(req.body[field]) : null);
            else values.push(req.body[field]);

            paramIndex++;
        }
    }

    // 3. If no valid fields were sent, return a 400 Bad Request
    if (setClauses.length === 0) return res.status(400).json({ error: "No valid fields provided to update." });

    // 4. Add the 'id' as the final parameter for the WHERE clause
    values.push(id);
    const query = `UPDATE students SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`;

    try {
        await pool.query(query, values);
        res.status(200).json({ message: "Student updated successfully." });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Failed to update student." });
    }
});

// 4. DELETE: Remove a student
router.delete("/admin/jas/students/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM students WHERE id = $1", [id]);
        res.status(200).json({ message: "Student deleted successfully." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete student." });
    }
});

// 5. POST: Add a single student manually
router.post("/admin/jas/student", async (req, res) => {
    const { roll_no, name, email, hostel_name, room_no, floor_no } = req.body;

    // Basic validation: Ensure required fields are present
    if (!roll_no || !name || !email) {
        return res.status(400).json({ error: "Roll No, Name, and Email are required." });
    }

    try {
        await pool.query(
            `INSERT INTO students (roll_no, name, email, hostel_name, room_no, floor_no)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [roll_no, name, email, hostel_name || null, room_no || null, floor_no ? parseInt(floor_no) : null],
        );

        res.status(201).json({ message: "Student added successfully." });
    } catch (error) {
        console.error("Add Student Error:", error);

        // PostgreSQL error code '23505' means a UNIQUE constraint was violated
        // This handles cases where the roll_no or email already exists in the DB
        if (error.code === "23505") {
            return res.status(400).json({ error: "A student with this Roll No or Email already exists." });
        }

        res.status(500).json({ error: "Failed to add student." });
    }
});

// 6. POST: Bulk Delete Students
router.post("/admin/jas/students/bulk-delete", async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No student IDs provided for deletion." });
    }

    // 1. Filter out any invalid UUIDs to prevent PostgreSQL casting errors
    // This regex ensures the ID perfectly matches the standard 36-character UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validIds = ids.filter((id) => typeof id === "string" && uuidRegex.test(id));

    if (validIds.length === 0) {
        return res.status(400).json({ error: "No valid student IDs provided." });
    }

    try {
        // 2. The ANY($1::uuid[]) syntax efficiently matches multiple IDs
        const result = await pool.query("DELETE FROM students WHERE id = ANY($1::uuid[])", [validIds]);

        // 3. Handle specific deletion scenarios based on actual rows affected
        if (result.rowCount === 0) {
            // None of the provided IDs existed in the database
            return res.status(404).json({ error: "No matching students found to delete." });
        }

        if (result.rowCount < validIds.length) {
            // Only some of the IDs were found and deleted
            return res.status(200).json({
                message: `Partially successful. Deleted ${result.rowCount} students, but ${validIds.length - result.rowCount} IDs were not found.`,
            });
        }

        // Perfect match: All IDs were found and deleted
        res.status(200).json({ message: `Successfully deleted ${result.rowCount} students.` });
    } catch (error) {
        console.error("Bulk Delete Error:", error);
        res.status(500).json({ error: "Failed to delete selected students." });
    }
});

// GET: Export all students to CSV
router.get("/admin/jas/students/export", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT roll_no, name, email, hostel_name, room_no, floor_no FROM students ORDER BY room_no ASC",
        );

        const students = result.rows;
        if (students.length === 0) {
            return res.status(404).json({ error: "No students found to export." });
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
            csvRows.push(values.join(","));
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
