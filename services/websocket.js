const User = require('../models/User');
const Message = require('../models/Message');
const Chat = require('../models/Chat');

class WebSocketService {
    constructor(io) {
        this.io = io;
        this.connectedUsers = new Map();
        this.userSockets = new Map();
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log('🔗 User connected:', socket.id);

            socket.on('authenticate', async (data) => {
                try {
                    const { nickname } = data;
                    const user = await User.findOne({ nickname });
                    
                    if (user) {
                        this.connectedUsers.set(user._id.toString(), socket.id);
                        this.userSockets.set(socket.id, user._id.toString());
                        
                        await User.findByIdAndUpdate(user._id, {
                            isOnline: true,
                            lastSeen: new Date()
                        });
                        
                        socket.userId = user._id.toString();
                        socket.emit('authenticated', { success: true, userId: user._id });
                        
                        this.broadcastUserStatus(user._id.toString(), true);
                        
                        console.log(`✅ User ${nickname} authenticated`);
                    } else {
                        socket.emit('authenticated', { success: false, error: 'User not found' });
                    }
                } catch (error) {
                    console.error('Authentication error:', error);
                    socket.emit('authenticated', { success: false, error: 'Authentication failed' });
                }
            });

            socket.on('joinChat', (data) => {
                const { chatId } = data;
                socket.join(chatId);
                console.log(`📨 Socket ${socket.id} joined chat ${chatId}`);
            });

            socket.on('leaveChat', (data) => {
                const { chatId } = data;
                socket.leave(chatId);
                console.log(`📤 Socket ${socket.id} left chat ${chatId}`);
            });

            socket.on('sendMessage', async (messageData) => {
                try {
                    const message = new Message(messageData);
                    await message.save();
                    await message.populate('senderId', 'nickname firstName lastName avatar');

                    await Chat.findByIdAndUpdate(messageData.chatId, {
                        lastMessage: message._id,
                        lastMessageAt: new Date()
                    });

                    this.io.to(messageData.chatId).emit('message', {
                        id: message._id,
                        chatId: message.chatId,
                        senderId: message.senderId._id,
                        content: message.content,
                        messageType: message.messageType,
                        timestamp: message.createdAt
                    });

                } catch (error) {
                    console.error('Send message error:', error);
                    socket.emit('messageError', { error: 'Failed to send message' });
                }
            });

            socket.on('disconnect', async () => {
                console.log('🔌 User disconnected:', socket.id);
                
                const userId = this.userSockets.get(socket.id);
                if (userId) {
                    await User.findByIdAndUpdate(userId, {
                        isOnline: false,
                        lastSeen: new Date()
                    });

                    this.connectedUsers.delete(userId);
                    this.userSockets.delete(socket.id);
                    this.broadcastUserStatus(userId, false);
                }
            });
        });
    }

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
            console.error('Broadcast user status error:', error);
        }
    }
}

module.exports = WebSocketService;
