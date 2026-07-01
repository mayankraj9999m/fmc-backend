import express from "express";
import {
    getAnnouncements,
    createAnnouncement,
    summarizeAnnouncements,
} from "../controllers/announcementController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Enforce authentication on all announcement routes so we have req.user identity
router.use(verifyToken);

// Fetch announcements based on viewer's role
router.get("/", getAnnouncements);
router.get("/summarize", summarizeAnnouncements);

// Create an announcement (Internally verifies if user is an admin or worker)
router.post("/", createAnnouncement);

export default router;
