// =====================================================
// ФАЙЛ: routes/auth.js (BACKEND)  
// ПУТЬ: nickname-messenger-backend/routes/auth.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Обновленные роуты аутентификации с JWT
// =====================================================

const express = require('express');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Регистрация пользователя (возвращает JWT токен)
router.post('/register', async (req, res) => {
    try {
        const { id, nickname, publicKey, tronAddress, firstName, lastName, avatar } = req.body;

        console.log('🚀 Registration request received:');
        console.log('   - ID:', id);
        console.log('   - Nickname:', nickname);

        if (!nickname || !publicKey || !tronAddress) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey, tronAddress'
            });
        }

        // Проверяем существование пользователя
        const existingUser = await User.findOne({
            $or: [
                { nickname }, 
                { publicKey }, 
                { tronAddress }
            ]
        });

        if (existingUser) {
            let field;
            if (existingUser.nickname === nickname) field = 'nickname';
            else if (existingUser.publicKey === publicKey) field = 'publicKey';
            else field = 'tronAddress';
            
            console.log(`❌ User already exists with ${field}`);
            return res.status(409).json({
                error: `User with this ${field} already exists`
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

        // НОВОЕ: Генерируем JWT токен
        const token = generateToken(user._id);

        console.log('✅ User registered successfully:', user.nickname);

        res.status(201).json({
            message: 'User registered successfully',
            token: token, // НОВОЕ: Возвращаем JWT токен
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
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// НОВЫЙ: Вход пользователя (возвращает JWT токен)
router.post('/login', async (req, res) => {
    try {
        const { nickname, publicKey } = req.body;

        console.log('🔐 Login request received:');
        console.log('   - Nickname:', nickname);

        if (!nickname || !publicKey) {
            return res.status(400).json({
                error: 'Missing required fields: nickname and publicKey'
            });
        }

        // Находим пользователя
        const user = await User.findOne({ 
            nickname: nickname,
            publicKey: publicKey 
        });

        if (!user) {
            console.log('❌ User not found or invalid credentials');
            return res.status(401).json({
                error: 'Invalid credentials'
            });
        }

        // Генерируем JWT токен
        const token = generateToken(user._id);

        // Обновляем статус онлайн
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        console.log('✅ User logged in successfully:', user.nickname);

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
                isOnline: user.isOnline,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// НОВЫЙ: Выход пользователя (требует аутентификации)
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        console.log('🚪 Logout request for user:', req.user.nickname);

        // Обновляем статус пользователя
        await User.findByIdAndUpdate(req.user.id, {
            isOnline: false,
            lastSeen: new Date()
        });

        console.log('✅ User logged out successfully:', req.user.nickname);

        res.json({
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// НОВЫЙ: Проверка токена и получение данных пользователя
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log('👤 Getting user data for:', req.user.nickname);

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

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
                isOnline: user.isOnline,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Get user data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// НОВЫЙ: Обновление токена
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        console.log('🔄 Token refresh for user:', req.user.nickname);

        // Генерируем новый токен
        const newToken = generateToken(req.user.id);

        res.json({
            message: 'Token refreshed successfully',
            token: newToken,
            tokenType: 'Bearer',
            expiresIn: '7d'
        });

    } catch (error) {
        console.error('❌ Token refresh error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Проверка доступности nickname (БЕЗ аутентификации)
router.post('/check-nickname', async (req, res) => {
    try {
        const { nickname } = req.body;

        if (!nickname) {
            return res.status(400).json({ error: 'Nickname is required' });
        }

        const existingUser = await User.findOne({ nickname });
        
        res.json({
            available: !existingUser,
            nickname
        });

    } catch (error) {
        console.error('❌ Nickname check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
