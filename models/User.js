const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    nickname: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20
    },
    publicKey: {
        type: String,
        required: true,
        unique: true
    },
    tronAddress: {
        type: String,
        required: true,
        unique: true
    },
    firstName: {
        type: String,
        trim: true,
        maxlength: 50
    },
    lastName: {
        type: String,
        trim: true,
        maxlength: 50
    },
    avatar: {
        type: String
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

userSchema.index({ nickname: 1 });
userSchema.index({ tronAddress: 1 });
userSchema.index({ publicKey: 1 });

module.exports = mongoose.model('User', userSchema);
