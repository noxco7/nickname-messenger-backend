// =====================================================
// ФАЙЛ: routes/auth.js (BACKEND) - FULLY CORRECTED VERSION
// ПУТЬ: nickname-messenger-backend/routes/auth.js
// ТИП: Node.js Backend
// ОПИСАНИЕ: Исправленный роут аутентификации без синтаксических ошибок
// =====================================================

const express = require('express');
const User = require('../models/User');
// ИСПРАВЛЕНО: Правильный импорт (проверьте имя файла!)
const TronValidation = require('../utils/tronValidation');
const { generateToken, authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Регистрация пользователя
router.post('/register', async (req, res) => {
    try {
        const { id, nickname, publicKey, tronAddress, firstName, lastName, avatar } = req.body;

        console.log(`🚀 Registration request received:`);
        console.log(`   - ID: ${id}`);
        console.log(`   - Nickname: ${nickname}`);
        console.log(`   - TRON Address: ${tronAddress}`);

        // Валидация обязательных полей
        if (!nickname || !publicKey || !tronAddress) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey, tronAddress',
                code: 'MISSING_FIELDS'
            });
        }

        // Валидация nickname
        if (nickname.length < 3 || nickname.length > 20) {
            return res.status(400).json({
                error: 'Nickname must be between 3 and 20 characters',
                code: 'INVALID_NICKNAME'
            });
        }

        const nicknameRegex = /^[a-zA-Z0-9_]+$/;
        if (!nicknameRegex.test(nickname)) {
            return res.status(400).json({
                error: 'Nickname can only contain letters, numbers, and underscores',
                code: 'INVALID_NICKNAME_FORMAT'
            });
        }

        // Валидация TRON адреса
        if (!TronValidation.validateTronAddress(tronAddress)) {
            return res.status(400).json({
                error: 'Invalid TRON address format',
                code: 'INVALID_TRON_ADDRESS'
            });
        }

        // НОВОЕ: Подробная информация об адресе
        const addressInfo = {
            isValid: true,
            isUSDTContract: TronValidation.isUSDTContract ? TronValidation.isUSDTContract(tronAddress) : false,
            formatted: TronValidation.formatAddress ? TronValidation.formatAddress(tronAddress) : tronAddress,
            type: 'wallet'
        };

        console.log('✅ TRON address validated:', addressInfo);

        // Проверяем существующих пользователей
        const existingUser = await User.findOne({
            $or: [
                { nickname: nickname },
                { publicKey: publicKey },
                { tronAddress: tronAddress }
            ]
        });

        if (existingUser) {
            let field;
            if (existingUser.nickname === nickname) field = 'nickname';
            else if (existingUser.publicKey === publicKey) field = 'publicKey';
            else field = 'tronAddress';
            
            console.log(`❌ User already exists with ${field}`);
            return res.status(409).json({
                error: `User with this ${field} already exists`,
                code: 'USER_ALREADY_EXISTS',
                field: field
            });
        }

        // Создаем пользователя с UUID
        const userData = {
            _id: id || require('crypto').randomUUID(),
            nickname,
            publicKey,
            tronAddress,
            firstName: firstName || '',
            lastName: lastName || '',
            avatar: avatar || null
        };

        const user = new User(userData);
        await user.save();

        // Генерируем JWT токен
        const token = generateToken(user._id);

        console.log('✅ User registered successfully:', user.nickname);

        // ИСПРАВЛЕНО: Убрана синтаксическая ошибка с *id
        res.status(201).json({
            message: 'User registered successfully',
            token: token,
            tokenType: 'Bearer',
            expiresIn: '7d',
            user: {
                id: user._id,
                _id: user._id,  // Поддерживаем оба поля для совместимости
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                tronAddressInfo: addressInfo,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(409).json({
                error: `User with this ${field} already exists`,
                code: 'DUPLICATE_KEY_ERROR',
                field: field
            });
        }
        
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Логин пользователя
router.post('/login', async (req, res) => {
    try {
        const { nickname, publicKey } = req.body;

        console.log(`🔐 Login request: ${nickname}`);

        if (!nickname || !publicKey) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey',
                code: 'MISSING_FIELDS'
            });
        }

        // Поиск пользователя
        const user = await User.findOne({ nickname });
        if (!user) {
            console.log('❌ User not found');
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Проверяем публичный ключ
        if (user.publicKey !== publicKey) {
            console.log('❌ Invalid public key');
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Обновляем статус онлайн
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // Генерируем новый токен
        const token = generateToken(user._id);

        console.log('✅ User logged in successfully:', user.nickname);

        // ИСПРАВЛЕНО: Убрана синтаксическая ошибка с *id
        res.json({
            message: 'Login successful',
            token: token,
            tokenType: 'Bearer',
            expiresIn: '7d',
            user: {
                id: user._id,
                _id: user._id,  // Поддерживаем оба поля для совместимости
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Проверка доступности nickname
router.post('/check-nickname', async (req, res) => {
    try {
        const { nickname } = req.body;

        if (!nickname) {
            return res.status(400).json({
                error: 'Nickname is required',
                code: 'MISSING_NICKNAME'
            });
        }

        // Валидация длины
        if (nickname.length < 3 || nickname.length > 20) {
            return res.status(400).json({
                error: 'Nickname must be between 3 and 20 characters',
                code: 'INVALID_LENGTH'
            });
        }

        // Валидация формата
        const nicknameRegex = /^[a-zA-Z0-9_]+$/;
        if (!nicknameRegex.test(nickname)) {
            return res.status(400).json({
                error: 'Nickname can only contain letters, numbers, and underscores',
                code: 'INVALID_FORMAT'
            });
        }

        const existingUser = await User.findOne({ nickname });
        const available = !existingUser;

        console.log(`🔍 Nickname check: ${nickname} - ${available ? 'Available' : 'Taken'}`);

        res.json({
            available: available,
            nickname: nickname
        });

    } catch (error) {
        console.error('❌ Nickname check error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Валидация TRON адреса (НОВОЕ)
router.post('/validate-tron-address', async (req, res) => {
    try {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({
                error: 'Address is required',
                code: 'MISSING_ADDRESS'
            });
        }

        console.log(`🔍 Validating TRON address: ${address}`);

        const isValid = TronValidation.validateTronAddress(address);
        
        res.json({
            address: address,
            isValid: isValid,
            isAvailable: true, // Для будущего использования
            formatted: TronValidation.formatAddress ? TronValidation.formatAddress(address) : address,
            type: 'wallet',
            isUSDTContract: TronValidation.isUSDTContract ? TronValidation.isUSDTContract(address) : false,
            validation: {
                hasValidLength: address.length === 34,
                hasValidPrefix: address.startsWith('T'),
                hasValidCharacters: TronValidation.isValidBase58 ? TronValidation.isValidBase58(address) : true,
                hasValidChecksum: isValid
            }
        });

    } catch (error) {
        console.error('❌ TRON address validation error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Валидация криптосуммы (НОВОЕ)
router.post('/validate-crypto-amount', async (req, res) => {
    try {
        const { amount } = req.body;

        if (amount === undefined || amount === null) {
            return res.status(400).json({
                error: 'Amount is required',
                code: 'MISSING_AMOUNT'
            });
        }

        console.log(`💰 Validating crypto amount: ${amount}`);

        const isValid = TronValidation.validateCryptoAmount ? 
            TronValidation.validateCryptoAmount(amount) : 
            (typeof amount === 'number' && amount > 0 && amount <= 1000000);
        
        res.json({
            amount: amount,
            isValid: isValid,
            validation: {
                isNumber: typeof amount === 'number' && isFinite(amount),
                isPositive: amount > 0,
                isInRange: amount >= 0.000001 && amount <= 1000000,
                hasValidDecimals: amount.toString().split('.')[1]?.length <= 6 || true
            },
            limits: {
                min: 0.000001,
                max: 1000000,
                maxDecimals: 6
            }
        });

    } catch (error) {
        console.error('❌ Crypto amount validation error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Получение информации о текущем пользователе (защищено)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log(`👤 Getting user info for: ${req.user.nickname}`);
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // ИСПРАВЛЕНО: Убрана синтаксическая ошибка с *id
        res.json({
            user: {
                id: user._id,
                _id: user._id,  // Поддерживаем оба поля для совместимости
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Get user info error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Обновление токена (НОВОЕ)
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        console.log(`🔄 Refreshing token for user: ${req.user.nickname}`);
        
        // Генерируем новый токен
        const newToken = generateToken(req.user.id);
        
        res.json({
            message: 'Token refreshed successfully',
            token: newToken,
            tokenType: 'Bearer',
            expiresIn: '7d'
        });

    } catch (error) {
        console.error('❌ Token refresh error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Выход (защищено)
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        console.log(`👋 User logging out: ${req.user.nickname}`);
        
        // Обновляем статус пользователя
        await User.findByIdAndUpdate(req.user.id, {
            isOnline: false,
            lastSeen: new Date()
        });

        res.json({
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;