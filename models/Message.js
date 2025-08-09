const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'crypto', 'system'],
        default: 'text'
    },
    cryptoAmount: {
        type: Number
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
        default: true
    }
}, {
    timestamps: true
});

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });

module.exports = mongoose.model('Message', messageSchema);
