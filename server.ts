import 'dotenv/config';
import http from 'http';
import express from 'express';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRouter from './server/src/routes/index.ts';
import { getDbPool } from './server/src/config/db.ts';
import { initWebSocketServer } from './server/src/realtime/wsServer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust the first upstream reverse proxy.
app.set('trust proxy', 1);

// Configure security headers.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Normalize and validate an HTTP or HTTPS origin.
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

// Build an explicit trusted-origin allowlist.
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

// Allow local development origins outside production.
if (!isProduction) {
  const developmentOrigins = [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  for (const devOrigin of developmentOrigins) {
    const normalized = normalizeOrigin(devOrigin);

    if (normalized) {
      trustedOrigins.add(normalized);
    }
  }
}

// Check whether an origin belongs to the trusted allowlist.
export function isTrustedOrigin(rawOrigin: unknown): boolean {
  const normalized = normalizeOrigin(rawOrigin);

  return normalized !== null && trustedOrigins.has(normalized);
}

// Configure CORS.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, false);

      if (isTrustedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
);

// Reject untrusted CORS preflight requests.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.method === 'OPTIONS' &&
    req.headers.origin !== undefined &&
    !isTrustedOrigin(req.headers.origin)
  ) {
    res.status(403).json({
      success: false,
      message: 'Access denied: Untrusted CORS preflight origin.'
    });
    return;
  }

  next();
});

// Dedicated JSON parser for avatar uploads.
app.use('/api/users/avatar', express.json({ limit: '1mb' }));

// Global request body limits.
app.use(express.json({ limit: '100kb' }));
app.use(
  express.urlencoded({
    extended: true,
    limit: '100kb',
    parameterLimit: 1000
  })
);

app.use(cookieParser());

// Protect state-changing requests against cross-origin attacks.
app.use((req: Request, res: Response, next: NextFunction) => {
  const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (unsafeMethods.includes(req.method)) {
    const hasOrigin = req.headers.origin !== undefined;
    const hasReferer = req.headers.referer !== undefined;

    if (!hasOrigin && !hasReferer) {
      res.status(403).json({
        success: false,
        message:
          'Access denied: Missing Origin or Referer header on state-changing request.'
      });
      return;
    }

    if (hasOrigin && !isTrustedOrigin(req.headers.origin)) {
      res.status(403).json({
        success: false,
        message:
          'Access denied: Untrusted or malformed origin header rejected by backend security policy.'
      });
      return;
    }

    if (hasReferer && !isTrustedOrigin(req.headers.referer)) {
      res.status(403).json({
        success: false,
        message:
          'Access denied: Untrusted or malformed referer header rejected by backend security policy.'
      });
      return;
    }
  }

  next();
});

// Initialize the database connection.
getDbPool().catch((err) => {
  console.error('Failed to initialize database pool:', err);
});

// Mount REST API routes.
app.use('/api', apiRouter);

// Configure frontend serving.
async function setupFrontend(): Promise<void> {
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
    return;
  }

  const distPath = path.resolve(__dirname, 'dist');

  app.use(express.static(distPath));

  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

// Centralized error handling.
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;

  if (statusCode >= 500) {
    console.error('Server Unhandled Error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 413
        ? 'Request entity too large. Payload exceeds allowed size limit.'
        : statusCode === 400
          ? 'Bad request or malformed JSON payload.'
          : 'Internal server error occurred.'
  });
};

// Create the HTTP server and initialize WebSocket support.
const httpServer = http.createServer(app);

initWebSocketServer(httpServer, isTrustedOrigin);

// Initialize frontend before starting the HTTP server.
setupFrontend()
  .then(() => {
    // Register error handling after API and frontend middleware.
    app.use(errorHandler);

    httpServer.listen(PORT, () => {
      console.log('=======================================================');
      console.log(' DIU CAMPUS RIDE SHARING PORTAL');
      console.log(` Server active on http://0.0.0.0:${PORT}`);
      console.log(` REST API Base: http://0.0.0.0:${PORT}/api`);
      console.log(` WebSocket Endpoint: ws://0.0.0.0:${PORT}/ws`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('=======================================================');
    });
  })
  .catch((err) => {
    console.error('Failed to initialize frontend:', err);
    process.exitCode = 1;
  });

export default app;
