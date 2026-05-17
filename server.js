require('dotenv').config(); // MUST be the first line

const { Pool } = require('pg');
// ... your existing code ...
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup File Uploads using Multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (index.html, styles.css, app.js)
app.use('/uploads', express.static(uploadDir)); // Serve uploaded files

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/freelancer_lite',
});

// Initialize Database Schema
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(50) PRIMARY KEY,
                password VARCHAR(100) NOT NULL,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                number VARCHAR(20),
                role VARCHAR(20),
                company VARCHAR(100),
                website VARCHAR(255),
                study VARCHAR(100),
                wage INTEGER,
                skills TEXT[],
                bio TEXT,
                resume_path VARCHAR(255),
                wallet_balance INTEGER DEFAULT 0,
                badges TEXT[] DEFAULT '{}',
                streak INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id SERIAL PRIMARY KEY,
                poster_username VARCHAR(50) REFERENCES users(username),
                title VARCHAR(200) NOT NULL,
                category VARCHAR(50),
                desc_text TEXT,
                budget INTEGER,
                duration VARCHAR(50),
                skills TEXT[],
                status VARCHAR(20) DEFAULT 'Open',
                posted_at BIGINT
            );

            CREATE TABLE IF NOT EXISTS bids (
                id SERIAL PRIMARY KEY,
                job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
                job_title VARCHAR(200),
                poster_username VARCHAR(50) REFERENCES users(username),
                worker_username VARCHAR(50) REFERENCES users(username),
                worker_name VARCHAR(100),
                rate INTEGER,
                hours INTEGER,
                total INTEGER,
                message TEXT,
                status VARCHAR(20) DEFAULT 'Pending',
                placed_at BIGINT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                from_user VARCHAR(50) REFERENCES users(username),
                to_user VARCHAR(50) REFERENCES users(username),
                text TEXT,
                read BOOLEAN DEFAULT FALSE,
                timestamp BIGINT
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_username VARCHAR(50) REFERENCES users(username),
                amount INTEGER,
                type VARCHAR(20),
                description TEXT,
                timestamp BIGINT
            );

            ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at BIGINT;
        `);
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Error initializing database. Is PostgreSQL running?', err.message);
    } finally {
        client.release();
    }
}

// Ensure the db is initialized
initDb();

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

// --- Auth & Users ---
app.post('/api/register', upload.single('resume'), async (req, res) => {
    try {
        const { username, password, name, email, number, role, company, website, study, wage, skills } = req.body;
        const resumePath = req.file ? `/uploads/${req.file.filename}` : null;

        let skillsArray = [];
        if (skills) {
            skillsArray = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
        }

        const result = await pool.query(
            `INSERT INTO users (username, password, name, email, number, role, company, website, study, wage, skills, resume_path, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [username, password, name, email, number, role, company, website, study, wage || 0, skillsArray, resumePath, Date.now()]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Registration failed. Username or email may already exist.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2 AND role = $3', [username, password, role]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials or wrong role.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

app.get('/api/users/:username', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [req.params.username]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

app.get('/api/public/users/:username', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, name, email, role, company, website, study, wage, skills, resume_path, created_at FROM users WHERE username = $1', [req.params.username]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        let user = result.rows[0];

        if (user.role === 'poster') {
            const jobsCount = await pool.query('SELECT COUNT(*) FROM jobs WHERE poster_username = $1', [req.params.username]);
            user.total_jobs = parseInt(jobsCount.rows[0].count);
        }

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch public profile' });
    }
});

