const express = require('express');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { nickname, publicKey, tronAddress } = req.body;

        if (!nickname || !publicKey || !tronAddress) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey, tronAddress'
            });
        }

        const existingUser = await User.findOne({
            $or: [{ nickname }, { publicKey }, { tronAddress }]
        });

        if (existingUser) {
            let field;
            if (existingUser.nickname === nickname) field = 'nickname';
            else if (existingUser.publicKey === publicKey) field = 'publicKey';
            else field = 'tronAddress';
            
            return res.status(409).json({
                error: `User with this ${field} already exists`
            });
        }

        const user = new User({ nickname, publicKey, tronAddress });
        await user.save();

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
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
        console.error('Nickname check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
