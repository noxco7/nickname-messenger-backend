// =====================================================
// ФАЙЛ: services/pushNotificationService.js (BACKEND) - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ПУТЬ: nickname-messenger-backend/services/pushNotificationService.js
// ОПИСАНИЕ: Сервис для инициализации Firebase и отправки уведомлений
// =====================================================

const admin = require('firebase-admin');
const path = require('path');
const User = require('../models/User'); // <--- Добавил импорт модели User

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
    
    // Удаляем дубликаты и пустые токены
    const uniqueTokens = [...new Set(deviceTokens)].filter(token => token);

    if (uniqueTokens.length === 0) {
        console.log('🤔 Нет валидных токенов для отправки push-уведомления.');
        return;
    }

    const message = {
        notification: {
            title: title,
            body: body,
        },
        data: dataPayload, // Дополнительные данные (например, ID чата)
        apns: {
            payload: {
                aps: {
                    sound: 'default', // Звук уведомления
                    'content-available': 1,
                     badge: 1, // Иконка с цифрой на приложении
                }
            }
        },
        tokens: uniqueTokens,
    };

    try {
        console.log(`🚀 Отправка push-уведомления на ${uniqueTokens.length} устройств...`);
        
        const response = await admin.messaging().sendEachForMulticast(message);
        
        if (response.successCount > 0) {
            console.log(`✅ Успешно отправлено ${response.successCount} push-уведомлений.`);
        }
        if (response.failureCount > 0) {
            console.log(`❌ Не удалось отправить ${response.failureCount} push-уведомлений.`);
            
            const failedTokens = response.responses
                .filter(res => !res.success && res.error && res.error.code === 'messaging/invalid-argument')
                .map(res => res.token);
            
            if (failedTokens.length > 0) {
                console.log(`🗑️ Удаление недействительных токенов: ${failedTokens.join(', ')}`);
                await User.updateMany(
                    { deviceTokens: { $in: failedTokens } },
                    { $pullAll: { deviceTokens: failedTokens } }
                );
                console.log('✅ Недействительные токены удалены из базы данных.');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при отправке push-уведомления:', error);
    }
};

module.exports = {
    sendPushNotification
};