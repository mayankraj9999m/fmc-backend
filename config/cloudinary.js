import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// 1. Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Use standard Multer Memory Storage
const storage = multer.memoryStorage();

// --- NEW: Security Filter to strictly allow only images ---
const fileFilter = (req, file, cb) => {
    // Check if the file's mimetype starts with 'image/'
    // (This allows image/jpeg, image/png, image/webp, etc.)
    if (file.mimetype.startsWith("image/")) {
        cb(null, true); // Accept the file
    } else {
        // Reject the file and throw an error
        cb(new Error("Invalid file type! Only images are allowed."), false);
    }
};

// Export the middleware with the new fileFilter included
export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter, // <-- Applied here
});

// 3. Create a Promise-based helper to upload streams to Cloudinary
export const uploadToCloudinary = (fileBuffer, folderName = "hostel_complaints") => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({ folder: folderName }, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        // Pipe the buffer to Cloudinary
        uploadStream.end(fileBuffer);
    });
};
