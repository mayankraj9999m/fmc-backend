import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_rXLOxEnFd29j@ep-green-bush-ahaf9i2b-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });
client.connect()
    .then(() => client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'complaints';"))
    .then(res => { console.log(res.rows); client.end(); })
    .catch(err => { console.error(err); client.end(); });
