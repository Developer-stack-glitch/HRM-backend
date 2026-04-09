const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { pool } = require('./Config/dbConfig');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5174',
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
        credentials: true
    }
});

// Attach io to app for use in controllers
app.set('socketio', io);

// Socket.io connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
    });

    socket.on('join_role', (role) => {
        socket.join(`role_${role}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5174',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static folder for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Database connection test
pool.getConnection()
    .then(connection => {
        console.log('Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed:', err.message);
    });

// Basic Route
app.get('/', (req, res) => {
    res.send('HRM Backend API is running');
});

// API Routes
app.use('/api', require('./routes/Routes'));


// Error Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5003;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

