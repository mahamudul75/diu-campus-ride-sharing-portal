import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './server/src/routes/index.ts';
import { getDbPool } from './server/src/config/db.ts';

dotenv.config();

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

// CORS configuration with explicit origin allowlist supporting credentials
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : process.env.APP_URL
  ? [process.env.APP_URL]
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (origin.includes('run.app') || (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1')))) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
);

// Body and cookie parsers with explicit size limits (100kb) and parameter limits to protect against memory exhaustion DOS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 1000 }));
app.use(cookieParser());

// Backend Cross-Origin State-Changing Request Security Middleware (Defense-in-depth against CSRF)
app.use((req: Request, res: Response, next: NextFunction) => {
  const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (unsafeMethods.includes(req.method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    if (origin) {
      const isAllowed =
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin) ||
        origin.includes('run.app') ||
        (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1')));

      if (!isAllowed) {
        res.status(403).json({
          success: false,
          message: 'Access denied: Untrusted cross-origin request rejected by backend security policy.'
        });
        return;
      }
    } else if (referer) {
      try {
        const refUrl = new URL(referer);
        const refOrigin = refUrl.origin;
        const isAllowed =
          allowedOrigins.length === 0 ||
          allowedOrigins.includes(refOrigin) ||
          refOrigin.includes('run.app') ||
          (process.env.NODE_ENV !== 'production' && (refOrigin.includes('localhost') || refOrigin.includes('127.0.0.1')));

        if (!isAllowed) {
          res.status(403).json({
            success: false,
            message: 'Access denied: Untrusted cross-site referer request rejected by backend security policy.'
          });
          return;
        }
      } catch {
        // ignore malformed referer
      }
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
