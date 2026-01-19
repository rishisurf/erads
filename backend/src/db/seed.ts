/**
 * Database Seed Script
 * 
 * Run with: bun run db:seed
 * 
 * Creates sample data for development and testing.
 */

import { getDatabase, closeDatabase } from './connection';
import { logger } from '../utils/logger';
import { nanoid } from 'nanoid';

async function seed() {
    logger.info('Starting database seeding...');

    try {
        const db = await getDatabase();

        // Create a sample API key for testing
        const testKeyId = nanoid();
        const testKey = `rl_test_${nanoid(32)}`;
        const keyHash = new Bun.CryptoHasher('sha256')
            .update(testKey)
            .digest('hex');

        db.run(`
      INSERT OR IGNORE INTO api_keys (id, key_hash, name, rate_limit, window_seconds, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
            testKeyId,
            keyHash,
            'Test API Key',
            100,
            60,
            JSON.stringify({ environment: 'development' }),
        ]);

        logger.info('Created test API key', {
            id: testKeyId,
            key: testKey,  // Only shown in seed output!
            note: 'Save this key - it will not be shown again',
        });

        // Create some sample request logs
        const now = new Date();
        for (let i = 0; i < 10; i++) {
            const timestamp = new Date(now.getTime() - i * 60000); // 1 minute apart
            db.run(`
        INSERT INTO request_logs (id, identifier, identifier_type, path, method, allowed, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                nanoid(),
                '127.0.0.1',
                'ip',
                '/api/v1/data',
                'GET',
                1,
                'ok',
                timestamp.toISOString(),
            ]);
        }

        logger.info('Created sample request logs', { count: 10 });

        closeDatabase();
        logger.info('Seeding complete');
        process.exit(0);
    } catch (error) {
        logger.error('Seeding failed', { error });
        closeDatabase();
        process.exit(1);
    }
}

seed();
