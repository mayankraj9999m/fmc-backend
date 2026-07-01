import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

async function migrate() {
    try {
        console.log("Starting migration...");
        await pool.query(
            `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS priority_score VARCHAR(20) DEFAULT 'Medium';`,
        );
        console.log(
            "Migration successful: Added priority_score to complaints.",
        );
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        pool.end();
    }
}

migrate();
