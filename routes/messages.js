// =====================================================
// ФАЙЛ: routes/messages.js (BACKEND) - ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/routes/messages.js
// ОПИСАНИЕ: Исправлено дублирование сообщений и улучшена отправка push
// =====================================================

const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { sendPushNotification } = require('../services/pushNotificationService');
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
        console.log(`   Тип: ${messageType}, Зашифровано: ${isEncrypted}`);
        
        // Валидация обязательных полей
        if (!chatId || !content) {
            return res.status(400).json({
                error: 'Missing required fields: chatId, content',
                code: 'MISSING_FIELDS'
            });
        }
        
        // Проверяем существование чата
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }
        
        // Проверяем права доступа
        const userIdStr = String(senderId);
        const participantStrs = chat.participants.map(p => String(p));
        if (!participantStrs.includes(userIdStr)) {
            console.log('❌ Пользователь не является участником чата');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat',
                code: 'ACCESS_DENIED'
            });
        }
        
        // Подготавливаем данные сообщения
        const messageData = { 
            chatId, 
            senderId, 
            content, 
            messageType,
            isEncrypted,
            encryptionData: isEncrypted ? encryptionData : null,
            cryptoAmount,
            transactionHash,
            transactionStatus,
            deliveryStatus: 'delivered'
        };
        
        // Создаем и сохраняем сообщение
        const message = new Message(messageData);
        await message.save();
        
        // Обновляем последнее сообщение в чате
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            lastMessageAt: new Date()
        });
        
        // Заполняем данные отправителя
        await message.populate('senderId', 'nickname firstName lastName avatar publicKey tronAddress');
        
        console.log(`✅ Сообщение ${message._id} сохранено в базу данных`);

        // Отправляем через WebSocket всем участникам чата
        const io = req.io;
        if (io) {
            const webSocketMessage = {
                _id: message._id,
                id: message._id,
                chatId: message.chatId.toString(),
                senderId: message.senderId._id.toString(),
                content: message.content,
                messageType: message.messageType,
                timestamp: message.createdAt,
                isEncrypted: message.isEncrypted,
                encryptionData: message.encryptionData,
                deliveryStatus: message.deliveryStatus,
                cryptoAmount: message.cryptoAmount,
                transactionHash: message.transactionHash,
                transactionStatus: message.transactionStatus,
                senderInfo: {
                    _id: message.senderId._id.toString(),
                    id: message.senderId._id.toString(),
                    nickname: message.senderId.nickname,
                    firstName: message.senderId.firstName,
                    lastName: message.senderId.lastName,
                    avatar: message.senderId.avatar,
                    publicKey: message.senderId.publicKey
                }
            };
            
            // Отправляем всем в комнате чата
            io.to(chatId.toString()).emit('message', webSocketMessage);
            console.log(`📡 Сообщение отправлено по WebSocket в комнату: ${chatId}`);
        }

        // Отправка Push-уведомления получателю
        const recipientId = chat.participants.find(p => String(p) !== String(senderId));
        if (recipientId) {
            console.log(`🔍 Ищем получателя с ID: ${recipientId}`);
            
            const recipient = await User.findById(recipientId);
            if (recipient) {
                console.log(`👤 Найден получатель: ${recipient.nickname}`);
                
                if (recipient.deviceTokens && recipient.deviceTokens.length > 0) {
                    // Фильтруем валидные токены
                    const validTokens = recipient.deviceTokens.filter(token => 
                        token && typeof token === 'string' && token.trim().length > 0
                    );
                    
                    console.log(`📱 У получателя ${validTokens.length} валидных токенов`);
                    
                    if (validTokens.length > 0) {
                        const senderName = message.senderId.nickname;
                        const notificationTitle = `New message from ${senderName}`;
                        const notificationBody = isEncrypted ? 
                            '🔐 Encrypted message' : 
                            (content.length > 100 ? content.substring(0, 97) + '...' : content);
                        
                        const payload = { 
                            chatId: chatId.toString(),
                            messageId: message._id.toString(),
                            senderId: senderId.toString(),
                            senderName: senderName,
                            type: 'message'
                        };
                        
                        // Отправляем push-уведомление
                        const result = await sendPushNotification(
                            validTokens,
                            notificationTitle,
                            notificationBody,
                            payload
                        );
                        
                        if (result) {
                            console.log(`📊 Push результат: ${result.successCount} успешно, ${result.failureCount} неудачно`);
                        }
                    } else {
                        console.log(`⚠️ У получателя ${recipient.nickname} нет валидных токенов`);
                    }
                } else {
                    console.log(`⚠️ У получателя ${recipient.nickname} нет токенов устройств`);
                }
            } else {
                console.log(`❌ Получатель с ID ${recipientId} не найден в базе`);
            }
        }
        
        // Отправляем ответ клиенту
        res.status(201).json(message);

    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Получение сообщений чата (ЗАЩИЩЕНО)
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        console.log(`📥 Получение сообщений для чата ${chatId}`);
        
        // Проверяем существование чата
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }
        
        // Проверяем права доступа
        const userIdStr = String(req.user.id);
        const participantStrs = chat.participants.map(p => String(p));
        
        if (!participantStrs.includes(userIdStr)) {
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat',
                code: 'ACCESS_DENIED'
            });
        }
        
        // Получаем сообщения с данными отправителя
        const messages = await Message.find({ chatId })
            .populate('senderId', 'nickname firstName lastName avatar publicKey tronAddress')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset);
        
        console.log(`✅ Найдено ${messages.length} сообщений`);
        
        // Возвращаем в хронологическом порядке
        res.json(messages.reverse());
        
    } catch (error) {
        console.error('❌ Ошибка получения сообщений:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Обновление статуса сообщения (ЗАЩИЩЕНО)
router.put('/:messageId/status', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { transactionStatus } = req.body;
        
        console.log(`📝 Обновление статуса сообщения ${messageId}`);
        
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }
        
        // Проверяем что это сообщение отправителя
        if (String(message.senderId) !== String(req.user.id)) {
            return res.status(403).json({ 
                error: 'Access denied. You can only update your own messages',
                code: 'ACCESS_DENIED'
            });
        }
        
        // Обновляем статус транзакции
        if (transactionStatus) {
            message.transactionStatus = transactionStatus;
            await message.save();
            
            console.log(`✅ Статус транзакции обновлен на: ${transactionStatus}`);
        }
        
        res.json({ 
            message: 'Message status updated successfully',
            messageId: messageId,
            transactionStatus: transactionStatus
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления статуса сообщения:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Пометка сообщений как прочитанных (ЗАЩИЩЕНО)
router.post('/:chatId/mark-read', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { messageIds } = req.body;
        
        console.log(`📖 Пометка сообщений как прочитанных в чате ${chatId}`);
        
        // Проверяем существование чата
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }
        
        // Проверяем права доступа
        if (!chat.participants.map(p => String(p)).includes(String(req.user.id))) {
            return res.status(403).json({ 
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        let markedCount = 0;
        
        if (messageIds && Array.isArray(messageIds)) {
            // Помечаем конкретные сообщения
            for (const messageId of messageIds) {
                const message = await Message.findById(messageId);
                if (message && String(message.chatId) === chatId && !message.isReadBy(req.user.id)) {
                    message.markAsRead(req.user.id);
                    await message.save();
                    markedCount++;
                    console.log(`   ✅ Сообщение ${messageId} помечено как прочитанное`);
                }
            }
        } else {
            // Помечаем все непрочитанные сообщения
            const unreadMessages = await Message.find({
                chatId: chatId,
                senderId: { $ne: req.user.id },
                'readReceipts.userId': { $ne: req.user.id }
            });
            
            console.log(`   📊 Найдено ${unreadMessages.length} непрочитанных сообщений`);
            
            for (const message of unreadMessages) {
                message.markAsRead(req.user.id);
                await message.save();
                markedCount++;
            }
        }
        
        console.log(`✅ Помечено как прочитанное: ${markedCount} сообщений`);
        
        res.json({ 
            message: `Marked ${markedCount} messages as read`,
            markedCount: markedCount,
            chatId: chatId
        });
        
    } catch (error) {
        console.error('❌ Ошибка пометки сообщений как прочитанных:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Удаление сообщения (ЗАЩИЩЕНО)
router.delete('/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        console.log(`🗑️ Удаление сообщения ${messageId}`);
        
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }
        
        // Проверяем что это сообщение отправителя
        if (String(message.senderId) !== String(req.user.id)) {
            return res.status(403).json({ 
                error: 'Access denied. You can only delete your own messages',
                code: 'ACCESS_DENIED'
            });
        }
        
        await message.deleteOne();
        
        console.log(`✅ Сообщение удалено`);
        
        res.json({ 
            message: 'Message deleted successfully',
            messageId: messageId
        });
        
    } catch (error) {
        console.error('❌ Ошибка удаления сообщения:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;