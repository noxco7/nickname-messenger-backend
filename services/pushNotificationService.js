// =====================================================
// ФАЙЛ: services/pushNotificationService.js (BACKEND) - ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/services/pushNotificationService.js
// ОПИСАНИЕ: Улучшенная обработка push-уведомлений с детальной отладкой
// =====================================================

const admin = require('firebase-admin');
const path = require('path');
const User = require('../models/User');

// Путь к вашему секретному ключу
const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account-key.json');

// Инициализация Firebase Admin SDK
try {
    // Проверяем, не инициализирован ли уже
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        console.log('🔥 Firebase Admin SDK инициализирован успешно.');
    } else {
        console.log('ℹ️ Firebase Admin SDK уже инициализирован.');
    }
} catch (error) {
    console.error('❌ Ошибка инициализации Firebase Admin SDK:', error.message);
    console.error('❗ Убедитесь, что файл "firebase-service-account-key.json" находится в корневой папке проекта.');
    console.error('❗ Проверьте настройки APNs в Firebase Console.');
}

/**
 * Отправка push-уведомления на устройства
 * @param {Array<string>} deviceTokens - Массив FCM токенов
 * @param {string} title - Заголовок уведомления
 * @param {string} body - Текст уведомления
 * @param {Object} dataPayload - Дополнительные данные
 */
const sendPushNotification = async (deviceTokens, title, body, dataPayload = {}) => {
    if (!Array.isArray(deviceTokens) || deviceTokens.length === 0) {
        console.log('🤔 Нет токенов для отправки push-уведомления.');
        return { success: false, successCount: 0, failureCount: 0 };
    }
    
    // Фильтруем и валидируем токены
    const uniqueTokens = [...new Set(deviceTokens)]
        .filter(token => token && typeof token === 'string' && token.trim().length > 0);

    if (uniqueTokens.length === 0) {
        console.log('🤔 Нет валидных токенов для отправки push-уведомления.');
        return { success: false, successCount: 0, failureCount: 0 };
    }

    console.log(`🚀 Отправка push-уведомления на ${uniqueTokens.length} устройств...`);
    console.log('📱 Токены для отправки:');
    uniqueTokens.forEach((token, idx) => {
        console.log(`   ${idx + 1}. ${token.substring(0, 30)}...${token.substring(token.length - 10)}`);
    });

    // Формируем сообщение
    const message = {
        notification: {
            title: title,
            body: body,
        },
        data: {
            ...dataPayload,
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            // Добавляем timestamp для отладки
            timestamp: new Date().toISOString()
        },
        // Настройки для iOS (APNs)
        apns: {
            payload: {
                aps: {
                    alert: {
                        title: title,
                        body: body
                    },
                    sound: 'default',
                    badge: 1,
                    'mutable-content': 1,
                    'content-available': 1
                }
            },
            headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert',
                'apns-topic': 'com.noxco.Nickname-Messenger' // Замените на ваш Bundle ID
            }
        },
        // Настройки для Android
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                priority: 'high',
                channelId: 'default',
                clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            },
            data: dataPayload
        },
        // Токены получателей
        tokens: uniqueTokens,
    };

    try {
        // Отправляем уведомления
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
                console.log(`      Message ID: ${resp.messageId}`);
            } else if (resp.error) {
                console.log(`   ❌ Токен ${idx + 1}: ${resp.error.code}`);
                console.log(`      Сообщение: ${resp.error.message}`);
                
                // Специальная обработка ошибок аутентификации
                if (resp.error.code === 'messaging/third-party-auth-error') {
                    console.log('   ⚠️ ПРОБЛЕМА С APNs АУТЕНТИФИКАЦИЕЙ:');
                    console.log('      1. Проверьте APNs ключ/сертификат в Firebase Console');
                    console.log('      2. Убедитесь что Bundle ID совпадает с настройками Firebase');
                    console.log('      3. Проверьте что APNs ключ активен и не истек');
                    console.log('      4. Для Production используйте Production APNs сертификат');
                    console.log('      5. Убедитесь что в Xcode включены Push Notifications');
                }
                
                // Определяем невалидные токены для удаления
                const invalidCodes = [
                    'messaging/invalid-registration-token',
                    'messaging/registration-token-not-registered',
                    'messaging/invalid-argument',
                    'messaging/invalid-recipient',
                    'messaging/invalid-apns-credentials'
                ];
                
                if (invalidCodes.includes(resp.error.code)) {
                    invalidTokens.push(token);
                    console.log(`      🗑️ Токен будет удален из базы данных`);
                }
                
                // Временные ошибки (можно повторить позже)
                const temporaryErrorCodes = [
                    'messaging/server-unavailable',
                    'messaging/internal-error',
                    'messaging/too-many-messages'
                ];
                
                if (temporaryErrorCodes.includes(resp.error.code)) {
                    console.log(`      ⏳ Временная ошибка, можно повторить позже`);
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
        
        // Возвращаем результат
        return {
            success: response.successCount > 0,
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses.map((resp, idx) => ({
                token: uniqueTokens[idx].substring(0, 20) + '...',
                success: resp.success,
                error: resp.error ? resp.error.code : null
            }))
        };
        
    } catch (error) {
        console.error('❌ Критическая ошибка при отправке push-уведомления:', error);
        
        // Проверяем специфичные ошибки
        if (error.code === 'app/invalid-credential') {
            console.error('❌ ПРОБЛЕМА С FIREBASE CREDENTIALS:');
            console.error('   - Проверьте firebase-service-account-key.json');
            console.error('   - Убедитесь что файл актуальный и от правильного проекта');
        }
        
        if (error.code === 'messaging/authentication-error') {
            console.error('❌ ПРОБЛЕМА С АУТЕНТИФИКАЦИЕЙ:');
            console.error('   - Проверьте настройки проекта в Firebase Console');
            console.error('   - Убедитесь что Cloud Messaging API включен');
        }
        
        return {
            success: false,
            successCount: 0,
            failureCount: uniqueTokens.length,
            error: error.message
        };
    }
};

