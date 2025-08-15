// =====================================================
// ФАЙЛ: routes/messages.js (BACKEND) - ФИНАЛЬНАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/routes/messages.js
// ОПИСАНИЕ: Исправлена ошибка 'toString of undefined' и отправка push
// =====================================================

const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User'); // <--- ВАЖНО: импортируем модель User
const { authenticateToken } = require('../middleware/auth');
const { sendPushNotification } = require('../services/pushNotificationService'); // <--- ВАЖНО: импортируем наш новый сервис
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
            encryptionData: isEncrypted ? encryptionData : null,
            cryptoAmount,
            transactionHash,
            transactionStatus
        };
        
        const message = new Message(messageData);
        await message.save();
        
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            lastMessageAt: new Date()
        });
        
        // ---> ИСПРАВЛЕНИЕ ЗДЕСЬ
        // Сначала "заполняем" (populate) данные отправителя
        await message.populate('senderId', 'nickname firstName lastName avatar');
        
        console.log(`✅ Сообщение ${message._id} сохранено в базу данных.`);

        // Теперь, когда senderId - это объект, отправляем WebSocket-событие
        const io = req.io;
        const webSocketMessage = {
             _id: message._id, 
             id: message._id, 
             chatId: message.chatId.toString(),
             senderId: message.senderId._id.toString(), // Теперь это работает
             content: message.content, 
             messageType: message.messageType, 
             timestamp: message.createdAt,
             isEncrypted: message.isEncrypted, 
             encryptionData: message.encryptionData,
             senderInfo: { nickname: message.senderId.nickname }
        };
        io.to(chatId.toString()).emit('message', webSocketMessage);
        console.log(`📡 Сообщение ${message._id} отправлено по WebSocket.`);

        // Отправка Push-уведомления
        const recipientId = chat.participants.find(p => String(p) !== String(senderId));
        if (recipientId) {
            const recipient = await User.findById(recipientId);
            if (recipient && recipient.deviceTokens && recipient.deviceTokens.length > 0) {
                const senderName = message.senderId.nickname;
                const notificationTitle = `Новое сообщение от ${senderName}`;
                const notificationBody = isEncrypted ? 'Сообщение зашифровано' : content;
                const payload = { chatId: chatId.toString() };
                await sendPushNotification(recipient.deviceTokens, notificationTitle, notificationBody, payload);
            }
        }
        
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
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        const userIdStr = String(req.user.id);
        const participantStrs = chat.participants.map(p => String(p));
        
        if (!participantStrs.includes(userIdStr)) {
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat'
            });
        }
        
        const messages = await Message.find({ chatId })
            .populate('senderId', 'nickname firstName lastName avatar')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset);
        
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
        
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        if (String(message.senderId) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Access denied. You can only update your own messages' });
        }
        
        if (transactionStatus) {
            message.transactionStatus = transactionStatus;
        }
        
        await message.save();
        
        res.json({ message: 'Message status updated successfully' });
        
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
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!chat.participants.map(p => String(p)).includes(String(req.user.id))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        let markedCount = 0;
        
        if (messageIds && Array.isArray(messageIds)) {
            for (const messageId of messageIds) {
                const message = await Message.findById(messageId);
                if (message && String(message.chatId) === chatId && !message.isReadBy(req.user.id)) {
                    message.markAsRead(req.user.id);
                    await message.save();
                    markedCount++;
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
        
        res.json({ message: `Marked ${markedCount} messages as read`, markedCount });
        
    } catch (error) {
        console.error('❌ Ошибка пометки сообщений как прочитанных:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;