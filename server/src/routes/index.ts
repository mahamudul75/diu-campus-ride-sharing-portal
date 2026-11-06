import { Router } from 'express';
import authRoutes from './authRoutes.ts';
import userRoutes from './userRoutes.ts';
import driverRoutes from './driverRoutes.ts';
import rideRoutes from './rideRoutes.ts';
import requestRoutes from './requestRoutes.ts';
import adminRoutes from './adminRoutes.ts';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/drivers', driverRoutes);
apiRouter.use('/rides', rideRoutes);
apiRouter.use('/requests', requestRoutes);
apiRouter.use('/admin', adminRoutes);

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'DIU Campus Ride Sharing API',
    timestamp: new Date().toISOString()
  });
});

export default apiRouter;
