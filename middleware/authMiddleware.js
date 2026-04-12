import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
    // Read the token from the cookie
    const token = req.cookies.token;

    if (!token) {
        return next();
    }

    try {
        // Verify the token using your secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach the decoded payload (id, email, role) to the request object
        req.user = decoded;
        next(); // Move to the actual route handler
    } catch (error) {
        // Token is invalid or expired
        res.clearCookie("token"); // Clear the bad cookie
        next();
    }
};

// 2. Verify if the authenticated user has the required role(s)
export const verifyRole = (...allowedRoles) => {
    return (req, res, next) => {
        // req.user is set by verifyToken. If it's missing, they aren't authenticated.
        if (!req.user || !req.user.role) {
            return res.status(403).json({ error: "Access denied. User role not found." });
        }

        // Check if the user's role is in the list of allowed roles
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: "Access denied. Insufficient permissions." });
        }

        next(); // User has the right role, proceed to the route controller
    };
};
