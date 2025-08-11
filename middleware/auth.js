// =====================================================
// ФАЙЛ: middleware/auth.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/middleware/auth.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: JWT middleware для защиты API endpoints
// =====================================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Секретный ключ для JWT (в продакшене должен быть в .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : null;

        if (!token) {
            console.log('❌ No token provided');
            return res.status(401).json({ 
                error: 'Access denied. No token provided.',
                code: 'NO_TOKEN' 
            });
        }

        console.log('🔐 Verifying token...');
        
        // Проверяем токен
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Проверяем существование пользователя
        const user = await User.findOne({ _id: decoded.userId });
        if (!user) {
            console.log('❌ User not found for token');
            return res.status(401).json({ 
                error: 'Invalid token. User not found.',
                code: 'USER_NOT_FOUND' 
            });
        }

        // Добавляем пользователя в request
        req.user = {
            id: user._id,
            nickname: user.nickname,
            publicKey: user.publicKey,
            tronAddress: user.tronAddress
        };

        console.log(`✅ Token verified for user: ${user.nickname}`);
        next();

    } catch (error) {
        console.log('❌ Token verification failed:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expired. Please login again.',
                code: 'TOKEN_EXPIRED' 
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Invalid token format.',
                code: 'INVALID_TOKEN' 
            });
        }

        return res.status(401).json({ 
            error: 'Token verification failed.',
            code: 'TOKEN_ERROR' 
        });
    }
};

// Функция для генерации JWT токена
const generateToken = (userId) => {
    const payload = {
        userId: userId,
        iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, JWT_SECRET, { 
        expiresIn: JWT_EXPIRES_IN 
    });

    console.log(`🔑 Generated token for user: ${userId}`);
    return token;
};

// Функция для проверки токена без middleware (для WebSocket)
const verifyToken = async (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ _id: decoded.userId });
        
        if (!user) {
            throw new Error('User not found');
        }

        return {
            id: user._id,
            nickname: user.nickname,
            publicKey: user.publicKey,
            tronAddress: user.tronAddress
        };
    } catch (error) {
        throw new Error('Invalid token');
    }
};

// Опциональная аутентификация (не требует токен, но проверяет если есть)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : null;

        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findOne({ _id: decoded.userId });
            
            if (user) {
                req.user = {
                    id: user._id,
                    nickname: user.nickname,
                    publicKey: user.publicKey,
                    tronAddress: user.tronAddress
                };
            }
        }

        next();
    } catch (error) {
        // Игнорируем ошибки для опциональной аутентификации
        next();
    }
};

module.exports = {
    authenticateToken,
    generateToken,
    verifyToken,
    optionalAuth,
    JWT_SECRET
};
