import { Router } from 'express';
import authRoutes from './authRoutes.ts';
import userRoutes from './userRoutes.ts';
import driverRoutes from './driverRoutes.ts';
import rideRoutes from './rideRoutes.ts';
import requestRoutes from './requestRoutes.ts';
import adminRoutes from './adminRoutes.ts';
import { db, getDbPool } from '../config/db.ts';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/drivers', driverRoutes);
apiRouter.use('/rides', rideRoutes);
apiRouter.use('/requests', requestRoutes);
apiRouter.use('/admin', adminRoutes);

// Health check endpoint with DB verification
apiRouter.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbType = 'unknown';

  try {
    const [rows] = await db.query('SELECT 1 as connected');
    if (rows && (rows as any)[0]?.connected === 1) {
      dbStatus = 'connected';
      // Detect if we are using fallback or real DB
      const pool = await getDbPool();
      dbType = (pool as any).isFallback ? 'in-memory-fallback' : 'tidb-cloud';
    }
  } catch (err) {
    dbStatus = 'error';
    console.error('Health check DB error:', err);
  }

  res.json({
    status: 'ok',
    service: 'DIU Campus Ride Sharing API',
    database: {
      status: dbStatus,
      type: dbType
    },
    timestamp: new Date().toISOString()
  });
});

export default apiRouter;
