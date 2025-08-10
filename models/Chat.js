const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    participants: [{
        type: String, // ИСПРАВЛЕНО: используем String вместо ObjectId для UUID
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    chatType: {
        type: String,
        enum: ['direct', 'group'],
        default: 'direct'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'chats'
});

// Валидация для direct чатов (только 2 участника)
ChatSchema.pre('save', function(next) {
    if (this.chatType === 'direct' && this.participants.length !== 2) {
        return next(new Error('Direct chat must have exactly 2 participants'));
    }
    next();
});

// Индексы
ChatSchema.index({ participants: 1 });
ChatSchema.index({ lastMessageAt: -1 });
ChatSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Chat', ChatSchema);