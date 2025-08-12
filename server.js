// =====================================================
// ФАЙЛ: server.js (BACKEND) - UPDATED WITH ERROR HANDLING
// ПУТЬ: nickname-messenger-backend/server.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Главный файл сервера с улучшенной обработкой ошибок
// =====================================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// НОВОЕ: Импортируем middleware
const { authenticateToken } = require('./middleware/auth');
const { errorHandler, asyncHandler, AppError } = require('./middleware/errorHandler');

// Импортируем роуты
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const chatRoutes = require('./routes/chats');

// НОВОЕ: Импортируем обновленный WebSocket сервис
const WebSocketService = require('./services/websocket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// НОВОЕ: Глобальная обработка необработанных ошибок
process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
    console.error(error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 UNHANDLED REJECTION! Shutting down...');
    console.error(error);
    server.close(() => {
        process.exit(1);
    });
});

// Middleware для безопасности
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (мобильные приложения)
        if (!origin) return callback(null, true);
        
        // Разрешаем все origins в development
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // В продакшене добавьте конкретные домены
        const allowedOrigins = [
            'https://your-frontend-domain.com',
            'http://localhost:3000'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new AppError('Not allowed by CORS', 403, 'CORS_ERROR'));
        }
    },
    credentials: true
}));

app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// НОВОЕ: Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(30000, () => {
        const err = new AppError('Request timeout', 408, 'REQUEST_TIMEOUT');
        next(err);
    });
    next();
});

