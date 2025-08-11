// =====================================================
// ФАЙЛ: routes/chats.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/routes/chats.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Полные защищенные чаты роуты с JWT
// =====================================================

const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Создание чата (ЗАЩИЩЕНО)
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { participants } = req.body;
        const currentUserId = req.user.id;
        
        console.log('💬 Creating chat request received from user:', req.user.nickname);
        console.log('📝 Participants:', participants);
        
        if (!participants || !Array.isArray(participants) || participants.length !== 2) {
            console.log('❌ Invalid participants format');
            return res.status(400).json({ error: 'Exactly 2 participants required' });
        }
        
        // НОВОЕ: Проверяем что текущий пользователь является участником чата
        if (!participants.includes(currentUserId)) {
            console.log('❌ Current user not in participants list');
            return res.status(403).json({ error: 'You must be a participant in the chat' });
        }
        
        // Проверяем существующий чат
        const existingChat = await Chat.findOne({
            participants: { $all: participants },
            participants: { $size: 2 }
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
        
        // Создаем новый чат
        console.log('💬 Creating new chat with participants:', participants);
        
        const chat = new Chat({ 
            participants: participants,
            chatType: 'direct',
            isActive: true
        });
        
        await chat.save();
        console.log('✅ Chat created successfully:', chat._id);
        
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

// Получение чатов пользователя (ЗАЩИЩЕНО)
router.get('/user/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        // НОВОЕ: Проверяем что пользователь запрашивает свои чаты
        if (userId !== req.user.id) {
            console.log('❌ User trying to access another user\'s chats');
            return res.status(403).json({ error: 'Access denied. You can only view your own chats' });
        }
        
        console.log('💬 Getting chats for authenticated user:', req.user.nickname);
        
        const chats = await Chat.find({ 
            participants: userId,
            isActive: true 
        })
        .populate('lastMessage')
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Found ${chats.length} chats for user ${req.user.nickname}`);
        
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

// Получение своих чатов (ЗАЩИЩЕНО - упрощенный endpoint)
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        console.log('💬 Getting chats for authenticated user:', req.user.nickname);
        
        const chats = await Chat.find({ 
            participants: req.user.id,
            isActive: true 
        })
        .populate('lastMessage')
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Found ${chats.length} chats for user ${req.user.nickname}`);
        
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
        console.error('❌ Get my chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение информации о конкретном чате (ЗАЩИЩЕНО)
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`💬 Getting chat ${chatId} for user: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId).populate('lastMessage');
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // НОВОЕ: Проверяем что пользователь является участником чата
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        console.log(`✅ Chat found and user is participant`);
        
        res.json({
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
        console.error('❌ Get chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновление настроек чата (ЗАЩИЩЕНО)
router.put('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { isActive } = req.body;
        
        console.log(`✏️ Updating chat ${chatId} by user: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // Проверяем что пользователь является участником чата
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        // Обновляем разрешенные поля
        if (isActive !== undefined) {
            chat.isActive = isActive;
        }
        
        await chat.save();
        
        console.log(`✅ Chat updated: ${chatId}`);
        
        res.json({
            message: 'Chat updated successfully',
            chat: {
                _id: chat._id.toString(),
                participants: chat.participants,
                lastMessage: chat.lastMessage,
                lastMessageAt: chat.lastMessageAt,
                chatType: chat.chatType,
                isActive: chat.isActive,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Update chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Удаление чата (ЗАЩИЩЕНО - только участники)
router.delete('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`🗑️ Deleting chat ${chatId} by user: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // НОВОЕ: Проверяем что пользователь является участником чата
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        // Мягкое удаление - помечаем как неактивный
        chat.isActive = false;
        await chat.save();
        
        console.log(`✅ Chat marked as inactive: ${chatId}`);
        
        res.json({
            message: 'Chat deleted successfully',
            chatId: chatId
        });
        
    } catch (error) {
        console.error('❌ Delete chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение участников чата (ЗАЩИЩЕНО)
router.get('/:chatId/participants', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`👥 Getting participants for chat ${chatId} by user: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // Проверяем что пользователь является участником чата
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        // Получаем информацию об участниках (без приватных данных)
        const User = require('../models/User');
        const participants = await User.find({
            _id: { $in: chat.participants }
        }).select('_id nickname firstName lastName avatar isOnline lastSeen');
        
        console.log(`✅ Found ${participants.length} participants`);
        
        res.json({
            chatId: chatId,
            participants: participants.map(user => ({
                id: user._id,
                nickname: user.nickname,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                avatar: user.avatar || '',
                isOnline: user.isOnline || false,
                lastSeen: user.lastSeen,
                displayName: user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.nickname
            }))
        });
        
    } catch (error) {
        console.error('❌ Get chat participants error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Покинуть чат (ЗАЩИЩЕНО)
router.post('/:chatId/leave', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`🚪 User ${req.user.nickname} leaving chat ${chatId}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // Проверяем что пользователь является участником чата
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'You are not a participant of this chat' });
        }
        
        // Для direct чатов просто помечаем как неактивный
        if (chat.chatType === 'direct') {
            chat.isActive = false;
            await chat.save();
            
            console.log(`✅ Direct chat marked as inactive: ${chatId}`);
            
            return res.json({
                message: 'Left chat successfully',
                chatId: chatId
            });
        }
        
        // Для групповых чатов удаляем пользователя из участников
        chat.participants = chat.participants.filter(participantId => participantId !== req.user.id);
        
        // Если остался только один участник, помечаем чат как неактивный
        if (chat.participants.length <= 1) {
            chat.isActive = false;
        }
        
        await chat.save();
        
        console.log(`✅ User left group chat: ${chatId}`);
        
        res.json({
            message: 'Left chat successfully',
            chatId: chatId,
            remainingParticipants: chat.participants.length
        });
        
    } catch (error) {
        console.error('❌ Leave chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Статистика чата (ЗАЩИЩЕНО)
router.get('/:chatId/stats', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`📊 Getting stats for chat ${chatId} by user: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // Проверяем что пользователь является участником чата
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        // Получаем статистику сообщений
        const Message = require('../models/Message');
        
        const totalMessages = await Message.countDocuments({ chatId });
        const userMessages = await Message.countDocuments({ 
            chatId, 
            senderId: req.user.id 
        });
        
        const firstMessage = await Message.findOne({ chatId })
            .sort({ createdAt: 1 })
            .select('createdAt senderId');
            
        const lastMessage = await Message.findOne({ chatId })
            .sort({ createdAt: -1 })
            .select('createdAt senderId');
        
        // Сообщения по типам
        const messagesByType = await Message.aggregate([
            { $match: { chatId: chat._id } },
            { $group: { _id: '$messageType', count: { $sum: 1 } } }
        ]);
        
        console.log(`✅ Chat stats calculated for ${chatId}`);
        
        res.json({
            chatId: chatId,
            stats: {
                totalMessages,
                userMessages,
                otherMessages: totalMessages - userMessages,
                firstMessageAt: firstMessage?.createdAt || null,
                lastMessageAt: lastMessage?.createdAt || null,
                messagesByType: messagesByType.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                chatCreatedAt: chat.createdAt,
                isActive: chat.isActive
            }
        });
        
    } catch (error) {
        console.error('❌ Get chat stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;