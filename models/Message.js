// =====================================================
// ФАЙЛ: models/Message.js (BACKEND) - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/models/Message.js
// ОПИСАНИЕ: Полная модель сообщений с корректной ссылкой на User
// =====================================================

const mongoose = require('mongoose');

const EncryptionDataSchema = new mongoose.Schema({
    algorithm: {
        type: String,
        required: true,
        enum: ['AES-256-GCM'],
        default: 'AES-256-GCM'
    },
    keyDerivation: {
        type: String,
        required: true,
        enum: ['HKDF-SHA256'],
        default: 'HKDF-SHA256'
    },
    iv: {
        type: String,
        required: true
    },
    authTag: {
        type: String,
        required: true
    },
    salt: {
        type: String,
        required: true
    },
    senderPublicKey: {
        type: String,
        required: true
    },
    version: {
        type: String,
        required: true,
        default: '1.0'
    },
    fingerprint: {
        type: String,
        required: true
    }
}, { _id: false });

const ReadReceiptSchema = new mongoose.Schema({
    userId: {
        type: String, // UUID
        required: true
    },
    readAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    senderId: {
        type: String, // UUID
        ref: 'User',  // <--- ВАЖНОЕ ИСПРАВЛЕНИЕ
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 10000
    },
    messageType: {
        type: String,
        enum: ['text', 'crypto', 'system', 'encrypted'],
        default: 'text'
    },
    isEncrypted: {
        type: Boolean,
        default: false
    },
    encryptionData: {
        type: EncryptionDataSchema,
        default: null
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
    deliveryStatus: {
        type: String,
        enum: ['sending', 'delivered', 'failed', 'read'],
        default: 'delivered'
    },
    readReceipts: [ReadReceiptSchema]
    
}, {
    timestamps: true,
    collection: 'messages'
});

// Валидация зашифрованных сообщений
MessageSchema.pre('save', function(next) {
    if (this.isEncrypted && this.messageType === 'encrypted') {
        if (!this.encryptionData) {
            return next(new Error('Encryption data is required for encrypted messages'));
        }
        
        const requiredFields = ['algorithm', 'keyDerivation', 'iv', 'authTag', 'salt', 'senderPublicKey', 'fingerprint'];
        for (const field of requiredFields) {
            if (!this.encryptionData[field]) {
                return next(new Error(`Encryption data field '${field}' is required`));
            }
        }
    }
    
    if (!this.isEncrypted) {
        this.encryptionData = null;
    }
    
    next();
});

// Метод для добавления отметки о прочтении
MessageSchema.methods.markAsRead = function(userId) {
    const existingReceipt = this.readReceipts.find(receipt => String(receipt.userId) === String(userId));
    
    if (!existingReceipt) {
        this.readReceipts.push({
            userId: userId,
            readAt: new Date()
        });
        
        if (String(this.senderId) === String(userId)) {
            this.deliveryStatus = 'read';
        }
    }
    
    return this;
};

// Метод для проверки, прочитано ли сообщение пользователем
MessageSchema.methods.isReadBy = function(userId) {
    return this.readReceipts.some(receipt => String(receipt.userId) === String(userId));
};

// Виртуальное поле для отображаемого контента
MessageSchema.virtual('displayContent').get(function() {
    if (this.isEncrypted && this.messageType === 'encrypted') {
        return '🔐 Encrypted message';
    }
    
    switch (this.messageType) {
        case 'text':
        case 'encrypted':
            return this.content;
        case 'crypto':
            return this.cryptoAmount ? `💰 Sent ${this.cryptoAmount.toFixed(6)} USDT` : '💰 Crypto transaction';
        case 'system':
            return this.content;
        default:
            return this.content;
    }
});

// Индексы
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });

// Включаем виртуальные поля в JSON
MessageSchema.set('toJSON', { virtuals: true });
MessageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Message', MessageSchema);
