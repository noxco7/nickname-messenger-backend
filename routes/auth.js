// =====================================================
// ФАЙЛ: routes/auth.js (BACKEND) - FIXED REGISTRATION
// ПУТЬ: nickname-messenger-backend/routes/auth.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Исправленный роут регистрации для совместимости с iOS
// =====================================================

const express = require('express');
const User = require('../models/User');
const TronValidation = require('../utils/TronValidation');
const { generateToken, authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Регистрация пользователя
router.post('/register', async (req, res) => {
    try {
        const { id, nickname, publicKey, tronAddress, firstName, lastName, avatar } = req.body;

        console.log(`🚀 Registration request received:`);
        console.log(`   - ID: ${id}`);
        console.log(`   - Nickname: ${nickname}`);
        console.log(`   - TRON Address: ${tronAddress}`);

        // Валидация обязательных полей
        if (!nickname || !publicKey || !tronAddress) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey, tronAddress',
                code: 'MISSING_FIELDS'
            });
        }

        // Валидация nickname
        if (nickname.length < 3 || nickname.length > 20) {
            return res.status(400).json({
                error: 'Nickname must be between 3 and 20 characters',
                code: 'INVALID_NICKNAME'
            });
        }

        const nicknameRegex = /^[a-zA-Z0-9_]+$/;
        if (!nicknameRegex.test(nickname)) {
            return res.status(400).json({
                error: 'Nickname can only contain letters, numbers, and underscores',
                code: 'INVALID_NICKNAME_FORMAT'
            });
        }

        // Валидация TRON адреса
        if (!TronValidation.validateTronAddress(tronAddress)) {
            return res.status(400).json({
                error: 'Invalid TRON address format',
                code: 'INVALID_TRON_ADDRESS'
            });
        }

        // НОВОЕ: Подробная информация об адресе
        const addressInfo = {
            isValid: true,
            isUSDTContract: tronAddress === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            formatted: `${tronAddress.substring(0, 6)}...${tronAddress.substring(tronAddress.length - 6)}`,
            type: 'wallet'
        };

        console.log('✅ TRON address validated:', addressInfo);

        // Проверяем существующих пользователей
        const existingUser = await User.findOne({
            $or: [
                { nickname: nickname },
                { publicKey: publicKey },
                { tronAddress: tronAddress }
            ]
        });

        if (existingUser) {
            let field;
            if (existingUser.nickname === nickname) field = 'nickname';
            else if (existingUser.publicKey === publicKey) field = 'publicKey';
            else field = 'tronAddress';
            
            console.log(`❌ User already exists with ${field}`);
            return res.status(409).json({
                error: `User with this ${field} already exists`,
                code: 'USER_ALREADY_EXISTS',
                field: field
            });
        }

        // Создаем пользователя с UUID
        const userData = {
            _id: id || require('crypto').randomUUID(),
            nickname,
            publicKey,
            tronAddress,
            firstName: firstName || '',
            lastName: lastName || '',
            avatar: avatar || null
        };

        const user = new User(userData);
        await user.save();

        // Генерируем JWT токен
        const token = generateToken(user._id);

        console.log('✅ User registered successfully:', user.nickname);

        // ИСПРАВЛЕНО: Возвращаем только поля, которые ожидает клиент
        res.status(201).json({
            message: 'User registered successfully',
            token: token,
            tokenType: 'Bearer',
            expiresIn: '7d',
            user: {
                id: user._id,
                _id: user._id,  // Поддерживаем оба поля
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                tronAddressInfo: addressInfo,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
                // УБРАНО: isOnline, lastSeen, updatedAt для совместимости
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Логин пользователя
router.post('/login', async (req, res) => {
    try {
        const { nickname, publicKey } = req.body;

        console.log(`🔐 Login request: ${nickname}`);

        if (!nickname || !publicKey) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey',
                code: 'MISSING_FIELDS'
            });
        }

        // Поиск пользователя
        const user = await User.findOne({ nickname });
        if (!user) {
            console.log('❌ User not found');
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Проверяем публичный ключ
        if (user.publicKey !== publicKey) {
            console.log('❌ Invalid public key');
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Обновляем статус онлайн
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // Генерируем новый токен
        const token = generateToken(user._id);

        console.log('✅ User logged in successfully:', user.nickname);

        // ИСПРАВЛЕНО: Совместимый ответ
        res.json({
            message: 'Login successful',
            token: token,
            tokenType: 'Bearer',
            expiresIn: '7d',
            user: {
                id: user._id,
                _id: user._id,
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
                // УБРАНО: isOnline, lastSeen для совместимости
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Проверка доступности nickname
router.post('/check-nickname', async (req, res) => {
    try {
        const { nickname } = req.body;

        if (!nickname) {
            return res.status(400).json({
                error: 'Nickname is required',
                code: 'MISSING_NICKNAME'
            });
        }

        // Валидация длины
        if (nickname.length < 3 || nickname.length > 20) {
            return res.status(400).json({
                error: 'Nickname must be between 3 and 20 characters',
                code: 'INVALID_LENGTH'
            });
        }

        // Валидация формата
        const nicknameRegex = /^[a-zA-Z0-9_]+$/;
        if (!nicknameRegex.test(nickname)) {
            return res.status(400).json({
                error: 'Nickname can only contain letters, numbers, and underscores',
                code: 'INVALID_FORMAT'
            });
        }

        const existingUser = await User.findOne({ nickname });
        const available = !existingUser;

        console.log(`🔍 Nickname check: ${nickname} - ${available ? 'Available' : 'Taken'}`);

        res.json({
            available: available,
            nickname: nickname
        });

    } catch (error) {
        console.error('❌ Nickname check error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Получение информации о текущем пользователе (защищено)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log(`👤 Getting user info for: ${req.user.nickname}`);

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // ИСПРАВЛЕНО: Совместимый ответ
        res.json({
            user: {
                id: user._id,
                _id: user._id,
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Get user info error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Выход (защищено)
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        console.log(`👋 User logging out: ${req.user.nickname}`);

        // Обновляем статус пользователя
        await User.findByIdAndUpdate(req.user.id, {
            isOnline: false,
            lastSeen: new Date()
        });

        res.json({
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;