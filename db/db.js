import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Required for Neon DB
    },
    connectionTimeoutMillis: 10000, // 10 seconds timeout
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    max: 20, // Allow more concurrent connections
});

// Test the connection
pool.connect()
    .then((client) => {
        console.log("✅ Connected to Neon PostgreSQL");
        client.release(); // FIX: Release the connection back to the pool
    })
    .catch((err) => console.error("❌ Database connection error", err));

export default pool;
