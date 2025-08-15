// =====================================================
// ФАЙЛ: models/User.js (BACKEND) - ОБНОВЛЕННАЯ ВЕРСЯ
// ПУТЬ: nickname-messenger-backend/models/User.js
// ОПИСАНИЕ: Добавлено поле deviceTokens для push-уведомлений
// =====================================================

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    nickname: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20,
        match: /^[a-zA-Z0-9_]+$/
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
        type: String,
        default: null
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    // ---> НАЧАЛО ИЗМЕНЕНИЙ
    deviceTokens: {
        type: [String],
        default: []
    }
    // <--- КОНЕЦ ИЗМЕНЕНИЙ
}, {
    _id: false,
    timestamps: true,
    collection: 'users'
});

UserSchema.virtual('displayName').get(function() {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.nickname;
});

UserSchema.virtual('id').get(function() {
    return this._id;
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

UserSchema.index({ nickname: 1 });
UserSchema.index({ tronAddress: 1 });
UserSchema.index({ publicKey: 1 });
UserSchema.index({ firstName: 'text', lastName: 'text', nickname: 'text' });

module.exports = mongoose.model('User', UserSchema);