const express = require('express');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { id, nickname, publicKey, tronAddress, firstName, lastName, avatar } = req.body;

        console.log('🚀 Registration request received:');
        console.log('   - ID:', id);
        console.log('   - Nickname:', nickname);
        console.log('   - TRON Address:', tronAddress);

        if (!nickname || !publicKey || !tronAddress) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey, tronAddress'
            });
        }

        // ИСПРАВЛЕНО: Проверяем существование пользователя
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
            
            console.log(`❌ User already exists with ${field}:`, existingUser[field]);
            return res.status(409).json({
                error: `User with this ${field} already exists`
            });
        }

        // ИСПРАВЛЕНО: Создаем пользователя с переданным ID или генерируем новый
        const userData = {
            _id: id || require('crypto').randomUUID(), // Используем переданный ID или генерируем UUID
            nickname,
            publicKey,
            tronAddress,
            firstName: firstName || '',
            lastName: lastName || '',
            avatar: avatar || null
        };

        const user = new User(userData);
        await user.save();

        console.log('✅ User registered successfully:', user.nickname);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                _id: user._id, // Для совместимости
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