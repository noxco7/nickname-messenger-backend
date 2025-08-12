// =====================================================
// ФАЙЛ: utils/tronValidation.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/utils/tronValidation.js
// ТИП: Node.js Utility
// ОПИСАНИЕ: Валидация TRON адресов на сервере
// =====================================================

const crypto = require('crypto');

class TronValidation {
    
    // TRON Base58 alphabet (без 0, O, I, l)
    static BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    // Префиксы TRON адресов
    static TRON_ADDRESS_PREFIX = 'T';
    static TRON_ADDRESS_LENGTH = 34;
    
    // USDT TRC20 contract address
    static USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    /**
     * Основная функция валидации TRON адреса
     * @param {string} address - TRON адрес для проверки
     * @returns {boolean} - true если адрес валидный
     */
    static validateTronAddress(address) {
        try {
            // Базовые проверки
            if (!address || typeof address !== 'string') {
                console.log('❌ TRON validation: Invalid input type');
                return false;
            }
            
            // Проверка длины
            if (address.length !== this.TRON_ADDRESS_LENGTH) {
                console.log(`❌ TRON validation: Invalid length ${address.length}, expected ${this.TRON_ADDRESS_LENGTH}`);
                return false;
            }
            
            // Проверка префикса
            if (!address.startsWith(this.TRON_ADDRESS_PREFIX)) {
                console.log(`❌ TRON validation: Invalid prefix, expected 'T'`);
                return false;
            }
            
            // Проверка символов (Base58)
            if (!this.isValidBase58(address)) {
                console.log('❌ TRON validation: Invalid Base58 characters');
                return false;
            }
            
            // Проверка контрольной суммы
            if (!this.verifyChecksum(address)) {
                console.log('❌ TRON validation: Invalid checksum');
                return false;
            }
            
            console.log(`✅ TRON validation: Address ${address} is valid`);
            return true;
            
        } catch (error) {
            console.error('❌ TRON validation error:', error);
            return false;
        }
    }
    
