// =====================================================
// ФАЙЛ: models/Message.js (BACKEND) - COMPLETE VERSION
// ПУТЬ: nickname-messenger-backend/models/Message.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Полная модель сообщений с E2E шифрованием
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
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 10000 // Увеличено для зашифрованного контента
    },
    messageType: {
        type: String,
        enum: ['text', 'crypto', 'system', 'encrypted'],
        default: 'text'
    },
    
    // НОВОЕ: E2E Encryption support
    isEncrypted: {
        type: Boolean,
        default: false
    },
    encryptionData: {
        type: EncryptionDataSchema,
        default: null
    },
    
    // Crypto payment fields
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
    
    // Message status and delivery
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

// НОВОЕ: Валидация зашифрованных сообщений
MessageSchema.pre('save', function(next) {
    // Если сообщение зашифровано, проверяем наличие данных шифрования
    if (this.isEncrypted && this.messageType === 'encrypted') {
        if (!this.encryptionData) {
            return next(new Error('Encryption data is required for encrypted messages'));
        }
        
        // Проверяем обязательные поля шифрования
        const requiredFields = ['algorithm', 'keyDerivation', 'iv', 'authTag', 'salt', 'senderPublicKey', 'fingerprint'];
        for (const field of requiredFields) {
            if (!this.encryptionData[field]) {
                return next(new Error(`Encryption data field '${field}' is required`));
            }
        }
    }
    
    // Если не зашифровано, убираем данные шифрования
    if (!this.isEncrypted) {
        this.encryptionData = null;
    }
    
    next();
});

// НОВОЕ: Метод для добавления отметки о прочтении
MessageSchema.methods.markAsRead = function(userId) {
    // Проверяем, не отмечено ли уже как прочитанное этим пользователем
    const existingReceipt = this.readReceipts.find(receipt => receipt.userId === userId);
    
    if (!existingReceipt) {
        this.readReceipts.push({
            userId: userId,
            readAt: new Date()
        });
        
        // Обновляем общий статус доставки если это отправитель
        if (this.senderId === userId) {
            this.deliveryStatus = 'read';
        }
    }
    
    return this;
};

// НОВОЕ: Метод для проверки, прочитано ли сообщение пользователем
MessageSchema.methods.isReadBy = function(userId) {
    return this.readReceipts.some(receipt => receipt.userId === userId);
};

// НОВОЕ: Метод для получения информации о шифровании
MessageSchema.methods.getEncryptionInfo = function() {
    if (!this.isEncrypted || !this.encryptionData) {
        return null;
    }
    
    return {
        algorithm: this.encryptionData.algorithm,
        version: this.encryptionData.version,
        fingerprint: this.encryptionData.fingerprint,
        isEncrypted: true
    };
};

// НОВОЕ: Статический метод для создания зашифрованного сообщения
MessageSchema.statics.createEncrypted = function(messageData, encryptionData) {
    return new this({
        ...messageData,
        messageType: 'encrypted',
        isEncrypted: true,
        encryptionData: encryptionData
    });
};

// НОВОЕ: Виртуальное поле для отображаемого контента
MessageSchema.virtual('displayContent').get(function() {
    if (this.isEncrypted && this.messageType === 'encrypted') {
        return '🔐 Encrypted message';
    }
    
    switch (this.messageType) {
        case 'text':
        case 'encrypted':
            return this.content;
        case 'crypto':
            if (this.cryptoAmount) {
                return `💰 Sent ${this.cryptoAmount.toFixed(6)} USDT`;
            }
            return '💰 Crypto transaction';
        case 'system':
            return this.content;
        default:
            return this.content;
    }
});

// Индексы для быстрого поиска
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ messageType: 1 });
MessageSchema.index({ isEncrypted: 1 });
MessageSchema.index({ deliveryStatus: 1 });

// НОВОЕ: Индекс для зашифрованных сообщений
MessageSchema.index({ 
    chatId: 1, 
    isEncrypted: 1, 
    'encryptionData.senderPublicKey': 1 
});

// Включаем виртуальные поля в JSON
MessageSchema.set('toJSON', { 
    virtuals: true,
    transform: function(doc, ret) {
        // Удаляем чувствительные данные из JSON ответа в определенных случаях
        if (ret.isEncrypted && ret.encryptionData) {
            // Оставляем все данные шифрования для клиента
            // В продакшене можно добавить дополнительную логику безопасности
        }
        return ret;
    }
});

MessageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Message', MessageSchema);