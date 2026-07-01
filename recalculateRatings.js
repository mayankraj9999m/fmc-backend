import pool from "./db/db.js";

const recalculateRatings = async () => {
    try {
        console.log("Recalculating ratings for all workers...");
        const result = await pool.query(`
            WITH WorkerStats AS (
                SELECT worker_id, 
                       ROUND(AVG(rating)::numeric, 1) as avg_rating, 
                       COUNT(rating) as cnt
                FROM complaints
                WHERE rating IS NOT NULL
                GROUP BY worker_id
            )
            UPDATE workers w
            SET current_rating = COALESCE(ws.avg_rating, 0),
                rating_count = COALESCE(ws.cnt, 0)
            FROM WorkerStats ws
            WHERE w.id = ws.worker_id;
        `);
        console.log(`Updated ${result.rowCount} workers successfully.`);
    } catch(e) {
        console.error("Failed to recalculate ratings:", e);
    } finally {
        pool.end();
        process.exit(0);
    }
};

recalculateRatings();
