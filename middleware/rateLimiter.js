/**
 * Zero-dependency In-Memory Rate Limiter Middleware
 * Protects authentication & sensitive endpoints from brute-force attacks.
 */

const rateLimitStore = new Map();

// Periodic cleanup of expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 15, message = 'Too many requests. Please try again later.' }) => {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown_ip';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, record);
      return next();
    }

    record.count++;

    if (record.count > max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: retryAfterSec
      });
    }

    next();
  };
};

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 login attempts per IP
  message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
});

const signupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 signup attempts per IP
  message: 'Too many account creation attempts from this IP. Please try again after 15 minutes.'
});

const passRetrievalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 retrieval requests per IP
  message: 'Too many pass retrieval attempts from this IP. Please wait a few minutes before trying again.'
});

module.exports = {
  loginLimiter,
  signupLimiter,
  passRetrievalLimiter,
  createRateLimiter
};
