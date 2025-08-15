// =====================================================
// ФАЙЛ: routes/chats.js (BACKEND) - ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/routes/chats.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Исправленные чаты роуты с корректной проверкой участников
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
    
    console.log('🔍 ДЕБАГ ПРОВЕРКИ ДОСТУПА К ЧАТУ:');
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
        lastMessage: chat.lastMessage ? chat.lastMessage.toString() : null,
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
        
        console.log('💬 Запрос на создание чата от пользователя:', req.user.nickname);
        console.log('📝 Исходные участники:', participants);
        console.log('🔐 Текущий ID пользователя из JWT:', currentUserId);
        
        if (!participants || !Array.isArray(participants) || participants.length !== 2) {
            console.log('❌ Неверный формат участников');
            return res.status(400).json({ error: 'Требуется ровно 2 участника' });
        }
        
        // Нормализуем все UUID к uppercase
        const normalizedParticipants = normalizeUUIDs(participants);
        const normalizedCurrentUserId = normalizeUUID(currentUserId);
        
        console.log('🔄 НОРМАЛИЗАЦИЯ:');
        console.log('   - Исходные участники:', participants);
        console.log('   - Нормализованные участники:', normalizedParticipants);
        console.log('   - Исходный ID текущего пользователя:', currentUserId);
        console.log('   - Нормализованный ID текущего пользователя:', normalizedCurrentUserId);
        
        // Проверяем что текущий пользователь является участником чата
        if (!normalizedParticipants.includes(normalizedCurrentUserId)) {
            console.log('❌ Текущий пользователь не в списке участников');
            return res.status(403).json({ error: 'Вы должны быть участником чата' });
        }
        
        // ИСПРАВЛЕНО: НЕ СОРТИРУЕМ участников, а ищем чат с точным совпадением участников
        console.log('🔍 Ищем существующий чат с участниками:', normalizedParticipants);
        
        // Ищем чат где есть ОБА участника в любом порядке
        const existingChat = await Chat.findOne({
            $and: [
                { participants: { $all: normalizedParticipants } },
                { participants: { $size: 2 } },
                { chatType: 'direct' }
            ]
        });
        
        if (existingChat) {
            console.log('✅ Найден существующий чат:', existingChat._id);
            console.log('   - Участники существующего чата:', existingChat.participants);
            
            // Активируем чат если он был деактивирован
            if (!existingChat.isActive) {
                existingChat.isActive = true;
                await existingChat.save();
                console.log('   - Чат был реактивирован');
            }
            
            return res.json(formatChatResponse(existingChat));
        }
        
        // Создаем новый чат БЕЗ сортировки участников
        console.log('💬 Создаем новый чат с участниками:', normalizedParticipants);
        
        const chat = new Chat({ 
            participants: normalizedParticipants, // Сохраняем порядок как есть
            chatType: 'direct',
            isActive: true,
            lastMessageAt: new Date()
        });
        
        await chat.save();
        console.log('✅ Чат успешно создан:', chat._id);
        console.log('   - Сохраненные участники:', chat.participants);
        
        res.status(201).json(formatChatResponse(chat));
        
    } catch (error) {
        console.error('❌ Ошибка создания чата:', error);
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
        
        console.log('💬 Получаем чаты для пользователя:', userId);
        console.log('   - Normalized user ID:', normalizedUserId);
        console.log('   - Normalized current user ID:', normalizedCurrentUserId);
        
        // Проверяем что пользователь запрашивает свои чаты
        if (normalizedUserId !== normalizedCurrentUserId) {
            console.log('❌ Пользователь пытается получить доступ к чужим чатам');
            return res.status(403).json({ error: 'Доступ запрещен. Вы можете просматривать только свои чаты' });
        }
        
        const chats = await Chat.find({ 
            participants: normalizedUserId,
            isActive: true 
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Найдено ${chats.length} чатов для пользователя ${req.user.nickname}`);
        
        const formattedChats = chats.map(formatChatResponse);
        
        res.json(formattedChats);
        
    } catch (error) {
        console.error('❌ Ошибка получения чатов пользователя:', error);
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
        
        console.log('💬 Получаем чаты для аутентифицированного пользователя:', req.user.nickname);
        console.log('   - Normalized user ID:', normalizedCurrentUserId);
        
        const chats = await Chat.find({ 
            participants: normalizedCurrentUserId,
            isActive: true 
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Найдено ${chats.length} чатов для пользователя ${req.user.nickname}`);
        
        const formattedChats = chats.map(formatChatResponse);
        
        res.json(formattedChats);
        
    } catch (error) {
        console.error('❌ Ошибка получения моих чатов:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// НОВОЕ: Получение чатов с полной информацией о последних сообщениях
router.get('/my/with-messages', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const normalizedCurrentUserId = normalizeUUID(req.user.id);
        
        console.log('💬 Получаем чаты с полной информацией о сообщениях для пользователя:', req.user.nickname);
        console.log('   - Normalized user ID:', normalizedCurrentUserId);
        
        // --- ИСПРАВЛЕНИЕ: Популяризируем `lastMessage` и `senderId` внутри него
        const chats = await Chat.find({ 
            participants: normalizedCurrentUserId,
            isActive: true 
        })
        .populate({
            path: 'lastMessage',
            populate: {
                path: 'senderId',
                select: 'nickname firstName lastName avatar publicKey tronAddress'
            }
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .skip(offset);
        
        console.log(`✅ Найдено ${chats.length} чатов с полной информацией о сообщениях`);
        
        // Возвращаем полные объекты сообщений
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
        console.error('❌ Ошибка получения чатов с сообщениями:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение информации о конкретном чате (ЗАЩИЩЕНО)
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`💬 Получаем чат ${chatId} для пользователя: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Доступ запрещен. Вы не являетесь участником этого чата' });
        }
        
        console.log(`✅ Чат найден, и пользователь является его участником`);
        
        res.json(formatChatResponse(chat));
        
    } catch (error) {
        console.error('❌ Ошибка получения чата:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение информации о конкретном чате с полным lastMessage (ЗАЩИЩЕНО)
router.get('/:chatId/with-message', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`💬 Получаем чат ${chatId} с полным сообщением для пользователя: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId).populate('lastMessage');
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Доступ запрещен. Вы не являетесь участником этого чата' });
        }
        
        console.log(`✅ Чат найден с полной информацией о сообщении`);
        
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
        console.error('❌ Ошибка получения чата с сообщением:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновление настроек чата (ЗАЩИЩЕНО)
router.put('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { isActive } = req.body;
        
        console.log(`✏️ Обновляем чат ${chatId} пользователем: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Доступ запрещен. Вы не являетесь участником этого чата' });
        }
        
        if (isActive !== undefined) {
            chat.isActive = isActive;
        }
        
        await chat.save();
        
        console.log(`✅ Чат обновлен: ${chatId}`);
        
        res.json({
            message: 'Chat updated successfully',
            chat: formatChatResponse(chat)
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления чата:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Удаление чата (ЗАЩИЩЕНО - только участники)
router.delete('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`🗑️ Удаляем чат ${chatId} пользователем: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Доступ запрещен. Вы не являетесь участником этого чата' });
        }
        
        // Мягкое удаление - помечаем как неактивный
        chat.isActive = false;
        await chat.save();
        
        console.log(`✅ Чат помечен как неактивный: ${chatId}`);
        
        res.json({
            message: 'Chat deleted successfully',
            chatId: chatId
        });
        
    } catch (error) {
        console.error('❌ Ошибка удаления чата:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение участников чата (ЗАЩИЩЕНО)
router.get('/:chatId/participants', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`👥 Получаем участников чата ${chatId} пользователем: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Доступ запрещен. Вы не являетесь участником этого чата' });
        }
        
        // Получаем информацию об участниках
        const User = require('../models/User');
        const participants = await User.find({
            _id: { $in: chat.participants }
        }).select('_id nickname firstName lastName avatar isOnline lastSeen');
        
        console.log(`✅ Найдено ${participants.length} участников`);
        
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
        console.error('❌ Ошибка получения участников чата:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Покинуть чат (ЗАЩИЩЕНО)
router.post('/:chatId/leave', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`🚪 Пользователь ${req.user.nickname} покидает чат ${chatId}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
        }
        
        // Для direct чатов просто помечаем как неактивный
        if (chat.chatType === 'direct') {
            chat.isActive = false;
            await chat.save();
            
            console.log(`✅ Прямой чат помечен как неактивный: ${chatId}`);
            
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
        
        console.log(`✅ Пользователь покинул групповой чат: ${chatId}`);
        
        res.json({
            message: 'Left chat successfully',
            chatId: chatId,
            remainingParticipants: chat.participants.length
        });
        
    } catch (error) {
        console.error('❌ Ошибка выхода из чата:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Статистика чата (ЗАЩИЩЕНО)
router.get('/:chatId/stats', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        console.log(`📊 Получаем статистику для чата ${chatId} пользователем: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!checkChatAccess(chat, req.user.id)) {
            console.log('❌ Пользователь не является участником этого чата');
            return res.status(403).json({ error: 'Доступ запрещен. Вы не являетесь участником этого чата' });
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
        
        console.log(`✅ Статистика чата рассчитана для ${chatId}`);
        
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
        console.error('❌ Ошибка получения статистики чата:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
