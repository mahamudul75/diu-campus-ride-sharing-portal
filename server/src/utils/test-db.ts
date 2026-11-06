import { db, getDbPool } from '../config/db.ts';

async function testConnection() {
  console.log('--- TiDB Cloud Connection Test ---');
  try {
    const start = Date.now();
    const pool = await getDbPool();
    // Verify if it's the real pool or the fallback object
    const isFallback = (pool as any).isFallback === true;
    
    if (isFallback) {
      console.warn('⚠️  Connected to IN-MEMORY FALLBACK engine. TiDB Cloud connection failed.');
      console.log('Please check your .env file credentials.');
    } else {
      const [rows] = await pool.query('SELECT 1 as connected, NOW() as server_time');
      console.log('✅ SUCCESS: Connected to TiDB Cloud!');
      console.log('Server Time:', (rows as any)[0].server_time);
      console.log('Latency:', Date.now() - start, 'ms');
    }
  } catch (err: any) {
    let errorMessage = err.message;
    if (errorMessage.includes('Missing user name prefix')) {
       errorMessage = 'Missing TiDB username prefix. Your DB_USER should look like "xxxxx.root" instead of just "root".';
    }
    console.error('❌ ERROR: Database connection failed.');
    console.error('Message:', errorMessage);
  } finally {
    process.exit(0);
  }
}

testConnection();
