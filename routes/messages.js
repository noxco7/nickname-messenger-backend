const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const router = express.Router();

router.post('/send', async (req, res) => {
    try {
        const {
            chatId,
            senderId,
            content,
            messageType = 'text',
            cryptoAmount,
            transactionHash,
            transactionStatus
        } = req.body;
        
        if (!chatId || !senderId || !content) {
            return res.status(400).json({
                error: 'Missing required fields: chatId, senderId, content'
            });
        }
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!chat.participants.includes(senderId)) {
            return res.status(403).json({ error: 'Not authorized to send message to this chat' });
        }
        
        const messageData = { chatId, senderId, content, messageType };
        
        if (messageType === 'crypto') {
            if (cryptoAmount) messageData.cryptoAmount = cryptoAmount;
            if (transactionHash) messageData.transactionHash = transactionHash;
            if (transactionStatus) messageData.transactionStatus = transactionStatus;
        }
        
        const message = new Message(messageData);
        await message.save();
        
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            lastMessageAt: new Date()
        });
        
        await message.populate('senderId', 'nickname firstName lastName');
        
        res.status(201).json(message);
        
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const messages = await Message.find({ chatId })
            .populate('senderId', 'nickname firstName lastName avatar')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset);
        
        res.json(messages.reverse());
        
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
