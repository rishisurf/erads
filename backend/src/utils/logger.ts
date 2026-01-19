/**
 * Structured Logger
 * 
 * Provides consistent, structured logging throughout the application.
 * 
 * Architecture Decision:
 * - JSON format for production (easy to parse by log aggregators)
 * - Pretty format for development (human readable)
 * - Includes timestamp, level, and context for every log
 * - Log levels: debug, info, warn, error
 */

import { config } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
}

// Log level priority (lower = more verbose)
const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private minLevel: number;
    private isProduction: boolean;

    constructor() {
        this.minLevel = LOG_LEVELS[config.logging.level as LogLevel] ?? LOG_LEVELS.info;
        this.isProduction = config.server.isProduction;
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= this.minLevel;
    }

    private formatEntry(entry: LogEntry): string {
        if (this.isProduction) {
            // JSON format for production (structured logging)
            return JSON.stringify(entry);
        }

        // Pretty format for development
        const levelColors: Record<LogLevel, string> = {
            debug: '\x1b[36m', // cyan
            info: '\x1b[32m',  // green
            warn: '\x1b[33m',  // yellow
            error: '\x1b[31m', // red
        };
        const reset = '\x1b[0m';
        const color = levelColors[entry.level];

        let output = `${entry.timestamp} ${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}`;

        if (entry.context && Object.keys(entry.context).length > 0) {
            output += ` ${JSON.stringify(entry.context)}`;
        }

        return output;
    }

    private log(level: LogLevel, message: string, context?: LogContext): void {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(context && { context }),
        };

        const formatted = this.formatEntry(entry);

        switch (level) {
            case 'error':
                console.error(formatted);
                break;
            case 'warn':
                console.warn(formatted);
                break;
            default:
                console.log(formatted);
        }
    }

    debug(message: string, context?: LogContext): void {
        this.log('debug', message, context);
    }

    info(message: string, context?: LogContext): void {
        this.log('info', message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.log('warn', message, context);
    }

    error(message: string, context?: LogContext): void {
        this.log('error', message, context);
    }

    // Create a child logger with preset context
    child(baseContext: LogContext): ChildLogger {
        return new ChildLogger(this, baseContext);
    }
}

class ChildLogger {
    constructor(
        private parent: Logger,
        private baseContext: LogContext
    ) { }

    private mergeContext(context?: LogContext): LogContext {
        return { ...this.baseContext, ...context };
    }

    debug(message: string, context?: LogContext): void {
        this.parent.debug(message, this.mergeContext(context));
    }

    info(message: string, context?: LogContext): void {
        this.parent.info(message, this.mergeContext(context));
    }

    warn(message: string, context?: LogContext): void {
        this.parent.warn(message, this.mergeContext(context));
    }

    error(message: string, context?: LogContext): void {
        this.parent.error(message, this.mergeContext(context));
    }
}

// Export singleton instance
export const logger = new Logger();
