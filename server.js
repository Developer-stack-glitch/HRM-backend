const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();

const { pool } = require('./Config/dbConfig');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const securityHeaders = require('./middleware/securityHeadersMiddleware');
const { generalApiLimiter } = require('./middleware/rateLimitMiddleware');
const { protect, isUserAdmin } = require('./middleware/authMiddleware');

// Server initialization
const app = express();
const server = http.createServer(app);

// CORS Origins
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'https://hrms.actecrm.com'
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps or curl) or if origin is in allowlist
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy violation: Access denied from this origin'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

const io = new Server(server, {
    cors: corsOptions
});

// Attach io to app for use in controllers
app.set('socketio', io);

// Socket.io JWT Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.split(' ')[1] || 
                  socket.handshake.query?.token;

    if (!token) {
        return next(new Error('Authentication error: Token required for WebSocket connection'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
    } catch (err) {
        return next(new Error('Authentication error: Invalid or expired token'));
    }
});

// Socket.io Connection with Authenticated Room Isolation
io.on('connection', async (socket) => {
    let userRole = 'employee';
    try {
        const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [socket.userId]);
        if (rows.length > 0) {
            userRole = (rows[0].role || 'employee').toLowerCase().trim();
        }
    } catch (e) {
        console.error('Socket user role lookup error:', e.message);
    }

    // Only allow user to join their own personal notification room
    socket.on('join', (userId) => {
        if (String(socket.userId) === String(userId)) {
            socket.join(`user_${userId}`);
        } else {
            console.warn(`[Security] Unauthorized room join attempt: user ${socket.userId} tried to join user_${userId}`);
        }
    });

    // Only allow joining role rooms that match the verified database role
    socket.on('join_role', (requestedRole) => {
        const reqRoleNorm = (requestedRole || '').toLowerCase().trim();
        const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'hr executive';

        if (reqRoleNorm === userRole || (isAdmin && reqRoleNorm === 'admin')) {
            socket.join(`role_${requestedRole}`);
        } else {
            console.warn(`[Security] Unauthorized role join attempt: user ${socket.userId} (role: ${userRole}) tried to join role_${requestedRole}`);
        }
    });

    socket.on('disconnect', () => {});
});

// Apply Security Headers (Helmet equivalent)
app.use(securityHeaders);

// CORS Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

/**
 * Secure file serving middleware
 * Public brand assets (logos, avatars) are served directly.
 * Confidential documents (Aadhaar, PAN, payslips, passbooks, resumes, receipts) require authentication.
 */
const serveSecureUpload = (req, res, next) => {
    const filename = path.basename(req.path);
    if (!filename || filename === '.' || filename.includes('..')) {
        return res.status(400).json({ message: 'Invalid file path' });
    }

    // Public brand assets: company logos, system logos, profile photos
    if (filename.startsWith('logo-') || filename === 'acte-logo.png' || filename.startsWith('photo-')) {
        const publicFilePath = path.join(__dirname, 'uploads', filename);
        if (fs.existsSync(publicFilePath)) {
            return res.sendFile(publicFilePath);
        }
        return res.status(404).json({ message: 'Asset not found' });
    }

    // Confidential employee documents: require authentication
    return protect(req, res, () => {
        const secureFilePath = path.join(__dirname, 'uploads', filename);
        if (!fs.existsSync(secureFilePath)) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.sendFile(secureFilePath);
    });
};

app.use('/api/uploads', serveSecureUpload);
app.use('/uploads', serveSecureUpload);

// Database connection test
pool.getConnection()
    .then(connection => {
        console.log('Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed:', err.message);
    });

// Health check route
app.get('/', (req, res) => {
    res.send('HRM Backend API is running securely');
});

// API Routes with rate limiting
app.use('/api', generalApiLimiter, require('./routes/Routes'));

// Error Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5003;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
