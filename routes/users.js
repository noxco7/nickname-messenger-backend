// =====================================================
// ФАЙЛ: routes/users.js (BACKEND) - УЛУЧШЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/routes/users.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Используем виртуальные поля модели для консистентности
// =====================================================

const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get user by nickname
router.get('/nickname/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        const user = await User.findOne({ nickname }).select('-__v');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user by ID (ЗАЩИЩЕНО)
router.get('/id/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('-__v');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user by TRON address
router.get('/address/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const user = await User.findOne({ tronAddress: address }).select('-__v');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search users (ЗАЩИЩЕНО)
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const query = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        if (query.trim().length === 0) {
            return res.json({ users: [], total: 0, page, limit });
        }
        
        const searchRegex = new RegExp(query.trim(), 'i');
        const searchCriteria = {
            $and: [
                {
                    $or: [
                        { nickname: searchRegex },
                        { firstName: searchRegex },
                        { lastName: searchRegex }
                    ]
                },
                { _id: { $ne: req.user.id } } // Исключаем текущего пользователя
            ]
        };
        
        const users = await User.find(searchCriteria)
            .select('_id nickname firstName lastName avatar isOnline createdAt publicKey tronAddress')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
        
        const total = await User.countDocuments(searchCriteria);
        
        // ИСПРАВЛЕНО: Теперь просто возвращаем объекты User,
        // модель сама позаботится о displayName и id через virtuals.
        res.json({ users, total, page, limit });
        
    } catch (error) {
        res.status(500).json({ 
            error: 'Internal server error',
            users: [],
            total: 0,
            page: 1,
            limit: 20 
        });
    }
});

// Update user profile (ЗАЩИЩЕНО)
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, avatar } = req.body;
        const updateData = {};
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (avatar !== undefined) updateData.avatar = avatar;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-__v');
        
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user account (ЗАЩИЩЕНО)
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Удаляем связанные данные (чаты, сообщения)
        const Chat = require('../models/Chat');
        await Chat.deleteMany({ participants: userId });
        const Message = require('../models/Message');
        await Message.deleteMany({ senderId: userId });
        
        // Удаляем пользователя
        await User.findByIdAndDelete(userId);
        
        res.json({ 
            message: 'Account deleted successfully'
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;