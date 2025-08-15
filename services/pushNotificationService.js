// =====================================================
// ФАЙЛ: services/pushNotificationService.js (BACKEND) - ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/services/pushNotificationService.js
// ОПИСАНИЕ: Исправлена отправка push-уведомлений и обработка токенов
// =====================================================

const admin = require('firebase-admin');
const path = require('path');
const User = require('../models/User');

// Путь к вашему секретному ключу
const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account-key.json');

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
    });
    console.log('🔥 Firebase Admin SDK инициализирован успешно.');
} catch (error) {
    // Проверяем, не была ли уже инициализирована (полезно для hot-reload)
    if (error.code !== 'app/duplicate-app') {
        console.error('❌ Ошибка инициализации Firebase Admin SDK:', error.message);
        console.error('❗ Убедитесь, что файл "firebase-service-account-key.json" находится в корневой папке проекта.');
    }
}

const sendPushNotification = async (deviceTokens, title, body, dataPayload = {}) => {
    if (!Array.isArray(deviceTokens) || deviceTokens.length === 0) {
        console.log('🤔 Нет токенов для отправки push-уведомления.');
        return;
    }
    
    // ИСПРАВЛЕНИЕ: Фильтруем пустые и null токены более тщательно
    const uniqueTokens = [...new Set(deviceTokens)]
        .filter(token => token && typeof token === 'string' && token.trim().length > 0);

    if (uniqueTokens.length === 0) {
        console.log('🤔 Нет валидных токенов для отправки push-уведомления.');
        return;
    }

    console.log(`🚀 Отправка push-уведомления на ${uniqueTokens.length} устройств...`);
    console.log('📱 Токены для отправки:');
    uniqueTokens.forEach((token, idx) => {
        console.log(`   ${idx + 1}. ${token.substring(0, 30)}...`);
    });

    const message = {
        notification: {
            title: title,
            body: body,
        },
        data: {
            ...dataPayload,
            click_action: "FLUTTER_NOTIFICATION_CLICK" // Для iOS
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: 1,
                    'mutable-content': 1,
                    'content-available': 1
                }
            },
            headers: {
                'apns-priority': '10'
            }
        },
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                priority: 'high',
                channelId: 'default'
            }
        },
        tokens: uniqueTokens,
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        
        console.log(`📊 Результаты отправки push-уведомлений:`);
        console.log(`   ✅ Успешно отправлено: ${response.successCount}`);
        console.log(`   ❌ Не удалось отправить: ${response.failureCount}`);
        
        // Массив для хранения невалидных токенов
        const invalidTokens = [];
        
        // Детальная обработка каждого ответа
        response.responses.forEach((resp, idx) => {
            const token = uniqueTokens[idx];
            
            if (resp.success) {
                console.log(`   ✅ Токен ${idx + 1}: Успешно отправлено`);
            } else if (resp.error) {
                console.log(`   ❌ Токен ${idx + 1}: ${resp.error.code}`);
                console.log(`      Сообщение: ${resp.error.message}`);
                
                // Определяем невалидные токены для удаления
                const invalidCodes = [
                    'messaging/invalid-registration-token',
                    'messaging/registration-token-not-registered',
                    'messaging/invalid-argument',
                    'messaging/invalid-recipient'
                ];
                
                if (invalidCodes.includes(resp.error.code)) {
                    invalidTokens.push(token);
                    console.log(`      🗑️ Токен будет удален: ${token.substring(0, 30)}...`);
                }
            }
        });
        
        // Удаляем невалидные токены из базы данных
        if (invalidTokens.length > 0) {
            console.log(`🗑️ Удаление ${invalidTokens.length} невалидных токенов из базы данных...`);
            
            try {
                const result = await User.updateMany(
                    { deviceTokens: { $in: invalidTokens } },
                    { $pull: { deviceTokens: { $in: invalidTokens } } }
                );
                
                console.log(`✅ Удалено токенов из ${result.modifiedCount} пользователей`);
            } catch (dbError) {
                console.error('❌ Ошибка при удалении токенов из базы данных:', dbError);
            }
        }
        
        // Возвращаем результат для логирования
        return {
            success: response.successCount > 0,
            successCount: response.successCount,
            failureCount: response.failureCount
        };
        
    } catch (error) {
        console.error('❌ Критическая ошибка при отправке push-уведомления:', error);
        
        // Проверяем, если это ошибка аутентификации Firebase
        if (error.code === 'app/invalid-credential') {
            console.error('❌ Проблема с Firebase credentials. Проверьте firebase-service-account-key.json');
        }
        
        return {
            success: false,
            successCount: 0,
            failureCount: uniqueTokens.length,
            error: error.message
        };
    }
};

// Функция для отправки тестового уведомления
const sendTestNotification = async (deviceToken) => {
    if (!deviceToken || typeof deviceToken !== 'string') {
        console.log('❌ Невалидный токен для тестового уведомления');
        return false;
    }
    
    console.log('📱 Отправка тестового уведомления...');
    
    const message = {
        notification: {
            title: '🎉 Test Notification',
            body: 'This is a test push notification from Nickname Messenger'
        },
        data: {
            type: 'test',
            timestamp: new Date().toISOString()
        },
        token: deviceToken
    };
    
    try {
        const response = await admin.messaging().send(message);
        console.log('✅ Тестовое уведомление успешно отправлено:', response);
        return true;
    } catch (error) {
        console.error('❌ Ошибка отправки тестового уведомления:', error);
        return false;
    }
};

// Функция для валидации токена
const validateDeviceToken = async (deviceToken) => {
    if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.trim().length === 0) {
        return false;
    }
    
    try {
        // Пробуем отправить "сухое" уведомление (dry run)
        const message = {
            token: deviceToken,
            data: {
                test: 'validation'
            }
        };
        
        await admin.messaging().send(message, true); // true = dry run
        return true;
    } catch (error) {
        console.log(`❌ Токен невалидный: ${error.code}`);
        return false;
    }
};

// Функция для массовой проверки и очистки токенов
const cleanupInvalidTokens = async () => {
    console.log('🧹 Начинаем очистку невалидных токенов...');
    
    try {
        const users = await User.find({ 
            deviceTokens: { $exists: true, $ne: [] } 
        });
        
        console.log(`📊 Найдено ${users.length} пользователей с токенами`);
        
        let totalTokens = 0;
        let invalidTokens = 0;
        
        for (const user of users) {
            const validTokens = [];
            
            for (const token of user.deviceTokens) {
                totalTokens++;
                
                if (await validateDeviceToken(token)) {
                    validTokens.push(token);
                } else {
                    invalidTokens++;
                    console.log(`   ❌ Невалидный токен у ${user.nickname}`);
                }
            }
            
            // Обновляем токены пользователя если есть изменения
            if (validTokens.length !== user.deviceTokens.length) {
                user.deviceTokens = validTokens;
                await user.save();
                console.log(`   ✅ Обновлены токены для ${user.nickname}: ${validTokens.length} валидных`);
            }
        }
        
        console.log(`✅ Очистка завершена: ${invalidTokens} из ${totalTokens} токенов удалено`);
        
    } catch (error) {
        console.error('❌ Ошибка при очистке токенов:', error);
    }
};

module.exports = {
    sendPushNotification,
    sendTestNotification,
    validateDeviceToken,
    cleanupInvalidTokens
};