const express = require('express');
const User = require('../models/User');
const router = express.Router();

router.get('/nickname/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        
        const user = await User.findOne({ nickname }).select('-__v');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
        
    } catch (error) {
        console.error('Get user by nickname error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/address/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        const user = await User.findOne({ tronAddress: address }).select('-__v');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
        
    } catch (error) {
        console.error('Get user by address error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        
        const users = await User.find({
            nickname: { $regex: query, $options: 'i' }
        })
        .select('nickname firstName lastName avatar isOnline')
        .limit(limit);
        
        res.json(users);
        
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
