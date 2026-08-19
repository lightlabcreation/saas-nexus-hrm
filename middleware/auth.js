const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    let token;
    if (req.headers.authorization) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ message: 'No token provided or malformed authorization header' });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('❌ CRITICAL: JWT_SECRET environment variable is not set!');
            return res.status(500).json({ message: 'Server configuration error' });
        }
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired. Please login again.', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ message: 'Invalid token' });
    }
};
