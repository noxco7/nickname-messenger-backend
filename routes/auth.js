// =====================================================
// ФАЙЛ: routes/auth.js (UPDATED) - С TRON валидацией
// ПУТЬ: nickname-messenger-backend/routes/auth.js  
// ТИП: Node.js Backend Routes
// ОПИСАНИЕ: Обновленные auth routes с TRON валидацией
// =====================================================

const express = require('express');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');
const TronValidation = require('../utils/tronValidation'); // НОВОЕ
const router = express.Router();

// Регистрация пользователя с TRON валидацией
router.post('/register', async (req, res) => {
    try {
        const { id, nickname, publicKey, tronAddress, firstName, lastName, avatar } = req.body;

        console.log('🚀 Registration request received:');
        console.log('   - ID:', id);
        console.log('   - Nickname:', nickname);
        console.log('   - TRON Address:', tronAddress);

        if (!nickname || !publicKey || !tronAddress) {
            return res.status(400).json({
                error: 'Missing required fields: nickname, publicKey, tronAddress',
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // НОВОЕ: Валидация TRON адреса
        if (!TronValidation.validateTronAddress(tronAddress)) {
            console.log('❌ Invalid TRON address:', tronAddress);
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

        // Получаем информацию об адресе
        const addressInfo = TronValidation.getAddressInfo(tronAddress);
        console.log('✅ TRON address validated:', addressInfo);

        // Проверяем существование пользователя
        const existingUser = await User.findOne({
            $or: [
                { nickname }, 
                { publicKey }, 
                { tronAddress }
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

        res.status(201).json({
            message: 'User registered successfully',
            token: token,
            tokenType: 'Bearer',
            expiresIn: '7d',
            user: {
                id: user._id,
                _id: user._id,
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                tronAddressInfo: addressInfo, // НОВОЕ: информация об адресе
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
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
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // Находим пользователя
        const user = await User.findOne({ nickname });
        if (!user) {
            console.log(`❌ User not found: ${nickname}`);
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Проверяем публичный ключ
        if (user.publicKey !== publicKey) {
            console.log(`❌ Invalid public key for user: ${nickname}`);
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Обновляем статус онлайн
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // Генерируем JWT токен
        const token = generateToken(user._id);

        console.log(`✅ User logged in: ${user.nickname}`);

        res.json({
            message: 'Login successful',
            token: token,
            tokenType: 'Bearer',
            expiresIn: '7d',
            user: {
                id: user._id,
                _id: user._id,
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                isOnline: user.isOnline,
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

// НОВЫЙ: Endpoint для валидации TRON адреса
router.post('/validate-tron-address', async (req, res) => {
    try {
        const { address } = req.body;
        
        console.log('🔍 TRON address validation request:', address);
        
        if (!address) {
            return res.status(400).json({
                error: 'Address is required',
                code: 'MISSING_ADDRESS'
            });
        }
        
        const addressInfo = TronValidation.getAddressInfo(address);
        
        // Проверяем что адрес не занят другим пользователем
        let isAvailable = true;
        if (addressInfo.isValid) {
            const existingUser = await User.findOne({ tronAddress: address });
            isAvailable = !existingUser;
        }
        
        res.json({
            address: address,
            isValid: addressInfo.isValid,
            isAvailable: isAvailable,
            formatted: addressInfo.formatted,
            type: addressInfo.type,
            isUSDTContract: addressInfo.isUSDTContract,
            validation: {
                hasValidLength: address.length === 34,
                hasValidPrefix: address.startsWith('T'),
                hasValidCharacters: TronValidation.isValidBase58(address),
                hasValidChecksum: addressInfo.isValid
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

// НОВЫЙ: Endpoint для валидации криптосуммы
router.post('/validate-crypto-amount', (req, res) => {
    try {
        const { amount } = req.body;
        
        console.log('💰 Crypto amount validation request:', amount);
        
        if (amount === undefined || amount === null) {
            return res.status(400).json({
                error: 'Amount is required',
                code: 'MISSING_AMOUNT'
            });
        }
        
        const isValid = TronValidation.validateCryptoAmount(amount);
        
        res.json({
            amount: amount,
            isValid: isValid,
            validation: {
                isNumber: typeof amount === 'number' && !isNaN(amount),
                isPositive: amount > 0,
                isInRange: amount >= 0.000001 && amount <= 1000000,
                hasValidDecimals: (amount.toString().split('.')[1] || '').length <= 6
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

// Проверка доступности никнейма
router.post('/check-nickname', async (req, res) => {
    try {
        const { nickname } = req.body;

        if (!nickname) {
            return res.status(400).json({
                error: 'Nickname is required',
                code: 'MISSING_NICKNAME'
            });
        }

        // Базовая валидация никнейма
        if (nickname.length < 3 || nickname.length > 20) {
            return res.status(400).json({
                error: 'Nickname must be between 3 and 20 characters',
                code: 'INVALID_NICKNAME_LENGTH'
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(nickname)) {
            return res.status(400).json({
                error: 'Nickname can only contain letters, numbers and underscores',
                code: 'INVALID_NICKNAME_FORMAT'
            });
        }

        const existingUser = await User.findOne({ nickname });
        const available = !existingUser;

        console.log(`🔍 Nickname check: ${nickname} - ${available ? 'Available' : 'Taken'}`);

        res.json({
            nickname: nickname,
            available: available
        });

    } catch (error) {
        console.error('❌ Check nickname error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Получение текущего пользователя (ЗАЩИЩЕНО)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-__v');
        
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Обновляем время последней активности
        user.lastSeen = new Date();
        await user.save();

        console.log(`👤 Current user request: ${user.nickname}`);

        res.json({
            user: {
                id: user._id,
                _id: user._id,
                nickname: user.nickname,
                publicKey: user.publicKey,
                tronAddress: user.tronAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                isOnline: user.isOnline,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
        console.error('❌ Get current user error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Выход (ЗАЩИЩЕНО)
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Обновляем статус пользователя
        await User.findByIdAndUpdate(req.user.id, {
            isOnline: false,
            lastSeen: new Date()
        });

        console.log(`👋 User logged out: ${req.user.nickname}`);

        res.json({
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Обновление токена (ЗАЩИЩЕНО)
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        // Генерируем новый токен
        const newToken = generateToken(req.user.id);

        console.log(`🔄 Token refreshed for user: ${req.user.nickname}`);

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

module.exports = router;