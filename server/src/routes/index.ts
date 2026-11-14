import express from 'express';
import authRoutes from './authRoutes.ts';
import userRoutes from './userRoutes.ts';
import driverRoutes from './driverRoutes.ts';
import rideRoutes from './rideRoutes.ts';
import requestRoutes from './requestRoutes.ts';
import adminRoutes from './adminRoutes.ts';
import reviewRoutes from './reviewRoutes.ts';
import notificationRoutes from './notificationRoutes.ts';
import chatRoutes from './chatRoutes.ts';
import safetyRoutes from './safetyRoutes.ts';
import { db, getDbPool } from '../config/db.ts';
import { apiGeneralLimiter } from '../middleware/rateLimiter.ts';

const apiRouter = express.Router();

// 1. Health check endpoint with DB verification
apiRouter.get('/health', async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  let dbStatus = 'disconnected';
  let dbType = 'unknown';
  let isHealthy = false;

  try {
    const pool = await getDbPool();
    const isFallback = (pool as any).isFallback === true;

    if (isProduction && isFallback) {
      dbStatus = 'unauthorized_fallback';
      dbType = 'in-memory-fallback';
      isHealthy = false;
    } else {
      const [rows] = await db.query('SELECT 1 as connected');
      if (rows && (rows as any)[0]?.connected === 1) {
        dbStatus = isFallback ? 'fallback' : 'connected';
        dbType = isFallback ? 'in-memory-fallback' : 'tidb-cloud';
        isHealthy = !isFallback || (!isProduction && process.env.ALLOW_IN_MEMORY_DB === 'true');
      }
    }
  } catch {
    dbStatus = 'unavailable';
    dbType = 'tidb-cloud';
    isHealthy = false;
  }

  const httpStatus = isHealthy ? 200 : 503;
  res.status(httpStatus).json({
    status: isHealthy ? 'ok' : 'unhealthy',
    service: 'DIU Campus Ride Sharing API',
    database: {
      status: dbStatus,
      type: dbType
    },
    timestamp: new Date().toISOString()
  });
});

// 2. General API rate limiter
apiRouter.use(apiGeneralLimiter);

// 3. Database availability guard
apiRouter.use(async (req, res, next) => {
  try {
    const pool = await getDbPool();
    if (process.env.NODE_ENV === 'production' && (pool as any).isFallback) {
      res.status(503).json({
        success: false,
        message: 'Database service is temporarily unavailable in production. Please try again shortly.'
      });
      return;
    }
    next();
  } catch {
    res.status(503).json({
      success: false,
      message: 'Database service is temporarily unavailable. Please try again shortly.'
    });
  }
});

// 4. Mount database-dependent subrouters
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/drivers', driverRoutes);
apiRouter.use('/rides', rideRoutes);
apiRouter.use('/requests', requestRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/reviews', reviewRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/chat', chatRoutes);
apiRouter.use('/safety', safetyRoutes);

export default apiRouter;
