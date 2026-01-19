/**
 * Database Migration Script
 * 
 * Run with: bun run db:migrate
 * 
 * This script initializes the database and runs all schema migrations.
 * In a production system, you would use a proper migration tool with versioning.
 */

import { getDatabase, closeDatabase } from './connection';
import { logger } from '../utils/logger';

async function migrate() {
    logger.info('Starting database migration...');

    try {
        const db = await getDatabase();

        // The schema is automatically applied in getDatabase()
        // Here we can add any additional migration logic

        // Verify tables exist
        const tables = db.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `).all() as { name: string }[];

        logger.info('Migration complete. Tables created:', {
            tables: tables.map(t => t.name),
        });

        closeDatabase();
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed', { error });
        closeDatabase();
        process.exit(1);
    }
}

migrate();
