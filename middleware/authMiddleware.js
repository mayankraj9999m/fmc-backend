import jwt from "jsonwebtoken";

// 1. Verify Authentication (Any Valid User)
export const verifyToken = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: "Access denied. Not authenticated." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, email, role, hostel_name? }
        next();
    } catch (error) {
        return res.status(403).json({ error: "Invalid or expired token." });
    }
};

// 2. Verify Admin Role (Must be authenticated first)
export const verifyAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admins only." });
    }
    next();
};

// 3. Verify Master Key (For creating new Admins)
export const verifyMasterKey = (req, res, next) => {
    const { masterKey } = req.body;
    
    if (!masterKey || masterKey !== process.env.MASTER_ADMIN_KEY) {
        return res.status(403).json({ error: "Invalid Master Admin Key." });
    }
    next();
};