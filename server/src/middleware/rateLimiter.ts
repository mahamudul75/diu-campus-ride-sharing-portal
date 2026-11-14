import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * 1. Account-level Failed Login Limiter:
 * Allows a maximum of 5 failed login attempts per normalized email + client IP within 15 minutes.
 * Successful logins (status < 400) do NOT consume failed-attempt quota (skipSuccessfulRequests: true).
 * Uses ipKeyGenerator to ensure proper IPv4 and IPv6 subnet grouping.
 * Does not expose account existence.
 */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per (normalized email + client IP)
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const normalizedEmail = rawEmail.trim().toLowerCase().slice(0, 100);
    const clientIp = ipKeyGenerator(req.ip || '127.0.0.1');
    return `login_fail:${normalizedEmail}:${clientIp}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many failed login attempts for this account. Please try again after 15 minutes.'
    });
  }
});

/**
 * 2. IP-level Login Burst Protection:
 * Allows up to 50 login attempts per IP per 15 minutes.
 * Uses express-rate-limit default IP generator with built-in IPv6 subnet handling.
 * Protects against automated multi-account password spraying while accommodating
 * multiple legitimate DIU students behind shared campus NAT / Wi-Fi.
 */
export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts from this network. Please try again after 15 minutes.'
    });
  }
});

/**
 * 3. Registration Rate Limiter:
 * Limits repeated registration attempts to 10 per hour per IP.
 * Uses default secure IP key generator.
 * Prevents automated account creation spam while permitting legitimate students.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many registration attempts from this network. Please try again after 1 hour.'
    });
  }
});

/**
 * 4. Sensitive Write Endpoints Limiter:
 * Protects state-changing write operations (posting rides, booking seats, driver applications).
 * Allows up to 60 write actions per 15 minutes per IP.
 */
export const sensitiveWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many write requests from this network. Please slow down and try again shortly.'
    });
  }
});

/**
 * 5. General API Limiter:
 * Protects the entire /api surface with a high limit (600 requests per 15 minutes)
 * to avoid unfairly impacting normal browsing, search queries, or map operations.
 */
export const apiGeneralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'API rate limit exceeded. Please slow down and try again shortly.'
    });
  }
});
