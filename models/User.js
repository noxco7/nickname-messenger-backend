const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
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
    timestamps: true, // Автоматически добавляет createdAt и updatedAt
    collection: 'users' // Явно указываем имя коллекции
});

// Виртуальное поле для отображаемого имени
UserSchema.virtual('displayName').get(function() {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.nickname;
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