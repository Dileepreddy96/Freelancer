require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkUser(username) {
    console.log(`Checking database for user: "${username}"...`);
    try {
        const result = await pool.query('SELECT username, name, email, role FROM users WHERE username = $1', [username]);
        
        if (result.rows.length > 0) {
            console.log('✅ User found in the database:');
            console.table(result.rows);
        } else {
            console.log('❌ User NOT found. Please check if the username is correct or if they exist in the users table.');
        }
    } catch (err) {
        console.error('Database connection error:', err.message);
    } finally {
        pool.end();
    }
}

const targetUser = process.argv[2] || 'john'; // defaults to 'john' if no argument provided
checkUser(targetUser);
