import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './server/src/routes/index.ts';
import { getDbPool } from './server/src/config/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Configure reverse proxy trust: trust 1st upstream reverse proxy (Google Cloud Run / GFE / NGINX)
// This ensures req.ip represents the genuine client IP rather than an attacker-manipulated X-Forwarded-For header
app.set('trust proxy', 1);

// Security headers with Helmet (configured for OpenStreetMap tiles and iframe preview)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

function normalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

// Build strict, explicit trusted origin allowlist (never fail open)
const trustedOrigins = new Set<string>();

if (process.env.CORS_ORIGINS) {
  for (const entry of process.env.CORS_ORIGINS.split(',')) {
    const normalized = normalizeOrigin(entry);
    if (normalized) {
      trustedOrigins.add(normalized);
    } else if (entry.trim()) {
      console.warn(`Ignoring invalid CORS_ORIGINS entry: "${entry.trim()}"`);
    }
  }
}

if (process.env.APP_URL) {
  const normalizedAppUrl = normalizeOrigin(process.env.APP_URL);
  if (normalizedAppUrl) {
    trustedOrigins.add(normalizedAppUrl);
  } else {
    console.warn(`Ignoring invalid APP_URL value: "${process.env.APP_URL}"`);
  }
}

if (!isProduction) {
  for (const devOrigin of [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]) {
    const normalized = normalizeOrigin(devOrigin);
    if (normalized) trustedOrigins.add(normalized);
  }
}

function isTrustedOrigin(rawOrigin: unknown): boolean {
  const normalized = normalizeOrigin(rawOrigin);
  return normalized !== null && trustedOrigins.has(normalized);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Missing Origin (same-origin GETs, non-browser/healthcheck calls): emit no CORS headers
      if (!origin) return callback(null, false);
      // Only exact explicitly configured trusted origins receive CORS headers
      if (isTrustedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
);

// Explicitly reject untrusted or malformed CORS preflight requests
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS' && req.headers.origin !== undefined && !isTrustedOrigin(req.headers.origin)) {
    res.status(403).json({
      success: false,
      message: 'Access denied: Untrusted CORS preflight origin.'
    });
    return;
  }
  next();
});

// Body and cookie parsers with explicit size limits (100kb) and parameter limits to protect against memory exhaustion DOS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 1000 }));
app.use(cookieParser());

// Backend Cross-Origin State-Changing Request Security Middleware (Defense-in-depth against CSRF)
app.use((req: Request, res: Response, next: NextFunction) => {
  const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (unsafeMethods.includes(req.method)) {
    const hasOrigin = req.headers.origin !== undefined;
    const hasReferer = req.headers.referer !== undefined;

    if (!hasOrigin && !hasReferer) {
      res.status(403).json({
        success: false,
        message: 'Access denied: Missing Origin or Referer header on state-changing request.'
      });
      return;
    }

    if (hasOrigin && !isTrustedOrigin(req.headers.origin)) {
      res.status(403).json({
        success: false,
        message: 'Access denied: Untrusted or malformed origin header rejected by backend security policy.'
      });
      return;
    }

    if (hasReferer && !isTrustedOrigin(req.headers.referer)) {
      res.status(403).json({
        success: false,
        message: 'Access denied: Untrusted or malformed referer header rejected by backend security policy.'
      });
      return;
    }
  }
  next();
});

// Initialize Database connection / in-memory store
getDbPool().catch((err) => {
  console.error('Failed to initialize database pool:', err);
});

// Mount Backend REST API under /api
app.use('/api', apiRouter);

// Serve frontend: Vite middleware in development, static build in production
async function setupFrontend() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }
}

// Global error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || err.statusCode || 500;
  // Do not log full stack trace for expected client payload errors (413 Payload Too Large, 400 Bad Request / SyntaxError)
  if (statusCode >= 500) {
    console.error('Server Unhandled Error:', err);
  }
  
  res.status(statusCode).json({
    success: false,
    message: statusCode === 413 
      ? 'Request entity too large. Payload exceeds 100kb limit.' 
      : statusCode === 400 
      ? 'Bad request or malformed JSON payload.' 
      : 'Internal server error occurred.'
  });
});

setupFrontend().then(() => {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` DIU CAMPUS RIDE SHARING PORTAL`);
    console.log(` Server active on http://0.0.0.0:${PORT}`);
    console.log(` REST API Base: http://0.0.0.0:${PORT}/api`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
  });
});

export default app;