// НОВОЕ: Middleware для логирования запросов с деталями
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    req.requestId = requestId;
    
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip} - ID: ${requestId}`);
    
    // Логируем тело запроса в development
    if (process.env.NODE_ENV === 'development' && req.body && Object.keys(req.body).length > 0) {
        console.log(`📦 Request body:`, JSON.stringify(req.body, null, 2));
    }
    
    // Логируем авторизационные заголовки (без токена)
    if (req.headers.authorization) {
        console.log(`🔐 Authorization header present - ID: ${requestId}`);
    }
    
    // Засекаем время выполнения
    const startTime = Date.now();
    
    // Перехватываем response для логирования
    const originalSend = res.send;
    res.send = function(data) {
        const responseTime = Date.now() - startTime;
        console.log(`[${timestamp}] Response ${res.statusCode} - Time: ${responseTime}ms - ID: ${requestId}`);
        originalSend.call(this, data);
    };
    
    next();
});

// Connect to MongoDB с обработкой ошибок
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nickname-messenger', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ Connected to MongoDB');
    console.log('🔐 JWT Authentication enabled');
    console.log('🛡️ Error handling enabled');
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// MongoDB connection error handling
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
});

// НОВОЕ: Rate limiting информация
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
        return next(new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED'));
    }
    
    next();
});

// НОВОЕ: Защищенные и незащищенные роуты с обработкой ошибок
console.log('🛣️  Setting up routes with error handling...');

// Публичные роуты (без аутентификации)
app.use('/api/auth', authRoutes);

// НОВОЕ: Защищенные роуты (требуют JWT токен)
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chats', chatRoutes);

// Health check с дополнительной информацией
app.get('/health', asyncHandler(async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Nickname Messenger Backend is running!',
        version: '1.0.0',
        authentication: 'JWT enabled',
        database: dbStatus,
        memory: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
        },
        uptime: `${Math.floor(uptime / 60)} minutes`,
        environment: process.env.NODE_ENV || 'development'
    });
}));

// API информация (публичная)
app.get('/', (req, res) => {
    res.json({ 
        message: 'Welcome to Nickname Messenger API',
        version: '1.0.0',
        authentication: 'JWT Bearer Token required for protected endpoints',
        errorHandling: 'Centralized error handling enabled',
        rateLimit: '100 requests per minute per IP',
        endpoints: {
            public: {
                health: 'GET /health',
                auth: {
                    register: 'POST /api/auth/register',
                    login: 'POST /api/auth/login',
                    checkNickname: 'POST /api/auth/check-nickname',
                    validateTronAddress: 'POST /api/auth/validate-tron-address',
                    validateCryptoAmount: 'POST /api/auth/validate-crypto-amount'
                },
                users: {
                    getByNickname: 'GET /api/users/nickname/:nickname',
                    getByAddress: 'GET /api/users/address/:address'
                }
            },
            protected: {
                auth: {
                    me: 'GET /api/auth/me',
                    logout: 'POST /api/auth/logout',
                    refresh: 'POST /api/auth/refresh'
                },
                users: {
                    search: 'GET /api/users/search',
                    updateProfile: 'PUT /api/users/profile',
                    deleteAccount: 'DELETE /api/users/account'
                },
                chats: {
                    create: 'POST /api/chats/create',
                    getUserChats: 'GET /api/chats/user/:userId',
                    getMyChats: 'GET /api/chats/my',
                    getChatInfo: 'GET /api/chats/:chatId',
                    chatStats: 'GET /api/chats/:chatId/stats',
                    leaveChat: 'POST /api/chats/:chatId/leave'
                },
                messages: {
                    send: 'POST /api/messages/send',
                    getMessages: 'GET /api/messages/:chatId',
                    updateStatus: 'PUT /api/messages/:messageId/status',
                    markAsRead: 'POST /api/messages/:chatId/mark-read',
                    deleteMessage: 'DELETE /api/messages/:messageId',
                    search: 'GET /api/messages/:chatId/search'
                }
            }
        },
        errorCodes: {
            VALIDATION_ERROR: 'Invalid input data',
            UNAUTHORIZED: 'Authentication required',
            FORBIDDEN: 'Access denied',
            NOT_FOUND: 'Resource not found',
            DUPLICATE_ENTRY: 'Resource already exists',
            RATE_LIMIT_EXCEEDED: 'Too many requests',
            INTERNAL_ERROR: 'Server error',
            TOKEN_EXPIRED: 'JWT token expired',
            INVALID_TOKEN: 'Invalid JWT token'
        }
    });
});

// 404 handler
app.use('*', (req, res, next) => {
    const err = new AppError(`Endpoint not found: ${req.originalUrl}`, 404, 'NOT_FOUND');
    next(err);
});

// НОВОЕ: Centralized error handling middleware
app.use((err, req, res, next) => {
    // Установка дефолтных значений
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    err.code = err.code || 'INTERNAL_ERROR';
    
    // Логирование ошибки
    if (err.statusCode >= 500) {
        console.error('💥 ERROR:', err);
        console.error('Stack:', err.stack);
    } else {
        console.log('⚠️ Error:', err.message);
    }
    
    // Специальная обработка для разных типов ошибок
    if (err.name === 'ValidationError') {
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        
        // Извлекаем детали валидации из Mongoose
        const errors = Object.values(err.errors).map(e => e.message);
        err.message = `Validation Error: ${errors.join(', ')}`;
    }
    
    if (err.name === 'CastError') {
        err.statusCode = 400;
        err.code = 'INVALID_ID';
        err.message = 'Invalid ID format';
    }
    
    if (err.code === 11000) {
        err.statusCode = 409;
        err.code = 'DUPLICATE_ENTRY';
        const field = Object.keys(err.keyValue)[0];
        err.message = `${field} already exists`;
    }
    
    if (err.name === 'JsonWebTokenError') {
        err.statusCode = 401;
        err.code = 'INVALID_TOKEN';
        err.message = 'Invalid token';
    }
    
    if (err.name === 'TokenExpiredError') {
        err.statusCode = 401;
        err.code = 'TOKEN_EXPIRED';
        err.message = 'Token expired';
    }
    
    // Отправка ответа
    res.status(err.statusCode).json({
        status: err.status,
        error: err.message,
        code: err.code,
        requestId: req.requestId,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            details: err
        })
    });
});

// НОВОЕ: WebSocket handling с error handling
const webSocketService = new WebSocketService(io);
webSocketService.initialize();

// WebSocket error handling
io.on('error', (error) => {
    console.error('🔌 WebSocket error:', error);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on ${HOST}:${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`📡 API docs: http://localhost:${PORT}/`);
    console.log(`🔐 JWT Authentication: ENABLED`);
    console.log(`🛡️ Error Handling: ENABLED`);
    console.log(`🚦 Rate Limiting: 100 req/min`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Периодическая очистка rate limit счетчиков
    setInterval(() => {
        requestCounts.clear();
    }, 60000);
});

// Graceful shutdown с обработкой ошибок
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} received, starting graceful shutdown...`);
    
    server.close(() => {
        console.log('✅ HTTP server closed');
        
        mongoose.connection.close(false, () => {
            console.log('✅ MongoDB connection closed');
            process.exit(0);
        });
    });
    
    // Принудительное завершение через 10 секунд
    setTimeout(() => {
        console.error('⚠️ Forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;