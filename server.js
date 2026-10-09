const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');

// Import routes
const homepageRoutes = require('./routes/homepageRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const mantriRoutes = require('./routes/mantriRoutes');
const teamRoutes = require('./routes/teamRoutes');
const eventRoutes = require('./routes/eventRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const memberRoutes = require('./routes/memberRoutes');
const formRoutes = require('./routes/formRoutes');
const authRoutes = require('./routes/authRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const postRoutes = require('./routes/postRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const registrationRoutes = require('./routes/registrationRoutes');

const app = express();

// ─── Latency Tracking & Correlation Middleware (Non-Sensitive Threshold Logger) ───
app.use((req, res, next) => {
  const reqId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  req.reqId = reqId;
  const startHr = process.hrtime.bigint();
  const steps = [];

  req.logStep = (name) => {
    const elapsed = Number(process.hrtime.bigint() - startHr) / 1e6;
    steps.push(`${name}=${elapsed.toFixed(1)}ms`);
  };

  res.on('finish', () => {
    const totalMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    const isDebug = process.env.LATENCY_DEBUG === 'true';
    const isSlow = totalMs >= 500;

    if (isDebug || isSlow) {
      const cleanPath = (req.originalUrl || req.url || '').split('?')[0];
      const stepStr = steps.length > 0 ? ` [${steps.join(', ')}]` : '';
      console.log(`[PERF] ${reqId} ${req.method} ${cleanPath} status=${res.statusCode} total=${totalMs.toFixed(1)}ms${stepStr}`);
    }
  });

  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const fullUrl = req.originalUrl || req.url || '';
  // Allow framing for media stream endpoints (PDF preview modal) while keeping DENY for standard API routes
  if (fullUrl.includes('stream-pdf')) {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
  } else {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), message: 'GFG Campus Body API is active' });
});

// API Routes
app.use('/api/homepage', homepageRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/mantri', mantriRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/media', mediaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/registration', registrationRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const http = require('http');
const { initSocket } = require('./config/socket');

const PORT = parseInt(process.env.PORT || '5001', 10);

const startServer = (portToTry) => {
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(portToTry, () => {
    console.log(`====================================================`);
    console.log(`🚀 GFG CMP Server running on http://localhost:${portToTry}`);
    console.log(`🌐 Public Homepage API: http://localhost:${portToTry}/api/homepage`);
    console.log(`💬 Community Feed API: http://localhost:${portToTry}/api/posts`);
    console.log(`🔐 Admin Auth API: http://localhost:${portToTry}/api/auth/login`);
    console.log(`====================================================`);
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${portToTry} is in use. Retrying on port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('[Server Error]:', err);
    }
  });
};

// Connect DB and launch server
connectDB().then(() => {
  startServer(PORT);
});
