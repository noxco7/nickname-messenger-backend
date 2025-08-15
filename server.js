// =====================================================
// ФАЙЛ: server.js (BACKEND) - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/server.js
// ОПИСАНИЕ: Добавлено middleware для доступа к io в роутах
// =====================================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Импортируем middleware
const { authenticateToken } = require('./middleware/auth');

// Импортируем роуты
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const chatRoutes = require('./routes/chats');

// Импортируем WebSocket сервис
const WebSocketService = require('./services/websocket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware для безопасности
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        const allowedOrigins = [
            'https://your-frontend-domain.com',
            'http://localhost:3000'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware для логирования запросов
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    
    if (req.headers.authorization) {
        console.log(`🔐 Authorization header present`);
    }
    
    next();
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nickname-messenger', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ Connected to MongoDB');
    console.log('🔐 JWT Authentication enabled');
})
.catch(err => console.error('❌ MongoDB connection error:', err));

// Простой rate limiting
const requestCounts = new Map();

app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - 60000; // 1 минута
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }
    
    const requests = requestCounts.get(ip).filter(time => time > windowStart);
    requests.push(now);
    requestCounts.set(ip, requests);
    
    if (requests.length > 100) { // 100 запросов в минуту
        return res.status(429).json({
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED'
        });
    }
    
    next();
});

// WebSocket handling
const webSocketService = new WebSocketService(io);
webSocketService.initialize();

// ---> НАЧАЛО ИЗМЕНЕНИЙ
// Сделаем io (экземпляр Socket.IO) доступным для всех роутов
app.use((req, res, next) => {
    req.io = io;
    next();
});
// <--- КОНЕЦ ИЗМЕНЕНИЙ

// Роуты
console.log('🛣️  Setting up routes...');

// Публичные роуты (без аутентификации)
app.use('/api/auth', authRoutes);

// Защищенные роуты (требуют JWT токен)
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chats', chatRoutes);

// Health check (публичный)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Nickname Messenger Backend is running!',
        version: '1.0.0',
        authentication: 'JWT enabled'
    });
});

// API информация (публичная)
app.get('/', (req, res) => {
    res.json({ 
        message: 'Welcome to Nickname Messenger API',
        version: '1.0.0',
        // ... (остальная часть без изменений)
    });
});

// Обработка ошибок JWT
app.use((error, req, res, next) => {
    if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
    next(error);
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        requestedPath: req.originalUrl
    });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error('💥 Error:', err);
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let code = err.code || 'INTERNAL_ERROR';
    
    // ... (остальная часть без изменений)
    
    res.status(statusCode).json({
        error: message,
        code: code,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`📡 API docs: http://localhost:${PORT}/`);
    console.log(`🔐 JWT Authentication: ENABLED`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    setInterval(() => {
        requestCounts.clear();
    }, 60000);
});

process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Process terminated');
        mongoose.connection.close();
    });
});

module.exports = app;