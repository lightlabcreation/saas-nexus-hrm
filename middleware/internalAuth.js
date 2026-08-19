const internalAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ message: 'Unauthorized: API key is missing' });
    }

    if (apiKey !== process.env.INTERNAL_API_KEY) {
        return res.status(401).json({ message: 'Unauthorized: Invalid API key' });
    }

    next();
};

module.exports = internalAuth;
