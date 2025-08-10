const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const router = express.Router();

router.post('/create', async (req, res) => {
    try {
        const { participants } = req.body;
        
        console.log('💬 Creating chat request received');
        console.log('📝 Participants:', participants);
        
        if (!participants || !Array.isArray(participants) || participants.length !== 2) {
            console.log('❌ Invalid participants format');
            return res.status(400).json({ error: 'Exactly 2 participants required' });
        }
        
        // ИСПРАВЛЕНО: Ищем существующий чат по participants (не по _id)
        const existingChat = await Chat.findOne({
            participants: { $all: participants },
            participants: { $size: 2 } // Убеждаемся что это direct чат
        }).populate('lastMessage');
        
        if (existingChat) {
            console.log('✅ Found existing chat:', existingChat._id);
            return res.json({
                _id: existingChat._id.toString(),
                participants: existingChat.participants,
                lastMessage: existingChat.lastMessage,
                lastMessageAt: existingChat.lastMessageAt,
                chatType: existingChat.chatType,
                isActive: existingChat.isActive,
                createdAt: existingChat.createdAt,
                updatedAt: existingChat.updatedAt
            });
        }
        
        // ИСПРАВЛЕНО: Не проверяем существование пользователей по _id
        // Вместо этого просто создаем чат с переданными participant ID
        console.log('💬 Creating new chat with participants:', participants);
        
        const chat = new Chat({ 
            participants: participants,
            chatType: 'direct',
            isActive: true
        });
        
        await chat.save();
        console.log('✅ Chat created successfully:', chat._id);
        
        // Возвращаем чат в формате, ожидаемом клиентом
        res.status(201).json({
            _id: chat._id.toString(),
            participants: chat.participants,
            lastMessage: chat.lastMessage,
            lastMessageAt: chat.lastMessageAt,
            chatType: chat.chatType,
            isActive: chat.isActive,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
        });
        
    } catch (error) {
        console.error('❌ Create chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        console.log('💬 Getting chats for user:', userId);
        
        // ИСПРАВЛЕНО: Ищем чаты по participants (строковый массив)
        const chats = await Chat.find({ 
            participants: userId,
            isActive: true 
        })
        .populate('lastMessage')
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Found ${chats.length} chats for user ${userId}`);
        
        // Форматируем ответ для клиента
        const formattedChats = chats.map(chat => ({
            _id: chat._id.toString(),
            participants: chat.participants,
            lastMessage: chat.lastMessage,
            lastMessageAt: chat.lastMessageAt,
            chatType: chat.chatType,
            isActive: chat.isActive,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
        }));
        
        res.json(formattedChats);
        
    } catch (error) {
        console.error('❌ Get user chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;