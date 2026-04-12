import express from "express";
import { upload } from "../config/cloudinary.js";
// Import both verifyToken AND verifyRole
import { verifyToken, verifyRole } from "../middleware/authMiddleware.js"; 
import {
    lodgeComplaint,
    getStudentDashboardStats,
    escalateComplaint,
    getWorkerDashboardStats,
    resolveComplaint,
    provideFeedback
} from "../controllers/complaintController.js";

const router = express.Router();

// 1. First, verify the user is logged in for ALL routes in this file
router.use(verifyToken);

// ==========================================
// STUDENT ROUTES (Only accessible by students)
// ==========================================
// We use a sub-router approach here to apply the role check to all /student routes at once
const studentRouter = express.Router();
studentRouter.use(verifyRole("student")); // Check role

studentRouter.post("/", upload.single("complaint_image"), lodgeComplaint);
studentRouter.get("/dashboard", getStudentDashboardStats);
studentRouter.put("/:id/escalate", escalateComplaint);
studentRouter.put("/:id/feedback", provideFeedback);

// Attach the studentRouter to the main router
router.use("/student", studentRouter);


// ==========================================
// WORKER ROUTES (Only accessible by workers)
// ==========================================
const workerRouter = express.Router();
workerRouter.use(verifyRole("worker")); // Check role

workerRouter.get("/dashboard", getWorkerDashboardStats);
workerRouter.put("/:id/resolve", upload.single("resolved_image"), resolveComplaint);

// Attach the workerRouter to the main router
router.use("/worker", workerRouter);


export default router;