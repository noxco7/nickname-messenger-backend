// =====================================================
// ФАЙЛ: routes/messages.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/routes/messages.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Защищенные сообщения роуты с JWT
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
            transactionStatus
        } = req.body;
        
        const senderId = req.user.id; // Получаем из JWT токена
        
        console.log(`📤 Sending message from ${req.user.nickname} to chat ${chatId}`);
        
        if (!chatId || !content) {
            return res.status(400).json({
                error: 'Missing required fields: chatId, content'
            });
        }
        
        // НОВОЕ: Проверяем существование чата и участие пользователя
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!chat.participants.includes(senderId)) {
            console.log('❌ User not authorized to send message to this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        // Создаем сообщение
        const messageData = { chatId, senderId, content, messageType };
        
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

// Получение сообщений чата (ЗАЩИЩЕНО)
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        console.log(`📥 Getting messages for chat ${chatId} by user: ${req.user.nickname}`);
        
        // НОВОЕ: Проверяем доступ к чату
        const chat = await Chat.findById(chatId);
        if (!chat) {
            console.log('❌ Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not authorized to view messages in this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
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
        
        // НОВОЕ: Проверяем что пользователь является отправителем
        if (message.senderId !== req.user.id) {
            console.log('❌ User not authorized to update this message');
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
        
        if (!chat.participants.includes(req.user.id)) {
            console.log('❌ User not authorized to mark messages in this chat');
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        let query = { chatId };
        if (messageIds && Array.isArray(messageIds)) {
            query._id = { $in: messageIds };
        }
        
        // Обновляем статус прочтения
        const result = await Message.updateMany(
            query,
            {
                $addToSet: {
                    readBy: {
                        userId: req.user.id,
                        readAt: new Date()
                    }
                }
            }
        );
        
        console.log(`✅ Marked ${result.modifiedCount} messages as read`);
        
        res.json({
            message: 'Messages marked as read',
            markedCount: result.modifiedCount
        });
        
    } catch (error) {
        console.error('❌ Mark messages as read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Удаление сообщения (ЗАЩИЩЕНО - только отправитель)
router.delete('/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        console.log(`🗑️ Deleting message ${messageId} by user: ${req.user.nickname}`);
        
        const message = await Message.findById(messageId);
        if (!message) {
            console.log('❌ Message not found');
            return res.status(404).json({ error: 'Message not found' });
        }
        
        // НОВОЕ: Проверяем что пользователь является отправителем
        if (message.senderId !== req.user.id) {
            console.log('❌ User not authorized to delete this message');
            return res.status(403).json({ error: 'Access denied. You can only delete your own messages' });
        }
        
        await Message.findByIdAndDelete(messageId);
        
        console.log(`✅ Message deleted: ${messageId}`);
        
        res.json({
            message: 'Message deleted successfully',
            messageId: messageId
        });
        
    } catch (error) {
        console.error('❌ Delete message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Поиск сообщений в чате (ЗАЩИЩЕНО)
router.get('/:chatId/search', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { query, limit = 20, offset = 0 } = req.query;
        
        console.log(`🔍 Searching messages in chat ${chatId} by user: ${req.user.nickname}`);
        
        // Проверяем доступ к чату
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        if (!chat.participants.includes(req.user.id)) {
            return res.status(403).json({ error: 'Access denied. You are not a participant of this chat' });
        }
        
        if (!query) {
            return res.json({ messages: [], total: 0 });
        }
        
        const searchRegex = new RegExp(query, 'i');
        
        const messages = await Message.find({
            chatId,
            content: searchRegex
        })
        .populate('senderId', 'nickname firstName lastName avatar')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));
        
        const total = await Message.countDocuments({
            chatId,
            content: searchRegex
        });
        
        console.log(`✅ Found ${messages.length} messages matching search`);
        
        res.json({
            messages,
            total,
            query
        });
        
    } catch (error) {
        console.error('❌ Search messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
