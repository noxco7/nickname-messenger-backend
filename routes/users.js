// =====================================================
// ФАЙЛ: routes/users.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/routes/users.js  
// ТИП: Node.js Backend
// ОПИСАНИЕ: Защищенные пользователями роуты с JWT
// =====================================================

const express = require('express');
const User = require('../models/User');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// Get user by nickname (БЕЗ аутентификации - публичная информация)
router.get('/nickname/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        
        console.log(`👤 Looking for user with nickname: ${nickname}`);
        
        const user = await User.findOne({ nickname }).select('-__v');
        
        if (!user) {
            console.log(`❌ User not found: ${nickname}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ User found: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by nickname error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user by TRON address (БЕЗ аутентификации - для восстановления аккаунта)
router.get('/address/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        console.log(`🏠 Looking for user with address: ${address}`);
        
        const user = await User.findOne({ tronAddress: address }).select('-__v');
        
        if (!user) {
            console.log(`❌ User not found by address: ${address}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ User found by address: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by address error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        console.log(`📄 Page: ${page}, Limit: ${limit}, Skip: ${skip}`);
        
        if (!query || query.trim().length === 0) {
            console.log('⚠️ Empty search query');
            return res.json({
                users: [],
                total: 0,
                page,
                limit
            });
        }
        
        const trimmedQuery = query.trim();
        const searchRegex = new RegExp(trimmedQuery, 'i');
        
        // НОВОЕ: Исключаем текущего пользователя из результатов поиска
        const searchCriteria = {
            $and: [
                {
                    $or: [
                        { nickname: searchRegex },
                        { firstName: searchRegex },
                        { lastName: searchRegex }
                    ]
                },
                {
                    _id: { $ne: req.user.id } // Исключаем текущего пользователя
                }
            ]
        };
        
        console.log('🔎 Search criteria:', JSON.stringify(searchCriteria, null, 2));
        
        const users = await User.find(searchCriteria)
            .select('_id nickname firstName lastName avatar isOnline createdAt publicKey tronAddress')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
        
        const total = await User.countDocuments(searchCriteria);
        
        console.log(`✅ Found ${users.length} users (total: ${total}) excluding current user`);
        
        users.forEach(user => {
            console.log(`   - ${user.nickname} (${user.firstName || 'No first name'} ${user.lastName || 'No last name'})`);
        });
        
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
                displayName: user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.nickname
            })),
            total,
            page,
            limit
        });
        
    } catch (error) {
        console.error('❌ Search users error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            users: [],
            total: 0,
            page: 1,
            limit: 20 
        });
    }
});

// Get all users (ЗАЩИЩЕНО - только для админов или отладки)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;
        
        console.log(`👥 Getting all users (limit: ${limit}, skip: ${skip}) by user: ${req.user.nickname}`);
        
        const users = await User.find({})
            .select('nickname firstName lastName avatar isOnline createdAt')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
        
        const total = await User.countDocuments({});
        
        console.log(`✅ Found ${users.length} users (total: ${total})`);
        
        res.json({
            users,
            total,
            limit,
            skip
        });
        
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        );
        
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ Profile updated for user: ${updatedUser.nickname}`);
        
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser._id,
                nickname: updatedUser.nickname,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                avatar: updatedUser.avatar,
                publicKey: updatedUser.publicKey,
                tronAddress: updatedUser.tronAddress,
                isOnline: updatedUser.isOnline,
                updatedAt: updatedUser.updatedAt
            }
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user account (ЗАЩИЩЕНО - только свой аккаунт)
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`🗑️ Deleting account for user: ${req.user.nickname}`);
        
        // Найдем пользователя
        const user = await User.findById(userId);
        if (!user) {
            console.log(`❌ User not found: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`🗑️ Found user to delete: ${user.nickname}`);
        
        // Удаляем связанные данные
        try {
            const Chat = require('../models/Chat');
            const deletedChats = await Chat.deleteMany({ participants: userId });
            console.log(`🗑️ Deleted ${deletedChats.deletedCount} chats`);
            
            const Message = require('../models/Message');
            const deletedMessages = await Message.deleteMany({ senderId: userId });
            console.log(`🗑️ Deleted ${deletedMessages.deletedCount} messages`);
            
        } catch (error) {
            console.log(`⚠️ Error deleting related data: ${error.message}`);
        }
        
        // Удаляем пользователя
        await User.findByIdAndDelete(userId);
        
        console.log(`✅ Account and all related data deleted: ${user.nickname}`);
        
        res.json({ 
            message: 'Account deleted successfully',
            deletedUser: {
                id: userId,
                nickname: user.nickname
            }
        });
        
    } catch (error) {
        console.error('❌ Delete account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
