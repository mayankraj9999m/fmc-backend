import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Required for Neon DB
    },
});

// Test the connection
pool.connect()
    .then(() => console.log('✅ Connected to Neon PostgreSQL'))
    .catch((err) => console.error('❌ Database connection error', err));

export default pool;