// --- Jobs ---
app.get('/api/jobs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM jobs ORDER BY posted_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

app.post('/api/jobs', async (req, res) => {
    try {
        const { posterUsername, title, category, desc, budget, duration, skills } = req.body;
        const result = await pool.query(
            `INSERT INTO jobs (poster_username, title, category, desc_text, budget, duration, skills, posted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [posterUsername, title, category, desc, budget, duration, skills, Date.now()]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to post job' });
    }
});

app.put('/api/jobs/:id/status', async (req, res) => {
    try {
        const { status } = req.body; // e.g. 'In Progress', 'Completed', 'Cancelled'
        const result = await pool.query('UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);

        // Financial Module: Pay worker if completed
        // For simplicity, we just look up accepted bids and credit worker, but we need the worker context.
        // Usually, accepting a bid sets the worker for the job. Let's handle it purely by logic later.

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update job status' });
    }
});

// --- Bids ---
app.get('/api/bids', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bids ORDER BY placed_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bids' });
    }
});

app.post('/api/bids', async (req, res) => {
    try {
        const { jobId, jobTitle, posterUsername, workerUsername, workerName, rate, hours, total, message } = req.body;
        const result = await pool.query(
            `INSERT INTO bids (job_id, job_title, poster_username, worker_username, worker_name, rate, hours, total, message, placed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [jobId, jobTitle, posterUsername, workerUsername, workerName, rate, hours, total, message, Date.now()]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit bid' });
    }
});

// Financial / Wallet Endpoints
app.post('/api/wallet/pay', async (req, res) => {
    // Basic logic for a Poster paying a Worker upon job completion
    try {
        const { posterUsername, workerUsername, amount, jobId } = req.body;

        await pool.query('BEGIN');

        // Deduct from poster
        await pool.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE username = $2', [amount, posterUsername]);
        // Add to worker
        await pool.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE username = $2', [amount, workerUsername]);

        // Log transactions
        const ts = Date.now();
        await pool.query('INSERT INTO transactions (user_username, amount, type, description, timestamp) VALUES ($1, $2, $3, $4, $5)', [posterUsername, -amount, 'Payment', `Paid for job #${jobId}`, ts]);
        await pool.query('INSERT INTO transactions (user_username, amount, type, description, timestamp) VALUES ($1, $2, $3, $4, $5)', [workerUsername, amount, 'Earning', `Earned from job #${jobId}`, ts]);

        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Payment failed' });
    }
});

app.get('/api/transactions/:username', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM transactions WHERE user_username = $1 ORDER BY timestamp DESC', [req.params.username]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});


// --- Sidebar Endpoints ---

app.get('/api/sidebar/profile', async (req, res) => {
    try {
        const { email } = req.query;
        const result = await pool.query("SELECT username, email, role, skills, resume_path FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.get('/api/sidebar/wallet', async (req, res) => {
    try {
        const { email } = req.query;
        const result = await pool.query("SELECT wallet_balance FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        // Fetch recent transactions
        const userResult = await pool.query("SELECT username FROM users WHERE email = $1", [email]);
        let transactions = [];
        if (userResult.rows.length > 0) {
            const txResult = await pool.query("SELECT * FROM transactions WHERE user_username = $1 ORDER BY timestamp DESC LIMIT 10", [userResult.rows[0].username]);
            transactions = txResult.rows;
        }

        res.json({ balance: result.rows[0].wallet_balance, transactions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

app.get('/api/sidebar/history', async (req, res) => {
    try {
        const { email } = req.query;
        const result = await pool.query(`
            SELECT * FROM jobs 
            WHERE poster_username = (SELECT username FROM users WHERE email = $1)
            ORDER BY posted_at DESC
        `, [email]);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.get('/api/sidebar/analytics', async (req, res) => {
    try {
        const { email } = req.query;
        const result = await pool.query(`
            SELECT COUNT(*) as total_projects, SUM(budget) as total_spent 
            FROM jobs 
            WHERE poster_username = (SELECT username FROM users WHERE email = $1) AND status = 'Completed'
        `, [email]);

        const activeResult = await pool.query(`
            SELECT COUNT(*) as active_hires 
            FROM jobs 
            WHERE poster_username = (SELECT username FROM users WHERE email = $1) AND status = 'In Progress'
        `, [email]);

        res.json({
            total_completed: parseInt(result.rows[0].total_projects) || 0,
            total_spent: parseInt(result.rows[0].total_spent) || 0,
            active_hires: parseInt(activeResult.rows[0].active_hires) || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

app.put('/api/settings/password', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // TODO: Import bcrypt (const bcrypt = require('bcrypt')) and hash the password
        // const saltRounds = 10;
        // const password_hash = await bcrypt.hash(password, saltRounds);
        // For now, using raw password (replace 'password' with 'password_hash' below when ready)
        
        const result = await pool.query(`
            UPDATE users 
            SET password = $1 
            WHERE email = $2 
            RETURNING username, email
        `, [password, email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.status(200).json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.get('/api/help', async (req, res) => {
    try {
        const faqs = [
            { id: 1, category: "Getting Started", question: "How do I post a job?", answer: "Click 'Post a Job' in the top navigation bar, fill out the form budget in INR, and submit." },
            { id: 2, category: "Payments", question: "How does the wallet system work?", answer: "Funds are securely escrowed when a project begins and released once the work is completed." },
            { id: 3, category: "Support", question: "Who do I contact for support?", answer: "You can email our 24/7 support team at support@freelancerlite.com or submit a ticket from your dashboard." },
            { id: 4, category: "Account", question: "How do I change my password?", answer: "Navigate to the Settings tab in your sidebar, enter your new password, and click 'Update Settings'." }
        ];
        res.status(200).json(faqs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch help documentation' });
    }
});

// Missing backend route to resolve the 404 error
app.get('/help', (req, res) => {
    try {
        const faqs = [
            {
                id: 1,
                question: "How do I post a job?",
                answer: "Click on 'Post a Job' in the navigation header, fill in the project requirements, and set your budget in INR."
            },
            {
                id: 2,
                question: "How does the escrow wallet protect payments?",
                answer: "When a project kicks off, the budget funds are locked securely. They are only released to the worker once the poster approves the completed work."
            },
            {
                id: 3,
                question: "Can I switch between roles?",
                answer: "Yes, our dual-role architecture recognizes your primary account type at login, providing custom features tailored for posters or workers seamlessly."
            }
        ];

        // Return a successful 200 OK status with the JSON payload
        res.status(200).json(faqs);
    } catch (error) {
        console.error("Error serving help data:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
