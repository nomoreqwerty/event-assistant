const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = new Database('./data/database.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    user_agent TEXT,
    referer TEXT,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
`);

// Create default admin user (username: admin, password: admin123)
const adminExists = db.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin user created: admin / admin123');
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'event-assistant-secret-key-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Visit tracking middleware
app.use((req, res, next) => {
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/api')) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const referer = req.headers['referer'] || 'direct';
    
    db.prepare('INSERT INTO visits (ip, user_agent, referer) VALUES (?, ?, ?)').run(ip, userAgent, referer);
  }
  next();
});

// Serve static files
app.use(express.static('public'));

// API: Submit email
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ success: false, message: 'Invalid email' });
  }
  
  try {
    db.prepare('INSERT INTO emails (email) VALUES (?)').run(email);
    res.json({ success: true, message: 'Email added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.json({ success: true, message: 'Email already registered' });
    } else {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
});

// Admin: Login page
app.get('/admin', (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Admin: Login POST
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Admin: Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin');
});

// Admin middleware
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect('/admin');
  }
}

// Admin: Dashboard
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// Admin: Get stats
app.get('/admin/api/stats', requireAdmin, (req, res) => {
  const emailCount = db.prepare('SELECT COUNT(*) as count FROM emails').get().count;
  const visitCount = db.prepare('SELECT COUNT(*) as count FROM visits').get().count;
  const todayVisits = db.prepare("SELECT COUNT(*) as count FROM visits WHERE DATE(visited_at) = DATE('now')").get().count;
  
  res.json({
    emailCount,
    visitCount,
    todayVisits
  });
});

// Admin: Get emails
app.get('/admin/api/emails', requireAdmin, (req, res) => {
  const emails = db.prepare('SELECT * FROM emails ORDER BY created_at DESC').all();
  res.json(emails);
});

// Admin: Get visits
app.get('/admin/api/visits', requireAdmin, (req, res) => {
  const visits = db.prepare('SELECT * FROM visits ORDER BY visited_at DESC LIMIT 100').all();
  res.json(visits);
});

// Admin: Export emails to TXT
app.get('/admin/api/export/emails', requireAdmin, (req, res) => {
  const emails = db.prepare('SELECT email, created_at FROM emails ORDER BY created_at DESC').all();
  
  let txt = 'EMAIL LIST - Event Sales Assistant\n';
  txt += '='.repeat(50) + '\n\n';
  
  emails.forEach(e => {
    txt += `${e.email} - ${e.created_at}\n`;
  });
  
  txt += '\n' + '='.repeat(50) + '\n';
  txt += `Total: ${emails.length} emails\n`;
  txt += `Exported: ${new Date().toISOString()}\n`;
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="emails-' + Date.now() + '.txt"');
  res.send(txt);
});

// Admin: Export visits to TXT
app.get('/admin/api/export/visits', requireAdmin, (req, res) => {
  const visits = db.prepare('SELECT * FROM visits ORDER BY visited_at DESC').all();
  
  let txt = 'VISIT STATISTICS - Event Sales Assistant\n';
  txt += '='.repeat(50) + '\n\n';
  
  visits.forEach(v => {
    txt += `IP: ${v.ip}\n`;
    txt += `Time: ${v.visited_at}\n`;
    txt += `User-Agent: ${v.user_agent}\n`;
    txt += `Referer: ${v.referer}\n`;
    txt += '-'.repeat(50) + '\n';
  });
  
  txt += '\n' + '='.repeat(50) + '\n';
  txt += `Total visits: ${visits.length}\n`;
  txt += `Exported: ${new Date().toISOString()}\n`;
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="visits-' + Date.now() + '.txt"');
  res.send(txt);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
