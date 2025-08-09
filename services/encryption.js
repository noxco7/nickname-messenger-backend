const crypto = require('crypto');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
    }

    generateKey() {
        return crypto.randomBytes(this.keyLength);
    }

    encrypt(data, key) {
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipher(this.algorithm, key, { iv });
            
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex')
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Encryption failed');
        }
    }

    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    createSignature(data, secret) {
        return crypto.createHmac('sha256', secret).update(data).digest('hex');
    }
}

module.exports = EncryptionService;
