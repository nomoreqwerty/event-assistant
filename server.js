const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'event-assistant-jwt-secret-' + Math.random();

// Initialize database
const db = new Database('./data/database.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
`);

// Migration: Check if old tables exist and migrate data
try {
  const oldEmailsExist = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'").get();
  const oldVisitsExist = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='visits'").get();

  if (oldEmailsExist) {
    console.log('🔄 Migrating old emails table to submissions...');
    const oldEmails = db.prepare('SELECT * FROM emails').all();

    oldEmails.forEach(record => {
      try {
        db.prepare('INSERT INTO submissions (email, timestamp) VALUES (?, ?)').run(
          record.email, 
          record.created_at || new Date().toISOString()
        );
      } catch (e) {
        // Skip duplicates
      }
    });

    db.prepare('DROP TABLE emails').run();
    console.log(`✅ Migrated ${oldEmails.length} emails`);
  }

  if (oldVisitsExist) {
    console.log('🔄 Migrating old visits table...');
    db.prepare('DROP TABLE visits').run();
    console.log('✅ Old visits table removed');
  }
} catch (err) {
  console.log('ℹ️  No old data to migrate');
}

// Create default admin user
const adminExists = db.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('✅ Default admin user created: admin / admin123');
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// JWT Auth Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// API: Submit email
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  console.log(`📧 New submission: ${email} from ${ip}`);

  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    console.log('❌ Invalid email format');
    return res.status(400).json({ success: false, message: 'Invalid email' });
  }

  try {
    db.prepare('INSERT INTO submissions (email, ip, user_agent) VALUES (?, ?, ?)').run(email, ip, userAgent);
    console.log('✅ Submission saved successfully');
    res.json({ success: true, message: 'Email submitted successfully' });
  } catch (err) {
    console.error('❌ Error inserting submission:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// API: Admin Login (JWT)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  console.log(`🔐 Login attempt for user: ${username}`);

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

  if (user && bcrypt.compareSync(password, user.password_hash)) {
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    console.log('✅ Login successful');
    res.json({ success: true, token });
  } else {
    console.log('❌ Invalid credentials');
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// API: Get submissions
app.get('/api/submissions', verifyToken, (req, res) => {
  try {
    const submissions = db.prepare('SELECT * FROM submissions ORDER BY timestamp DESC').all();
    console.log(`📊 Fetched ${submissions.length} submissions`);
    res.json(submissions);
  } catch (err) {
    console.error('❌ Error fetching submissions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API: Export to CSV
app.get('/api/export', verifyToken, (req, res) => {
  try {
    const submissions = db.prepare('SELECT * FROM submissions ORDER BY timestamp DESC').all();

    let csv = 'ID,Email,IP,User Agent,Timestamp\n';

    submissions.forEach(s => {
      csv += `${s.id},"${s.email}","${s.ip || 'N/A'}","${s.user_agent || 'N/A'}","${s.timestamp}"\n`;
    });

    console.log(`📥 Exporting ${submissions.length} submissions`);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions-' + Date.now() + '.csv"');
    res.send(csv);
  } catch (err) {
    console.error('❌ Error exporting data:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  const submissionCount = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    submissions: submissionCount
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const submissionCount = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
  console.log('
' + '='.repeat(50));
  console.log('🚀 Event Assistant Server Started');
  console.log('='.repeat(50));
  console.log(`📍 Port: ${PORT}`);
  console.log(`📊 Submissions in database: ${submissionCount}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin/login.html`);
  console.log(`🏠 Landing page: http://localhost:${PORT}`);
  console.log('='.repeat(50) + '
');
});
