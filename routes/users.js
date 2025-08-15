// =====================================================
// ФАЙЛ: routes/users.js (BACKEND) - ПОЛНАЯ ВЕРСИЯ С DEBUG
// ПУТЬ: nickname-messenger-backend/routes/users.js  
// ОПИСАНИЕ: Добавлен debug endpoint для проверки токенов
// =====================================================

const express = require('express');
const User = require('../models/User');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { sendTestNotification, validateDeviceToken } = require('../services/pushNotificationService');
const router = express.Router();

// Регистрация токена устройства для push-уведомлений (ЗАЩИЩЕНО)
router.post('/register-device', authenticateToken, async (req, res) => {
    try {
        const { deviceToken } = req.body;
        const userId = req.user.id;

        if (!deviceToken) {
            return res.status(400).json({ 
                error: 'deviceToken is required',
                code: 'MISSING_TOKEN'
            });
        }

        console.log(`📱 Регистрация токена устройства для пользователя ${req.user.nickname}`);
        console.log(`   Токен: ${deviceToken.substring(0, 30)}...`);

        // Валидируем токен перед сохранением
        const isValid = await validateDeviceToken(deviceToken);
        if (!isValid) {
            console.log('❌ Токен невалидный, не сохраняем');
            return res.status(400).json({ 
                error: 'Invalid device token',
                code: 'INVALID_TOKEN'
            });
        }

        // Добавляем токен к пользователю, избегая дубликатов
        const result = await User.findByIdAndUpdate(
            userId,
            { $addToSet: { deviceTokens: deviceToken } },
            { new: true }
        );

        console.log(`✅ Токен зарегистрирован. Всего токенов у пользователя: ${result.deviceTokens.length}`);

        res.json({ 
            message: 'Device token registered successfully',
            tokenCount: result.deviceTokens.length
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации токена устройства:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// DEBUG: Получить токены пользователя (ЗАЩИЩЕНО)
router.get('/debug/tokens/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Проверяем что это свой аккаунт или админ
        if (req.user.id !== userId && req.user.nickname !== 'admin') {
            return res.status(403).json({ 
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        const tokens = user.deviceTokens || [];
        const tokenInfo = [];
        
        // Проверяем каждый токен
        for (const token of tokens) {
            const isValid = await validateDeviceToken(token);
            tokenInfo.push({
                token: token.substring(0, 30) + '...',
                isValid: isValid,
                length: token.length
            });
        }
        
        res.json({
            userId: user._id,
            nickname: user.nickname,
            tokenCount: tokens.length,
            tokens: tokenInfo
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения токенов:', error);
        res.status(500).json({ 
            error: error.message,
            code: 'INTERNAL_ERROR'
        });
    }
});

// DEBUG: Отправить тестовое уведомление (ЗАЩИЩЕНО)
router.post('/debug/test-notification', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
            return res.status(400).json({ 
                error: 'No device tokens found',
                code: 'NO_TOKENS'
            });
        }
        
        console.log(`📱 Отправка тестового уведомления для ${user.nickname}`);
        
        const results = [];
        for (const token of user.deviceTokens) {
            const success = await sendTestNotification(token);
            results.push({
                token: token.substring(0, 30) + '...',
                success: success
            });
        }
        
        res.json({
            message: 'Test notification sent',
            results: results
        });
        
    } catch (error) {
        console.error('❌ Ошибка отправки тестового уведомления:', error);
        res.status(500).json({ 
            error: error.message,
            code: 'INTERNAL_ERROR'
        });
    }
});

// Get user by nickname (БЕЗ аутентификации - публичная информация)
router.get('/nickname/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        
        console.log(`👤 Looking for user with nickname: ${nickname}`);
        
        const user = await User.findOne({ nickname }).select('-__v -deviceTokens');
        
        if (!user) {
            console.log(`❌ User not found: ${nickname}`);
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        console.log(`✅ User found: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by nickname error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Get user by ID (ЗАЩИЩЕНО - требует аутентификации)
router.get('/id/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`👤 Looking for user with ID: ${id}`);
        
        const user = await User.findById(id).select('-__v -deviceTokens');
        
        if (!user) {
            console.log(`❌ User not found by ID: ${id}`);
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        console.log(`✅ User found by ID: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by ID error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Get user by TRON address (БЕЗ аутентификации - для восстановления аккаунта)
router.get('/address/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        console.log(`🏠 Looking for user with address: ${address}`);
        
        const user = await User.findOne({ tronAddress: address }).select('-__v -deviceTokens');
        
        if (!user) {
            console.log(`❌ User not found by address: ${address}`);
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        console.log(`✅ User found by address: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by address error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Search users (С аутентификацией - чтобы исключить текущего пользователя)
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const query = req.query.q;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        console.log(`🔍 Searching users with query: "${query}" by user: ${req.user.nickname}`);
        
        if (!query || query.trim().length === 0) {
            return res.json({ users: [], total: 0, page, limit });
        }
        
        const trimmedQuery = query.trim();
        const searchRegex = new RegExp(trimmedQuery, 'i');
        
        const searchCriteria = {
            $and: [
                {
                    $or: [
                        { nickname: searchRegex },
                        { firstName: searchRegex },
                        { lastName: searchRegex }
                    ]
                },
                { _id: { $ne: req.user.id } }
            ]
        };
        
        const users = await User.find(searchCriteria)
            .select('_id nickname firstName lastName avatar isOnline createdAt publicKey tronAddress')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
        
        const total = await User.countDocuments(searchCriteria);
        
        console.log(`✅ Found ${users.length} users (total: ${total}) excluding current user`);
        
        res.json({
            users: users.map(user => ({
                id: user._id,
                nickname: user.nickname,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                avatar: user.avatar || '',
                isOnline: user.isOnline || false,
                publicKey: user.publicKey || '',
                tronAddress: user.tronAddress || '',
                createdAt: user.createdAt.toISOString(),
                displayName: user.displayName
            })),
            total,
            page,
            limit
        });
        
    } catch (error) {
        console.error('❌ Search users error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Update user profile (ЗАЩИЩЕНО - только свой профиль)
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, avatar } = req.body;
        
        console.log(`✏️ Updating profile for user: ${req.user.nickname}`);
        
        const updateData = {};
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (avatar !== undefined) updateData.avatar = avatar;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-deviceTokens -__v');
        
        if (!updatedUser) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        console.log(`✅ Profile updated for ${updatedUser.nickname}`);
        
        res.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Delete user account (ЗАЩИЩЕНО - только свой аккаунт)
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`🗑️ Deleting account for user: ${req.user.nickname}`);
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Удаляем связанные данные
        const Chat = require('../models/Chat');
        await Chat.deleteMany({ participants: userId });
        
        const Message = require('../models/Message');
        await Message.deleteMany({ senderId: userId });
        
        // Удаляем пользователя
        await User.findByIdAndDelete(userId);
        
        console.log(`✅ Account and all related data deleted: ${user.nickname}`);
        
        res.json({ 
            message: 'Account deleted successfully' 
        });
        
    } catch (error) {
        console.error('❌ Delete account error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;