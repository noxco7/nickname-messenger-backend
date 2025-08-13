// =====================================================
// ФАЙЛ: services/websocket.js (BACKEND) - ENHANCED VERSION
// ПУТЬ: nickname-messenger-backend/services/websocket.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Обновленный WebSocket сервис с E2E шифрованием
// =====================================================

const User = require('../models/User');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { verifyToken } = require('../middleware/auth');

class WebSocketService {
    constructor(io) {
        this.io = io;
        this.connectedUsers = new Map(); // userId -> socketId
        this.userSockets = new Map(); // socketId -> userData
        this.chatRooms = new Map(); // chatId -> Set of socketIds
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log('🔗 Client connected:', socket.id);

            // НОВОЕ: JWT аутентификация через WebSocket
            socket.on('authenticate', async (data) => {
                try {
                    const { token } = data;
                    
                    if (!token) {
                        socket.emit('authenticated', { 
                            success: false, 
                            error: 'No token provided' 
                        });
                        return;
                    }

                    // Проверяем JWT токен
                    const userData = await verifyToken(token);
                    
                    if (userData) {
                        // Сохраняем пользователя
                        this.connectedUsers.set(userData.id, socket.id);
                        this.userSockets.set(socket.id, userData);
                        
                        // Обновляем статус пользователя
                        await User.findByIdAndUpdate(userData.id, {
                            isOnline: true,
                            lastSeen: new Date()
                        });
                        
                        socket.userId = userData.id;
                        socket.userData = userData;
                        
                        socket.emit('authenticated', { 
                            success: true, 
                            userId: userData.id,
                            nickname: userData.nickname
                        });
                        
                        this.broadcastUserStatus(userData.id, true);
                        
                        console.log(`✅ User ${userData.nickname} authenticated via JWT`);
                    } else {
                        socket.emit('authenticated', { 
                            success: false, 
                            error: 'Invalid token' 
                        });
                    }
                } catch (error) {
                    console.error('❌ WebSocket authentication error:', error);
                    socket.emit('authenticated', { 
                        success: false, 
                        error: 'Authentication failed' 
                    });
                }
            });

            // Присоединение к чату
            socket.on('joinChat', async (data) => {
                try {
                    const { chatId } = data;
                    
                    if (!socket.userData) {
                        socket.emit('error', { message: 'Not authenticated' });
                        return;
                    }

                    // Проверяем права доступа к чату
                    const chat = await Chat.findById(chatId);
                    // ИСПРАВЛЕНО: Приводим ID к строке для корректного сравнения
                    if (!chat || !chat.participants.includes(String(socket.userData.id))) {
                        socket.emit('error', { message: 'Access denied to chat' });
                        return;
                    }

                    socket.join(chatId);
                    
                    // Добавляем в мапу комнат
                    if (!this.chatRooms.has(chatId)) {
                        this.chatRooms.set(chatId, new Set());
                    }
                    this.chatRooms.get(chatId).add(socket.id);
                    
                    socket.emit('joinedChat', { chatId });
                    console.log(`📨 Socket ${socket.id} joined chat ${chatId}`);
                } catch (error) {
                    console.error('❌ Join chat error:', error);
                    socket.emit('error', { message: 'Failed to join chat' });
                }
            });

            // Покидание чата
            socket.on('leaveChat', (data) => {
                const { chatId } = data;
                socket.leave(chatId);
                
                if (this.chatRooms.has(chatId)) {
                    this.chatRooms.get(chatId).delete(socket.id);
                    if (this.chatRooms.get(chatId).size === 0) {
                        this.chatRooms.delete(chatId);
                    }
                }
                
                socket.emit('leftChat', { chatId });
                console.log(`📤 Socket ${socket.id} left chat ${chatId}`);
            });

            // НОВОЕ: Отправка сообщения с поддержкой шифрования
            socket.on('sendMessage', async (messageData) => {
                try {
                    if (!socket.userData) {
                        socket.emit('messageError', { error: 'Not authenticated' });
                        return;
                    }

                    console.log(`📤 WebSocket message from ${socket.userData.nickname}`);
                    console.log(`   - Encrypted: ${messageData.isEncrypted || false}`);
                    console.log(`   - Type: ${messageData.messageType || 'text'}`);

                    // Проверяем доступ к чату
                    const chat = await Chat.findById(messageData.chatId);
                    // ИСПРАВЛЕНО: Приводим ID к строке для корректного сравнения
                    if (!chat || !chat.participants.includes(String(socket.userData.id))) {
                        socket.emit('messageError', { error: 'Access denied to chat' });
                        return;
                    }

                    // Подготавливаем данные сообщения
                    const messagePayload = {
                        chatId: messageData.chatId,
                        senderId: socket.userData.id,
                        content: messageData.content,
                        messageType: messageData.isEncrypted ? 'encrypted' : (messageData.messageType || 'text'),
                        isEncrypted: messageData.isEncrypted || false,
                        deliveryStatus: 'delivered'
                    };

                    // НОВОЕ: Добавляем данные шифрования если есть
                    if (messageData.isEncrypted && messageData.encryptionData) {
                        messagePayload.encryptionData = messageData.encryptionData;
                        console.log('🔐 Message includes encryption data');
                    }

                    // Добавляем данные криптотранзакции если есть
                    if (messageData.messageType === 'crypto') {
                        if (messageData.cryptoAmount) messagePayload.cryptoAmount = messageData.cryptoAmount;
                        if (messageData.transactionHash) messagePayload.transactionHash = messageData.transactionHash;
                        if (messageData.transactionStatus) messagePayload.transactionStatus = messageData.transactionStatus;
                    }

                    // Сохраняем в базе данных
                    const message = new Message(messagePayload);
                    await message.save();

                    // Обновляем чат
                    await Chat.findByIdAndUpdate(messageData.chatId, {
                        lastMessage: message._id,
                        lastMessageAt: new Date()
                    });

                    // Популируем данные отправителя
                    await message.populate('senderId', 'nickname firstName lastName avatar');

                    // НОВОЕ: Подготавливаем данные для отправки через WebSocket
                    const webSocketMessage = {
                        id: message._id,
                        chatId: message.chatId,
                        senderId: message.senderId._id || message.senderId,
                        senderInfo: {
                            nickname: socket.userData.nickname,
                            firstName: message.senderId.firstName,
                            lastName: message.senderId.lastName,
                            avatar: message.senderId.avatar
                        },
                        content: message.content,
                        messageType: message.messageType,
                        timestamp: message.createdAt,
                        isEncrypted: message.isEncrypted,
                        encryptionData: message.encryptionData,
                        deliveryStatus: message.deliveryStatus,
                        cryptoAmount: message.cryptoAmount,
                        transactionHash: message.transactionHash,
                        transactionStatus: message.transactionStatus
                    };

                    // Отправляем сообщение всем участникам чата
                    this.io.to(messageData.chatId).emit('message', webSocketMessage);

                    // Отправляем подтверждение отправителю
                    socket.emit('messageSent', {
                        tempId: messageData.tempId, // Временный ID для синхронизации клиента
                        messageId: message._id,
                        timestamp: message.createdAt
                    });

                    console.log(`✅ ${message.isEncrypted ? 'Encrypted' : 'Plain'} message sent via WebSocket: ${message._id}`);

                } catch (error) {
                    console.error('❌ WebSocket send message error:', error);
                    socket.emit('messageError', { 
                        error: 'Failed to send message',
                        details: error.message,
                        tempId: messageData.tempId
                    });
                }
            });

            // НОВОЕ: Отправка статуса прочтения
            socket.on('sendReadReceipt', async (data) => {
                try {
                    const { messageId, chatId } = data;
                    
                    if (!socket.userData) {
                        return;
                    }

                    // Проверяем доступ к чату
                    const chat = await Chat.findById(chatId);
                    // ИСПРАВЛЕНО: Приводим ID к строке для корректного сравнения
                    if (!chat || !chat.participants.includes(String(socket.userData.id))) {
                        return;
                    }

                    // Обновляем статус прочтения
                    const message = await Message.findById(messageId);
                    if (message) {
                        message.markAsRead(socket.userData.id);
                        await message.save();

                        // Уведомляем других участников
                        socket.to(chatId).emit('messageRead', {
                            messageId: messageId,
                            userId: socket.userData.id,
                            readAt: new Date()
                        });

                        console.log(`📖 Message ${messageId} marked as read by ${socket.userData.nickname}`);
                    }

                } catch (error) {
                    console.error('❌ Read receipt error:', error);
                }
            });

            // Уведомление о наборе текста
            socket.on('typing', (data) => {
                const { chatId, isTyping } = data;
                
                if (!socket.userData) return;

                socket.to(chatId).emit('userTyping', {
                    userId: socket.userData.id,
                    nickname: socket.userData.nickname,
                    isTyping: isTyping
                });
            });

            // Обработка отключения
            socket.on('disconnect', async () => {
                console.log('🔌 Client disconnected:', socket.id);
                
                const userData = this.userSockets.get(socket.id);
                if (userData) {
                    // Обновляем статус пользователя
                    await User.findByIdAndUpdate(userData.id, {
                        isOnline: false,
                        lastSeen: new Date()
                    });

                    // Удаляем из мапов
                    this.connectedUsers.delete(userData.id);
                    this.userSockets.delete(socket.id);

                    // Удаляем из чат-комнат
                    for (const [chatId, sockets] of this.chatRooms.entries()) {
                        sockets.delete(socket.id);
                        if (sockets.size === 0) {
                            this.chatRooms.delete(chatId);
                        }
                    }

                    // Уведомляем о смене статуса
                    this.broadcastUserStatus(userData.id, false);

                    console.log(`👋 User ${userData.nickname} disconnected`);
                }
            });
        });

        console.log('🚀 Enhanced WebSocket service with E2E encryption initialized');
    }

    // Уведомление о статусе пользователя
    async broadcastUserStatus(userId, isOnline) {
        try {
            const chats = await Chat.find({ participants: userId });
            
            for (const chat of chats) {
                this.io.to(chat._id.toString()).emit('userStatus', {
                    userId,
                    isOnline,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            console.error('❌ Broadcast user status error:', error);
        }
    }

    // Отправка системного сообщения в чат
    async sendSystemMessage(chatId, content) {
        try {
            const systemMessage = new Message({
                chatId: chatId,
                senderId: 'system',
                content: content,
                messageType: 'system',
                deliveryStatus: 'delivered'
            });

            await systemMessage.save();

            this.io.to(chatId).emit('message', {
                id: systemMessage._id,
                chatId: systemMessage.chatId,
                senderId: 'system',
                content: systemMessage.content,
                messageType: 'system',
                timestamp: systemMessage.createdAt,
                isEncrypted: false
            });

            console.log(`📢 System message sent to chat ${chatId}: ${content}`);

        } catch (error) {
            console.error('❌ Send system message error:', error);
        }
    }

    // Получение статистики подключений
    getConnectionStats() {
        return {
            connectedUsers: this.connectedUsers.size,
            activeChats: this.chatRooms.size,
            totalSockets: this.userSockets.size
        };
    }
}

module.exports = WebSocketService;