    /**
     * Проверяет что адрес содержит только Base58 символы
     * @param {string} address - адрес для проверки
     * @returns {boolean}
     */
    static isValidBase58(address) {
        for (let i = 0; i < address.length; i++) {
            if (!this.BASE58_ALPHABET.includes(address[i])) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * Проверяет контрольную сумму TRON адреса
     * @param {string} address - TRON адрес
     * @returns {boolean}
     */
    static verifyChecksum(address) {
        try {
            // Декодируем Base58
            const decoded = this.base58Decode(address);
            
            if (!decoded || decoded.length !== 25) {
                return false;
            }
            
            // Разделяем адрес и контрольную сумму
            const addressBytes = decoded.slice(0, 21);
            const checksum = decoded.slice(21);
            
            // Вычисляем контрольную сумму
            const hash1 = crypto.createHash('sha256').update(addressBytes).digest();
            const hash2 = crypto.createHash('sha256').update(hash1).digest();
            const computedChecksum = hash2.slice(0, 4);
            
            // Сравниваем контрольные суммы
            return checksum.equals(computedChecksum);
            
        } catch (error) {
            console.error('❌ Checksum verification error:', error);
            return false;
        }
    }
    
    /**
     * Декодирует Base58 строку в Buffer
     * @param {string} str - Base58 строка
     * @returns {Buffer|null}
     */
    static base58Decode(str) {
        try {
            const alphabet = this.BASE58_ALPHABET;
            let num = BigInt(0);
            let base = BigInt(1);
            
            // Конвертируем в число
            for (let i = str.length - 1; i >= 0; i--) {
                const char = str[i];
                const index = alphabet.indexOf(char);
                
                if (index === -1) {
                    return null;
                }
                
                num += BigInt(index) * base;
                base *= BigInt(58);
            }
            
            // Конвертируем в байты
            const bytes = [];
            while (num > 0) {
                bytes.unshift(Number(num % BigInt(256)));
                num = num / BigInt(256);
            }
            
            // Добавляем ведущие нули
            for (let i = 0; i < str.length && str[i] === alphabet[0]; i++) {
                bytes.unshift(0);
            }
            
            return Buffer.from(bytes);
            
        } catch (error) {
            console.error('❌ Base58 decode error:', error);
            return null;
        }
    }
    
    /**
     * Валидация криптосуммы
     * @param {number} amount - сумма для проверки
     * @returns {boolean}
     */
    static validateCryptoAmount(amount) {
        // Проверка типа
        if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
            console.log('❌ Crypto amount validation: Invalid number');
            return false;
        }
        
        // Проверка диапазона
        const MIN_AMOUNT = 0.000001; // 1 satoshi для USDT
        const MAX_AMOUNT = 1000000;  // 1 миллион USDT
        
        if (amount < MIN_AMOUNT) {
            console.log(`❌ Crypto amount validation: Amount too small ${amount}, min: ${MIN_AMOUNT}`);
            return false;
        }
        
        if (amount > MAX_AMOUNT) {
            console.log(`❌ Crypto amount validation: Amount too large ${amount}, max: ${MAX_AMOUNT}`);
            return false;
        }
        
        // Проверка десятичных знаков (максимум 6 для USDT)
        const decimalPlaces = (amount.toString().split('.')[1] || '').length;
        if (decimalPlaces > 6) {
            console.log(`❌ Crypto amount validation: Too many decimal places ${decimalPlaces}, max: 6`);
            return false;
        }
        
        console.log(`✅ Crypto amount validation: ${amount} is valid`);
        return true;
    }
    
    /**
     * Проверяет что адрес является USDT контрактом
     * @param {string} address - адрес для проверки
     * @returns {boolean}
     */
    static isUSDTContract(address) {
        return address === this.USDT_CONTRACT_ADDRESS;
    }
    
    /**
     * Форматирует TRON адрес для отображения
     * @param {string} address - TRON адрес
     * @returns {string} - сокращенный адрес
     */
    static formatAddress(address) {
        if (!address || address.length < 12) {
            return address;
        }
        
        const start = address.substring(0, 6);
        const end = address.substring(address.length - 6);
        return `${start}...${end}`;
    }
    
    /**
     * Получает информацию о типе адреса
     * @param {string} address - TRON адрес
     * @returns {object} - информация об адресе
     */
    static getAddressInfo(address) {
        const result = {
            isValid: this.validateTronAddress(address),
            isUSDTContract: false,
            formatted: this.formatAddress(address),
            type: 'unknown'
        };
        
        if (result.isValid) {
            result.isUSDTContract = this.isUSDTContract(address);
            result.type = result.isUSDTContract ? 'usdt_contract' : 'wallet';
        }
        
        return result;
    }
    
    /**
     * Валидация для API endpoint'ов
     * @param {object} req - Express request
     * @param {object} res - Express response  
     * @param {function} next - Express next
     */
    static validateTronAddressMiddleware(req, res, next) {
        const { tronAddress } = req.body;
        
        if (!tronAddress) {
            return res.status(400).json({
                error: 'TRON address is required',
                code: 'MISSING_TRON_ADDRESS'
            });
        }
        
        if (!TronValidation.validateTronAddress(tronAddress)) {
            return res.status(400).json({
                error: 'Invalid TRON address format',
                code: 'INVALID_TRON_ADDRESS',
                details: {
                    address: tronAddress,
                    expectedFormat: 'T + 33 Base58 characters',
                    example: 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH'
                }
            });
        }
        
        // Добавляем информацию об адресе в request
        req.tronAddressInfo = TronValidation.getAddressInfo(tronAddress);
        next();
    }
    
    /**
     * Валидация криптосуммы для API
     * @param {object} req - Express request
     * @param {object} res - Express response
     * @param {function} next - Express next
     */
    static validateCryptoAmountMiddleware(req, res, next) {
        const { amount, cryptoAmount } = req.body;
        const amountToValidate = amount || cryptoAmount;
        
        if (amountToValidate === undefined || amountToValidate === null) {
            return res.status(400).json({
                error: 'Crypto amount is required',
                code: 'MISSING_CRYPTO_AMOUNT'
            });
        }
        
        if (!TronValidation.validateCryptoAmount(amountToValidate)) {
            return res.status(400).json({
                error: 'Invalid crypto amount',
                code: 'INVALID_CRYPTO_AMOUNT',
                details: {
                    amount: amountToValidate,
                    minAmount: 0.000001,
                    maxAmount: 1000000,
                    maxDecimals: 6
                }
            });
        }
        
        next();
    }
}

module.exports = TronValidation;