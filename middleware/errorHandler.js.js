// middleware/errorHandler.js

class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
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
    
    // Обработка специфичных ошибок
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation Error';
        code = 'VALIDATION_ERROR';
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
    }
    
    res.status(statusCode).json({
        error: message,
        code: code || 'ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    AppError,
    errorHandler,
    asyncHandler
};