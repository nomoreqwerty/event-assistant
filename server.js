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
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ success: false, message: 'Invalid email' });
  }

  try {
    db.prepare('INSERT INTO submissions (email, ip, user_agent) VALUES (?, ?, ?)').run(email, ip, userAgent);
    res.json({ success: true, message: 'Email submitted successfully' });
  } catch (err) {
    console.error('Error inserting submission:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API: Admin Login (JWT)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

  if (user && bcrypt.compareSync(password, user.password_hash)) {
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// API: Get submissions
app.get('/api/submissions', verifyToken, (req, res) => {
  try {
    const submissions = db.prepare('SELECT * FROM submissions ORDER BY timestamp DESC').all();
    res.json(submissions);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API: Export to CSV
app.get('/api/export', verifyToken, (req, res) => {
  try {
    const submissions = db.prepare('SELECT * FROM submissions ORDER BY timestamp DESC').all();

    let csv = 'ID,Email,IP,User Agent,Timestamp\n';

    submissions.forEach(s => {
      csv += `${s.id},"${s.email}","${s.ip}","${s.user_agent}","${s.timestamp}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions-' + Date.now() + '.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error exporting data:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/admin/login.html`);
});