/**
 * Отправка тестового уведомления
 * @param {string} deviceToken - FCM токен устройства
 */
const sendTestNotification = async (deviceToken) => {
    if (!deviceToken || typeof deviceToken !== 'string') {
        console.log('❌ Невалидный токен для тестового уведомления');
        return false;
    }
    
    console.log('📱 Отправка тестового уведомления...');
    console.log(`   Токен: ${deviceToken.substring(0, 30)}...`);
    
    const message = {
        notification: {
            title: '🎉 Test Notification',
            body: 'This is a test push notification from Nickname Messenger'
        },
        data: {
            type: 'test',
            timestamp: new Date().toISOString()
        },
        apns: {
            payload: {
                aps: {
                    alert: {
                        title: '🎉 Test Notification',
                        body: 'This is a test push notification from Nickname Messenger'
                    },
                    sound: 'default',
                    badge: 1
                }
            },
            headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert'
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
        token: deviceToken
    };
    
    try {
        const response = await admin.messaging().send(message);
        console.log('✅ Тестовое уведомление успешно отправлено:', response);
        return true;
    } catch (error) {
        console.error('❌ Ошибка отправки тестового уведомления:', error.code, error.message);
        
        if (error.code === 'messaging/third-party-auth-error') {
            console.error('⚠️ Проблема с APNs. Проверьте настройки в Firebase Console');
        }
        
        return false;
    }
};

/**
 * Валидация FCM токена
 * @param {string} deviceToken - FCM токен для проверки
 */
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
        console.log(`✅ Токен валидный: ${deviceToken.substring(0, 30)}...`);
        return true;
    } catch (error) {
        console.log(`❌ Токен невалидный: ${error.code}`);
        return false;
    }
};

/**
 * Массовая проверка и очистка токенов
 */
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
        
        return {
            totalUsers: users.length,
            totalTokens: totalTokens,
            invalidTokens: invalidTokens,
            validTokens: totalTokens - invalidTokens
        };
        
    } catch (error) {
        console.error('❌ Ошибка при очистке токенов:', error);
        throw error;
    }
};

// Экспорт функций
module.exports = {
    sendPushNotification,
    sendTestNotification,
    validateDeviceToken,
    cleanupInvalidTokens
};