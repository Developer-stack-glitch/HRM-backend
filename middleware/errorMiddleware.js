const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);

    const isProduction = process.env.NODE_ENV === 'production';
    const message = (statusCode === 500 && isProduction)
        ? 'Internal server error. Please try again later.'
        : (err.message || 'An unexpected error occurred');

    const response = { message };
    if (!isProduction && process.env.SHOW_STACK === 'true') {
        response.stack = err.stack;
    }

    res.json(response);
};

module.exports = { notFound, errorHandler };
