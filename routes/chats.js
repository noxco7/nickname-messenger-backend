// =====================================================
// ФАЙЛ: routes/chats.js (BACKEND) - ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/routes/chats.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Исправленные чаты роуты с правильным возвратом lastMessage как String ID
// =====================================================

const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Вспомогательная функция для нормализации UUID
function normalizeUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return uuid;
    return uuid.toUpperCase();
}

// Вспомогательная функция для нормализации массива UUID
function normalizeUUIDs(uuids) {
    if (!Array.isArray(uuids)) return uuids;
    return uuids.map(uuid => normalizeUUID(uuid));
}

// Вспомогательная функция для проверки доступа к чату
function checkChatAccess(chat, userId) {
    const userIdNormalized = normalizeUUID(userId);
    const participantsNormalized = normalizeUUIDs(chat.participants);
    
    console.log('🔍 DEBUGGING CHAT ACCESS:');
    console.log('   - User ID (normalized):', userIdNormalized);
    console.log('   - Chat participants (normalized):', participantsNormalized);
    
    const hasAccess = participantsNormalized.includes(userIdNormalized);
    console.log('   - Has access:', hasAccess);
    
    return hasAccess;
}

// Вспомогательная функция для форматирования чата (БЕЗ populate lastMessage)
function formatChatResponse(chat) {
    return {
        _id: chat._id.toString(),
        participants: chat.participants,
        lastMessage: chat.lastMessage ? chat.lastMessage.toString() : null, // ТОЛЬКО ID как String
        lastMessageAt: chat.lastMessageAt,
        chatType: chat.chatType,
        isActive: chat.isActive,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
    };
}

