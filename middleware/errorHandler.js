// =====================================================
// ФАЙЛ: middleware/errorHandler.js (BACKEND)
// ПУТЬ: nickname-messenger-backend/middleware/errorHandler.js
// ТИП: Node.js Middleware
// ОПИСАНИЕ: Централизованная обработка ошибок
// =====================================================

class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

const errorHandler = (err, req, res, next) => {
    let { statusCode = 500, message, code } = err;
    
    // Логирование
    console.error('❌ Error:', {
        message,
        code,
        statusCode,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    // Обработка специфичных ошибок MongoDB
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation Error';
        code = 'VALIDATION_ERROR';
        
        // Извлекаем детали валидации
        const errors = Object.values(err.errors).map(e => e.message);
        message = `Validation failed: ${errors.join(', ')}`;
    }
    
    if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid ID format';
        code = 'INVALID_ID';
    }
    
    if (err.code === 11000) {
        statusCode = 409;
        message = 'Duplicate entry';
        code = 'DUPLICATE_ENTRY';
        
        // Извлекаем поле с дубликатом
        const field = Object.keys(err.keyValue)[0];
        message = `${field} already exists`;
    }
    
    // JWT ошибки
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        code = 'INVALID_TOKEN';
        message = 'Invalid token';
    }
    
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        code = 'TOKEN_EXPIRED';
        message = 'Token expired';
    }
    
    // Отправляем ответ
    res.status(statusCode).json({
        status: 'error',
        error: message,
        code: code || 'ERROR',
        requestId: req.requestId,
        ...(process.env.NODE_ENV === 'development' && { 
            stack: err.stack,
            details: err 
        })
    });
};

// Обертка для async функций
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware для 404 ошибок
const notFound = (req, res, next) => {
    const err = new AppError(`Not found - ${req.originalUrl}`, 404, 'NOT_FOUND');
    next(err);
};

module.exports = {
    AppError,
    errorHandler,
    asyncHandler,
    notFound
};