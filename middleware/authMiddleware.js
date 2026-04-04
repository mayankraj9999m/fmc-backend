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