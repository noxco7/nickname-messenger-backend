const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // ИСПРАВЛЕНО: Убираем уникальность и валидацию для совместимости с UUID
    _id: {
        type: String, // Используем String вместо ObjectId для UUID
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
    }
}, {
    _id: false, // ВАЖНО: отключаем автогенерацию _id
    timestamps: true,
    collection: 'users'
});

// Виртуальное поле для отображаемого имени
UserSchema.virtual('displayName').get(function() {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.nickname;
});

// ДОБАВЛЕНО: Виртуальное поле id для совместимости с клиентом
UserSchema.virtual('id').get(function() {
    return this._id;
});

// Включаем виртуальные поля в JSON
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// Индексы для быстрого поиска
UserSchema.index({ nickname: 1 });
UserSchema.index({ tronAddress: 1 });
UserSchema.index({ publicKey: 1 });
UserSchema.index({ firstName: 'text', lastName: 'text', nickname: 'text' });

module.exports = mongoose.model('User', UserSchema);