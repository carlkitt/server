const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Verifies JWT token and extracts user ID
 * Token can be in Authorization header or request body/query
 */
module.exports = (req, res, next) => {
  try {
    // Extract token from Authorization header (preferred) or body/query
    const token = 
      req.header('Authorization')?.replace('Bearer ', '') || 
      req.body.token || 
      req.query.token;

    if (!token) {
      return res.status(401).json({ 
        message: 'No token provided',
        code: 'NO_TOKEN' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
    // Attach user ID to request for downstream handlers
    req.userId = decoded.userId;
    req.user = decoded;
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    res.status(401).json({ 
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};
