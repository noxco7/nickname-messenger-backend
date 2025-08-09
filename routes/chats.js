const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const router = express.Router();

router.post('/create', async (req, res) => {
    try {
        const { participants } = req.body;
        
        if (!participants || !Array.isArray(participants) || participants.length !== 2) {
            return res.status(400).json({ error: 'Exactly 2 participants required' });
        }
        
        const existingChat = await Chat.findOne({
            participants: { $all: participants }
        }).populate('participants', 'nickname firstName lastName avatar')
          .populate('lastMessage');
        
        if (existingChat) {
            return res.json(existingChat);
        }
        
        const users = await User.find({ _id: { $in: participants } });
        if (users.length !== 2) {
            return res.status(404).json({ error: 'One or more participants not found' });
        }
        
        const chat = new Chat({ participants });
        await chat.save();
        
        await chat.populate('participants', 'nickname firstName lastName avatar');
        
        res.status(201).json(chat);
        
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const chats = await Chat.find({ participants: userId })
            .populate('participants', 'nickname firstName lastName avatar isOnline')
            .populate('lastMessage')
            .sort({ lastMessageAt: -1 })
            .limit(limit)
            .skip(offset);
        
        res.json(chats);
        
    } catch (error) {
        console.error('Get user chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
