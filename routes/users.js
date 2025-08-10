const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Get user by nickname
router.get('/nickname/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        
        console.log(`👤 Looking for user with nickname: ${nickname}`);
        
        const user = await User.findOne({ nickname }).select('-__v');
        
        if (!user) {
            console.log(`❌ User not found: ${nickname}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ User found: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by nickname error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user by TRON address
router.get('/address/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        console.log(`🏠 Looking for user with address: ${address}`);
        
        const user = await User.findOne({ tronAddress: address }).select('-__v');
        
        if (!user) {
            console.log(`❌ User not found by address: ${address}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ User found by address: ${user.nickname}`);
        res.json(user);
        
    } catch (error) {
        console.error('Get user by address error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ИСПРАВЛЕНО: Search users - теперь использует query parameter
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q; // Получаем query из параметра ?q=
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        console.log(`🔍 Searching users with query: "${query}"`);
        console.log(`📄 Page: ${page}, Limit: ${limit}, Skip: ${skip}`);
        
        if (!query || query.trim().length === 0) {
            console.log('⚠️ Empty search query');
            return res.json({
                users: [],
                total: 0,
                page,
                limit
            });
        }
        
        const trimmedQuery = query.trim();
        
        // Создаем регулярное выражение для поиска (регистронезависимый)
        const searchRegex = new RegExp(trimmedQuery, 'i');
        
        // Поиск по nickname, firstName, lastName
        const searchCriteria = {
            $or: [
                { nickname: searchRegex },
                { firstName: searchRegex },
                { lastName: searchRegex }
            ]
        };
        
        console.log('🔎 Search criteria:', JSON.stringify(searchCriteria, null, 2));
        
        // Выполняем поиск
        const users = await User.find(searchCriteria)
            .select('_id nickname firstName lastName avatar isOnline createdAt')
            .sort({ createdAt: -1 }) // Сортируем по дате создания
            .limit(limit)
            .skip(skip);
        
        // Подсчитываем общее количество
        const total = await User.countDocuments(searchCriteria);
        
        console.log(`✅ Found ${users.length} users (total: ${total})`);
        
        // Логируем найденных пользователей
        users.forEach(user => {
            console.log(`   - ${user.nickname} (${user.firstName || 'No first name'} ${user.lastName || 'No last name'})`);
        });
        
        // Возвращаем в формате, ожидаемом клиентом
        res.json({
            users: users.map(user => ({
                id: user._id,
                nickname: user.nickname,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                avatar: user.avatar || '',
                isOnline: user.isOnline || false,
                createdAt: user.createdAt,
                // Добавляем displayName для совместимости с клиентом
                displayName: user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.nickname
            })),
            total,
            page,
            limit
        });
        
    } catch (error) {
        console.error('❌ Search users error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            users: [],
            total: 0,
            page: 1,
            limit: 20 
        });
    }
});

// DEPRECATED: Старый роут для поиска (оставляем для совместимости)
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        
        console.log(`🔍 [DEPRECATED] Searching users with query: "${query}"`);
        
        const users = await User.find({
            nickname: { $regex: query, $options: 'i' }
        })
        .select('nickname firstName lastName avatar isOnline')
        .limit(limit);
        
        console.log(`✅ [DEPRECATED] Found ${users.length} users`);
        res.json(users);
        
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users (для отладки - можно удалить в продакшене)
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;
        
        console.log(`👥 Getting all users (limit: ${limit}, skip: ${skip})`);
        
        const users = await User.find({})
            .select('nickname firstName lastName avatar isOnline createdAt')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
        
        const total = await User.countDocuments({});
        
        console.log(`✅ Found ${users.length} users (total: ${total})`);
        
        res.json({
            users,
            total,
            limit,
            skip
        });
        
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;