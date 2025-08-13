// =====================================================
// ФАЙЛ: utils/TronValidation.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/utils/TronValidation.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Валидация TRON адресов на backend
// =====================================================

const crypto = require('crypto');

class TronValidation {
    // TRON Base58 алфавит
    static BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    
    // Константы TRON
    static TRON_ADDRESS_PREFIX = "T";
    static TRON_ADDRESS_LENGTH = 34;
    static USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    /**
     * Основная функция валидации TRON адреса
     */
    static validateTronAddress(address) {
        try {
            // Базовые проверки
            if (!address || typeof address !== 'string') {
                console.log('❌ TRON validation: Empty or invalid address');
                return false;
            }

            // Проверка длины
            if (address.length !== this.TRON_ADDRESS_LENGTH) {
                console.log(`❌ TRON validation: Invalid length ${address.length}, expected ${this.TRON_ADDRESS_LENGTH}`);
                return false;
            }

            // Проверка префикса
            if (!address.startsWith(this.TRON_ADDRESS_PREFIX)) {
                console.log('❌ TRON validation: Invalid prefix, expected "T"');
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
            console.log(`❌ TRON validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Проверяет что адрес содержит только Base58 символы
     */
    static isValidBase58(address) {
        for (let i = 0; i < address.length; i++) {
            if (this.BASE58_ALPHABET.indexOf(address[i]) === -1) {
                return false;
            }
        }
        return true;
    }

    /**
     * Проверяет контрольную сумму TRON адреса
     */
    static verifyChecksum(address) {
        try {
            // Декодируем Base58
            const decoded = this.base58Decode(address);
            
            if (!decoded || decoded.length !== 25) {
                return false;
            }

            // Разделяем на payload и checksum
            const payload = decoded.slice(0, 21);
            const checksum = decoded.slice(21, 25);

            // Вычисляем ожидаемую контрольную сумму
            const hash1 = crypto.createHash('sha256').update(payload).digest();
            const hash2 = crypto.createHash('sha256').update(hash1).digest();
            const expectedChecksum = hash2.slice(0, 4);

            // Сравниваем контрольные суммы
            return Buffer.compare(checksum, expectedChecksum) === 0;

        } catch (error) {
            console.log(`❌ Checksum verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Декодирует Base58 строку в байты
     */
    static base58Decode(input) {
        try {
            const alphabet = this.BASE58_ALPHABET;
            const base = alphabet.length;
            
            let decoded = 0n;
            let multi = 1n;
            
            // Обрабатываем символы справа налево
            for (let i = input.length - 1; i >= 0; i--) {
                const char = input[i];
                const index = alphabet.indexOf(char);
                
                if (index === -1) {
                    throw new Error(`Invalid character: ${char}`);
                }
                
                decoded += BigInt(index) * multi;
                multi *= BigInt(base);
            }

            // Конвертируем BigInt в Buffer
            const hex = decoded.toString(16);
            const paddedHex = hex.length % 2 ? '0' + hex : hex;
            const result = Buffer.from(paddedHex, 'hex');

            // Добавляем ведущие нули
            let leadingZeros = 0;
            for (let i = 0; i < input.length && input[i] === alphabet[0]; i++) {
                leadingZeros++;
            }

            const leadingZeroBuffer = Buffer.alloc(leadingZeros);
            return Buffer.concat([leadingZeroBuffer, result]);

        } catch (error) {
            console.log(`❌ Base58 decode error: ${error.message}`);
            return null;
        }
    }

    /**
     * Упрощенная проверка TRON адреса по формату
     */
    static validateTronAddressSimple(address) {
        // Проверка длины
        if (!address || address.length !== this.TRON_ADDRESS_LENGTH) {
            return false;
        }

        // Проверка префикса
        if (!address.startsWith(this.TRON_ADDRESS_PREFIX)) {
            return false;
        }

        // Проверка что все символы валидные Base58
        return this.isValidBase58(address);
    }

    /**
     * Валидация криптосуммы
     */
    static validateCryptoAmount(amount) {
        try {
            // Проверка что это число
            if (typeof amount !== 'number' || !isFinite(amount) || isNaN(amount)) {
                console.log('❌ Crypto amount validation: Invalid number');
                return false;
            }

            // Проверка диапазона
            const minAmount = 0.000001; // 1 satoshi для USDT
            const maxAmount = 1000000;  // 1 миллион USDT

            if (amount < minAmount) {
                console.log(`❌ Crypto amount validation: Amount too small ${amount}, min: ${minAmount}`);
                return false;
            }

            if (amount > maxAmount) {
                console.log(`❌ Crypto amount validation: Amount too large ${amount}, max: ${maxAmount}`);
                return false;
            }

            // Проверка десятичных знаков (максимум 6 для USDT)
            const amountString = amount.toString();
            const decimalPart = amountString.split('.')[1];
            
            if (decimalPart && decimalPart.length > 6) {
                console.log(`❌ Crypto amount validation: Too many decimal places: ${decimalPart.length}`);
                return false;
            }

            console.log(`✅ Crypto amount validation: ${amount} is valid`);
            return true;

        } catch (error) {
            console.log(`❌ Crypto amount validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Проверяет является ли адрес USDT контрактом
     */
    static isUSDTContract(address) {
        return address === this.USDT_CONTRACT_ADDRESS;
    }

    /**
     * Форматирует адрес для отображения
     */
    static formatAddress(address) {
        if (!address || address.length < 10) {
            return address;
        }
        
        return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
    }
}

module.exports = TronValidation;