// =====================================================
// ФАЙЛ: server.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/server.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Обновленный главный файл сервера с JWT middleware
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
    }
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
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// НОВОЕ: Middleware для логирования запросов
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    
    // Логируем авторизационные заголовки (без токена)
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

// НОВОЕ: Защищенные и незащищенные роуты
console.log('🛣️  Setting up routes...');

// Публичные роуты (без аутентификации)
app.use('/api/auth', authRoutes);

// НОВОЕ: Защищенные роуты (требуют JWT токен)
app.use('/api/users', userRoutes); // Некоторые endpoint'ы защищены внутри
app.use('/api/messages', messageRoutes); // Все endpoint'ы защищены
app.use('/api/chats', chatRoutes); // Все endpoint'ы защищены

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
        authentication: 'JWT Bearer Token required for protected endpoints',
        endpoints: {
            public: {
                health: 'GET /health',
                auth: {
                    register: 'POST /api/auth/register',
                    login: 'POST /api/auth/login',
                    checkNickname: 'POST /api/auth/check-nickname'
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
                    getChatInfo: 'GET /api/chats/:chatId'
                },
                messages: {
                    send: 'POST /api/messages/send',
                    getMessages: 'GET /api/messages/:chatId',
                    markAsRead: 'POST /api/messages/:chatId/mark-read',
                    search: 'GET /api/messages/:chatId/search'
                }
            }
        }
    });
});

// НОВОЕ: Middleware для обработки ошибок JWT
app.use((error, req, res, next) => {
    if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
    
    console.error('💥 Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        requestedPath: req.originalUrl
    });
});

// НОВОЕ: WebSocket handling с JWT аутентификацией
const webSocketService = new WebSocketService(io);
webSocketService.initialize();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`📡 API docs: http://localhost:${PORT}/`);
    console.log(`🔐 JWT Authentication: ENABLED`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Process terminated');
        mongoose.connection.close();
    });
});

module.exports = app;