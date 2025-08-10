const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    senderId: {
        type: String, // ИСПРАВЛЕНО: используем String для UUID
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 2000
    },
    messageType: {
        type: String,
        enum: ['text', 'crypto', 'system'],
        default: 'text'
    },
    cryptoAmount: {
        type: Number,
        min: 0
    },
    transactionHash: {
        type: String
    },
    transactionStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'failed']
    },
    isEncrypted: {
        type: Boolean,
        default: false
    },
    readBy: [{
        userId: {
            type: String // ИСПРАВЛЕНО: используем String для UUID
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true,
    collection: 'messages'
});

// Индексы для быстрого поиска
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ messageType: 1 });

module.exports = mongoose.model('Message', MessageSchema);