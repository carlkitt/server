require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const messageRoutes = require('./routes/messageRoutes');
const skillRoutes = require('./routes/skillRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet());
app.use(mongoSanitize());

// CORS with origin whitelist
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl requests, etc)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow specific production origins if needed
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:54680',
      'http://10.0.0.34:3000'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs (increased for heavy usage)
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100 // increased limit for auth attempts
});
app.use(limiter);

// Initialize Socket.io
let io;
try {
  io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 60000
  });
  
  require('./sockets/socket')(io);
} catch (err) {
  console.error('Failed to initialize Socket.io:', err);
  io = null;
}

// Middleware to attach io to request
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/notifications', notificationRoutes);

// Basic root
app.get('/', (req, res) => res.send({ ok: true, message: 'SkillLink API' }));

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Don't expose internal error details
  if (process.env.NODE_ENV === 'production') {
    return res.status(err.status || 500).json({ message: 'Internal server error' });
  }
  
  res.status(err.status || 500).json({ 
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { error: err })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Connect DB and start server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  console.log('Database connected');
  
  // Only listen if not in Vercel environment
  if (!process.env.VERCEL) {
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }
}).catch(err => {
  console.error('Failed to connect database:', err);
  if (!process.env.VERCEL) {
    process.exit(1);
  }
});

// Export for Vercel
module.exports = app;
