const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

chatSchema.pre('save', function(next) {
    if (this.participants.length !== 2) {
        next(new Error('Chat must have exactly 2 participants'));
    } else {
        next();
    }
});

module.exports = mongoose.model('Chat', chatSchema);
