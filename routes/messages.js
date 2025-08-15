// =====================================================
// ФАЙЛ: routes/messages.js (BACKEND) - ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/routes/messages.js
// ОПИСАНИЕ: Исправлена ошибка 'toString of undefined' при отправке WebSocket-события
// =====================================================

const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Отправка сообщения (ЗАЩИЩЕНО)
router.post('/send', authenticateToken, async (req, res) => {
    try {
        const {
            chatId,
            content,
            messageType = 'text',
            cryptoAmount,
            transactionHash,
            transactionStatus,
            isEncrypted = false,
            encryptionData
        } = req.body;
        
        const senderId = req.user.id;
        
        console.log(`📤 Отправка сообщения от ${req.user.nickname} в чат ${chatId}`);
        console.log(`📤 Тип сообщения: ${messageType}, зашифровано: ${isEncrypted}`);
        
        if (!chatId || !content) {
            return res.status(400).json({
                error: 'Missing required fields: chatId, content'
            });
        }
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        const userIdStr = String(senderId);
        const participantStrs = chat.participants.map(p => String(p));
        if (!participantStrs.includes(userIdStr)) {
            console.log('❌ Пользователь не авторизован для отправки сообщения в этот чат');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat'
            });
        }
        
        const messageData = { 
            chatId, 
            senderId, 
            content, 
            messageType,
            isEncrypted,
            encryptionData: isEncrypted ? encryptionData : null
        };
        
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
        
        // ---> НАЧАЛО ИЗМЕНЕНИЙ
        // Сначала "заполняем" (populate) данные отправителя
        await message.populate('senderId', 'nickname firstName lastName avatar');
        
        console.log(`✅ Сообщение успешно отправлено: ${message._id}`);

        // Теперь отправляем сообщение через WebSocket
        try {
            const io = req.io;
            const webSocketMessage = {
                _id: message._id,
                id: message._id,
                chatId: message.chatId.toString(),
                // Убеждаемся, что senderId - это объект, и берем из него _id
                senderId: message.senderId._id.toString(),
                content: message.content,
                messageType: message.messageType,
                timestamp: message.createdAt,
                isEncrypted: message.isEncrypted,
                encryptionData: message.encryptionData,
                cryptoAmount: message.cryptoAmount,
                transactionHash: message.transactionHash,
                transactionStatus: message.transactionStatus,
                deliveryStatus: message.deliveryStatus,
                senderInfo: { // Добавляем информацию об отправителе
                    nickname: message.senderId.nickname,
                    firstName: message.senderId.firstName,
                    lastName: message.senderId.lastName,
                    avatar: message.senderId.avatar
                }
            };

            io.to(chatId.toString()).emit('message', webSocketMessage);
            console.log(`📡 Сообщение ${message._id} отправлено в WebSocket комнату ${chatId}`);
        } catch (wsError) {
            console.error('❌ Ошибка отправки сообщения через WebSocket:', wsError);
        }
        // <--- КОНЕЦ ИЗМЕНЕНИЙ
        
        res.status(201).json(message);
        
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение сообщений чата (ЗАЩИЩЕНО)
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        console.log(`📥 Получаем сообщения для чата ${chatId} пользователем: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        const userIdStr = String(req.user.id);
        const participantStrs = chat.participants.map(p => String(p));
        
        if (!participantStrs.includes(userIdStr)) {
            console.log('❌ Пользователь не авторизован для просмотра сообщений в этом чате');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat'
            });
        }
        
        const messages = await Message.find({ chatId })
            .populate('senderId', 'nickname firstName lastName avatar')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset);
        
        console.log(`✅ Найдено ${messages.length} сообщений для чата ${chatId}`);
        
        res.json(messages.reverse());
        
    } catch (error) {
        console.error('❌ Ошибка получения сообщений:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновление статуса сообщения (ЗАЩИЩЕНО)
router.put('/:messageId/status', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { transactionStatus } = req.body;
        
        console.log(`📝 Обновление статуса сообщения ${messageId} пользователем: ${req.user.nickname}`);
        
        const message = await Message.findById(messageId);
        if (!message) {
            console.log('❌ Сообщение не найдено');
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const userIdStr = String(req.user.id);
        const senderIdStr = String(message.senderId);
        
        if (senderIdStr !== userIdStr) {
            console.log('❌ Пользователь не авторизован для обновления этого сообщения');
            return res.status(403).json({ error: 'Access denied. You can only update your own messages' });
        }
        
        if (transactionStatus) {
            message.transactionStatus = transactionStatus;
        }
        
        await message.save();
        
        console.log(`✅ Статус сообщения обновлен: ${messageId}`);
        
        res.json({
            message: 'Message status updated successfully',
            messageId: messageId,
            transactionStatus: message.transactionStatus
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления статуса сообщения:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Пометка сообщений как прочитанных (ЗАЩИЩЕНО)
router.post('/:chatId/mark-read', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { messageIds } = req.body;
        
        console.log(`📖 Пометка сообщений как прочитанных в чате ${chatId} пользователем: ${req.user.nickname}`);
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        const userIdStr = String(req.user.id);
        const participantStrs = chat.participants.map(p => String(p));
        
        if (!participantStrs.includes(userIdStr)) {
            console.log('❌ Пользователь не авторизован для пометки сообщений в этом чате');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat'
            });
        }
        
        let markedCount = 0;
        
        if (messageIds && Array.isArray(messageIds)) {
            for (const messageId of messageIds) {
                const message = await Message.findById(messageId);
                if (message && String(message.chatId) === chatId) {
                    if (!message.isReadBy(req.user.id)) {
                        message.markAsRead(req.user.id);
                        await message.save();
                        markedCount++;
                    }
                }
            }
        } else {
            const unreadMessages = await Message.find({
                chatId: chatId,
                senderId: { $ne: req.user.id },
                'readReceipts.userId': { $ne: req.user.id }
            });
            
            for (const message of unreadMessages) {
                message.markAsRead(req.user.id);
                await message.save();
                markedCount++;
            }
        }
        
        console.log(`✅ Помечено ${markedCount} сообщений как прочитанные`);
        
        res.json({
            message: `Marked ${markedCount} messages as read`,
            markedCount: markedCount
        });
        
    } catch (error) {
        console.error('❌ Ошибка пометки сообщений как прочитанных:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;