import bcrypt from "bcrypt"; // or 'bcryptjs'

async function hashPassword(plainPassword) {
    const saltRounds = 10; // A standard number of salt rounds
    try {
        const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
        return hashedPassword;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw error;
    }
}

// Example usage
const myPassword = "jas";
hashPassword(myPassword).then((hash) => {
    console.log("Hashed Password:", hash);
    // Store the hash in your database
});
