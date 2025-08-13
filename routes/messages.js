// =====================================================
// ФАЙЛ: routes/messages.js (BACKEND) - FIXED WITH DEBUGGING
// ПУТЬ: nickname-messenger-backend/routes/messages.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Исправленные сообщения роуты с отладкой
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
            // НОВОЕ: E2E шифрование
            isEncrypted = false,
            encryptionData
        } = req.body;
        
        const senderId = req.user.id; // Получаем из JWT токена
        
        console.log(`📤 Sending message from ${req.user.nickname} to chat ${chatId}`);
        console.log(`📤 Message type: ${messageType}, encrypted: ${isEncrypted}`);
        
        if (!chatId || !content) {
            return res.status(400).json({
                error: 'Missing required fields: chatId, content'
            });
        }
        
        // ИСПРАВЛЕНО: Проверяем существование чата и участие пользователя с отладкой
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // ОТЛАДКА: Выводим подробную информацию
        console.log(`🔍 DEBUGGING CHAT PARTICIPANTS:`);
        console.log(`   - Chat ID: ${chatId}`);
        console.log(`   - User ID: ${senderId}`);
        console.log(`   - User ID type: ${typeof senderId}`);
        console.log(`   - Chat participants:`, chat.participants);
        console.log(`   - Chat participants types:`, chat.participants.map(p => typeof p));
        
        // ИСПРАВЛЕНО: Приводим все к строкам для корректного сравнения
        const userIdStr = String(senderId);
        const participantStrs = chat.participants.map(p => String(p));
        const isParticipant = participantStrs.includes(userIdStr);
        
        console.log(`   - User ID as string: "${userIdStr}"`);
        console.log(`   - Participants as strings:`, participantStrs);
        console.log(`   - Is participant: ${isParticipant}`);
        
        if (!isParticipant) {
            console.log('❌ User not authorized to send message to this chat');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat',
                debug: {
                    userId: userIdStr,
                    participants: participantStrs,
                    chatId: chatId
                }
            });
        }
        
        // Создаем сообщение
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
        
        // Обновляем чат
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id,
            lastMessageAt: new Date()
        });
        
        await message.populate('senderId', 'nickname firstName lastName');
        
        console.log(`✅ Message sent successfully: ${message._id}`);
        
        res.status(201).json(message);
        
    } catch (error) {
        console.error('❌ Send message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение сообщений чата (ЗАЩИЩЕНО) - ИСПРАВЛЕНО
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        console.log(`📥 Getting messages for chat ${chatId} by user: ${req.user.nickname}`);
        console.log(`📥 User ID: ${req.user.id} (type: ${typeof req.user.id})`);
        
        // ИСПРАВЛЕНО: Проверяем доступ к чату с отладкой
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // ОТЛАДКА: Выводим подробную информацию о проверке доступа
        console.log(`🔍 DEBUGGING CHAT ACCESS:`);
        console.log(`   - Chat ID: ${chatId}`);
        console.log(`   - User ID: ${req.user.id}`);
        console.log(`   - User ID type: ${typeof req.user.id}`);
        console.log(`   - Chat participants:`, chat.participants);
        console.log(`   - Chat participants types:`, chat.participants.map(p => typeof p));
        
        // ИСПРАВЛЕНО: Приводим все к строкам для корректного сравнения
        const userIdStr = String(req.user.id);
        const participantStrs = chat.participants.map(p => String(p));
        const hasAccess = participantStrs.includes(userIdStr);
        
        console.log(`   - User ID as string: "${userIdStr}"`);
        console.log(`   - Participants as strings:`, participantStrs);
        console.log(`   - Has access: ${hasAccess}`);
        
        if (!hasAccess) {
            console.log('❌ User not authorized to view messages in this chat');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat',
                debug: {
                    userId: userIdStr,
                    participants: participantStrs,
                    chatId: chatId
                }
            });
        }
        
        console.log(`✅ User has access to chat, loading messages...`);
        
        const messages = await Message.find({ chatId })
            .populate('senderId', 'nickname firstName lastName avatar')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset);
        
        console.log(`✅ Found ${messages.length} messages for chat ${chatId}`);
        
        res.json(messages.reverse()); // Возвращаем в хронологическом порядке
        
    } catch (error) {
        console.error('❌ Get messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновление статуса сообщения (ЗАЩИЩЕНО)
router.put('/:messageId/status', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { transactionStatus } = req.body;
        
        console.log(`📝 Updating message ${messageId} status by user: ${req.user.nickname}`);
        
        const message = await Message.findById(messageId);
        if (!message) {
            console.log('❌ Message not found');
            return res.status(404).json({ error: 'Message not found' });
        }
        
        // ИСПРАВЛЕНО: Приводим к строкам для сравнения
        const userIdStr = String(req.user.id);
        const senderIdStr = String(message.senderId);
        
        if (senderIdStr !== userIdStr) {
            console.log('❌ User not authorized to update this message');
            console.log(`   - User ID: "${userIdStr}"`);
            console.log(`   - Sender ID: "${senderIdStr}"`);
            return res.status(403).json({ error: 'Access denied. You can only update your own messages' });
        }
        
        if (transactionStatus) {
            message.transactionStatus = transactionStatus;
        }
        
        await message.save();
        
        console.log(`✅ Message status updated: ${messageId}`);
        
        res.json({
            message: 'Message status updated successfully',
            messageId: messageId,
            transactionStatus: message.transactionStatus
        });
        
    } catch (error) {
        console.error('❌ Update message status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Пометка сообщений как прочитанных (ЗАЩИЩЕНО)
router.post('/:chatId/mark-read', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { messageIds } = req.body; // Массив ID сообщений для пометки
        
        console.log(`📖 Marking messages as read in chat ${chatId} by user: ${req.user.nickname}`);
        
        // Проверяем доступ к чату
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        // ИСПРАВЛЕНО: Приводим к строкам для сравнения
        const userIdStr = String(req.user.id);
        const participantStrs = chat.participants.map(p => String(p));
        
        if (!participantStrs.includes(userIdStr)) {
            console.log('❌ User not authorized to mark messages in this chat');
            return res.status(403).json({ 
                error: 'Access denied. You are not a participant of this chat',
                debug: {
                    userId: userIdStr,
                    participants: participantStrs
                }
            });
        }
        
        let markedCount = 0;
        
        if (messageIds && Array.isArray(messageIds)) {
            // Помечаем конкретные сообщения
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
            // Помечаем все непрочитанные сообщения в чате
            const unreadMessages = await Message.find({
                chatId: chatId,
                senderId: { $ne: req.user.id }, // Не помечаем свои сообщения
                'readReceipts.userId': { $ne: req.user.id }
            });
            
            for (const message of unreadMessages) {
                message.markAsRead(req.user.id);
                await message.save();
                markedCount++;
            }
        }
        
        console.log(`✅ Marked ${markedCount} messages as read`);
        
        res.json({
            message: `Marked ${markedCount} messages as read`,
            markedCount: markedCount
        });
        
    } catch (error) {
        console.error('❌ Mark messages as read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;