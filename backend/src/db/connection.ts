/**
 * Database Connection Manager
 * 
 * Provides a singleton SQLite connection using Bun's built-in SQLite support.
 * 
 * Architecture Decisions:
 * - Single connection instance (SQLite handles concurrency via file locking)
 * - WAL mode for better concurrent read performance
 * - Automatic directory creation for database file
 * - Graceful shutdown handling
 */

import { Database } from 'bun:sqlite';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { SCHEMA } from './schema';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

let db: Database | null = null;

/**
 * Initialize and return the database connection.
 * Creates the database file and runs migrations if needed.
 */
export async function getDatabase(): Promise<Database> {
    if (db) return db;

    try {
        // Ensure the data directory exists
        const dataDir = dirname(config.db.path);
        await mkdir(dataDir, { recursive: true });

        logger.info('Initializing database connection', { path: config.db.path });

        // Create database connection
        // Using Bun's built-in SQLite for optimal performance
        db = new Database(config.db.path, { create: true });

        // Enable WAL mode for better concurrent read performance
        // WAL (Write-Ahead Logging) allows readers and writers to operate concurrently
        db.exec('PRAGMA journal_mode = WAL');

        // Enable foreign keys (disabled by default in SQLite)
        db.exec('PRAGMA foreign_keys = ON');

        // Optimize for performance
        db.exec('PRAGMA synchronous = NORMAL');
        db.exec('PRAGMA cache_size = 10000');
        db.exec('PRAGMA temp_store = MEMORY');

        // Run schema migrations
        db.exec(SCHEMA);

        logger.info('Database initialized successfully');

        return db;
    } catch (error) {
        logger.error('Failed to initialize database', { error });
        throw error;
    }
}

/**
 * Get the database connection synchronously.
 * Throws if database is not initialized.
 */
export function getDatabaseSync(): Database {
    if (!db) {
        throw new Error('Database not initialized. Call getDatabase() first.');
    }
    return db;
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase(): void {
    if (db) {
        logger.info('Closing database connection');
        db.close();
        db = null;
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});