// Создание чата (ЗАЩИЩЕНО)
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { participants } = req.body;
        const currentUserId = req.user.id;
        
        console.log('💬 Creating chat request received from user:', req.user.nickname);
        console.log('📝 Original participants:', participants);
        console.log('🔐 Current user ID from JWT:', currentUserId);
        
        if (!participants || !Array.isArray(participants) || participants.length !== 2) {
            console.log('❌ Invalid participants format');
            return res.status(400).json({ error: 'Exactly 2 participants required' });
        }
        
        // ИСПРАВЛЕНО: Нормализуем все UUID к uppercase
        const normalizedParticipants = normalizeUUIDs(participants);
        const normalizedCurrentUserId = normalizeUUID(currentUserId);
        
        console.log('🔄 NORMALIZATION:');
        console.log('   - Original participants:', participants);
        console.log('   - Normalized participants:', normalizedParticipants);
        console.log('   - Original current user ID:', currentUserId);
        console.log('   - Normalized current user ID:', normalizedCurrentUserId);
        
        // Проверяем что текущий пользователь является участником чата
        if (!normalizedParticipants.includes(normalizedCurrentUserId)) {
            console.log('❌ Current user not in participants list');
            return res.status(403).json({ error: 'You must be a participant in the chat' });
        }
        
        // Сортируем участников для консистентного поиска
        const sortedParticipants = [...normalizedParticipants].sort();
        
        console.log('🔍 Looking for existing chat with sorted participants:', sortedParticipants);
        
        // ИСПРАВЛЕНО: НЕ популяризируем lastMessage при поиске
        const existingChat = await Chat.findOne({
            participants: { $all: sortedParticipants },
            participants: { $size: 2 }
        });
        
        if (existingChat) {
            console.log('✅ Found existing chat:', existingChat._id);
            console.log('   - Existing chat participants:', existingChat.participants);
            
            // ИСПРАВЛЕНО: Возвращаем lastMessage как String ID
            return res.json(formatChatResponse(existingChat));
        }
        
        // Создаем новый чат с нормализованными и отсортированными участниками
        console.log('💬 Creating new chat with participants:', sortedParticipants);
        
        const chat = new Chat({ 
            participants: sortedParticipants,
            chatType: 'direct',
            isActive: true
        });
        
        await chat.save();
        console.log('✅ Chat created successfully:', chat._id);
        console.log('   - Saved participants:', chat.participants);
        
        // ИСПРАВЛЕНО: Возвращаем lastMessage как String ID
        res.status(201).json(formatChatResponse(chat));
        
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
        
        // Нормализуем ID
        const normalizedUserId = normalizeUUID(userId);
        const normalizedCurrentUserId = normalizeUUID(req.user.id);
        
        console.log('💬 Getting chats for user:', userId);
        console.log('   - Normalized user ID:', normalizedUserId);
        console.log('   - Normalized current user ID:', normalizedCurrentUserId);
        
        // Проверяем что пользователь запрашивает свои чаты
        if (normalizedUserId !== normalizedCurrentUserId) {
            console.log('❌ User trying to access another user\'s chats');
            return res.status(403).json({ error: 'Access denied. You can only view your own chats' });
        }
        
        // ИСПРАВЛЕНО: НЕ популяризируем lastMessage
        const chats = await Chat.find({ 
            participants: normalizedUserId,
            isActive: true 
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Found ${chats.length} chats for user ${req.user.nickname}`);
        
        // ИСПРАВЛЕНО: Форматируем с lastMessage как String ID
        const formattedChats = chats.map(formatChatResponse);
        
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
        
        // Нормализуем текущий user ID
        const normalizedCurrentUserId = normalizeUUID(req.user.id);
        
        console.log('💬 Getting chats for authenticated user:', req.user.nickname);
        console.log('   - Normalized user ID:', normalizedCurrentUserId);
        
        // ИСПРАВЛЕНО: НЕ популяризируем lastMessage
        const chats = await Chat.find({ 
            participants: normalizedCurrentUserId,
            isActive: true 
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Found ${chats.length} chats for user ${req.user.nickname}`);
        
        // ИСПРАВЛЕНО: Форматируем с lastMessage как String ID
        const formattedChats = chats.map(formatChatResponse);
        
        res.json(formattedChats);
        
    } catch (error) {
        console.error('❌ Get my chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// НОВОЕ: Получение чатов с полной информацией о последних сообщениях
router.get('/my/with-messages', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const normalizedCurrentUserId = normalizeUUID(req.user.id);
        
        console.log('💬 Getting chats with full message info for user:', req.user.nickname);
        console.log('   - Normalized user ID:', normalizedCurrentUserId);
        
        // ЗДЕСЬ популяризируем lastMessage для полной информации
        const chats = await Chat.find({ 
            participants: normalizedCurrentUserId,
            isActive: true 
        })
        .populate('lastMessage') // Популяризируем для полной информации
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Found ${chats.length} chats with full message info`);
        
        // Возвращаем полные объекты сообщений
        const formattedChats = chats.map(chat => ({
            _id: chat._id.toString(),
            participants: chat.participants,
            lastMessage: chat.lastMessage, // ПОЛНЫЙ объект Message
            lastMessageAt: chat.lastMessageAt,
            chatType: chat.chatType,
            isActive: chat.isActive,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
        }));
        
        res.json(formattedChats);
        
    } catch (error) {
        console.error('❌ Get chats with messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение информации о конкретном чате (ЗАЩИЩЕНО)
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`💬 Getting chat ${chatId} for user: ${req.user.nickname}`);
        
        // ИСПРАВЛЕНО: НЕ популяризируем lastMessage
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // ИСПРАВЛЕНО: Используем функцию проверки доступа с нормализацией
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        console.log(`✅ Chat found and user is participant`);
        
        // ИСПРАВЛЕНО: Форматируем с lastMessage как String ID
        res.json(formatChatResponse(chat));
        
    } catch (error) {
        console.error('❌ Get chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение информации о конкретном чате с полным lastMessage (ЗАЩИЩЕНО)
router.get('/:chatId/with-message', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`💬 Getting chat ${chatId} with full message for user: ${req.user.nickname}`);
        
        // ЗДЕСЬ популяризируем lastMessage
        const chat = await Chat.findById(chatId).populate('lastMessage');
        
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        console.log(`✅ Chat found with full message info`);
        
        // Возвращаем с полным объектом lastMessage
        res.json({
            _id: chat._id.toString(),
            participants: chat.participants,
            lastMessage: chat.lastMessage, // ПОЛНЫЙ объект Message
            lastMessageAt: chat.lastMessageAt,
            chatType: chat.chatType,
            isActive: chat.isActive,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
        });
        
    } catch (error) {
        console.error('❌ Get chat with message error:', error);
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
        if (!checkChatAccess(chat, req.user.id)) {
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
            chat: formatChatResponse(chat)
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
        
        // Проверяем что пользователь является участником чата
        if (!checkChatAccess(chat, req.user.id)) {
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
        if (!checkChatAccess(chat, req.user.id)) {
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
        if (!checkChatAccess(chat, req.user.id)) {
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
        const normalizedCurrentUserId = normalizeUUID(req.user.id);
        chat.participants = chat.participants.filter(participantId => 
            normalizeUUID(participantId) !== normalizedCurrentUserId
        );
        
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
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ User not a participant of this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        // Получаем статистику сообщений
        const Message = require('../models/Message');
        
        const normalizedCurrentUserId = normalizeUUID(req.user.id);
        
        const totalMessages = await Message.countDocuments({ chatId });
        const userMessages = await Message.countDocuments({ 
            chatId, 
            senderId: normalizedCurrentUserId
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