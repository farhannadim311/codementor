// Stuck Detector Agent - Autonomous detection of when student needs help
import type { ScreenContext, StuckMoment } from '../types';

interface StuckDetectorConfig {
    stuckThresholdMs: number; // How long without progress before considered "stuck"
    errorRepeatThreshold: number; // How many times same error before triggering
    idleThresholdMs: number; // How long idle before gentle check-in
    onStuckDetected: (moment: StuckMoment, reason: string) => void;
    onIdleDetected: () => void;
}

const DEFAULT_CONFIG: StuckDetectorConfig = {
    stuckThresholdMs: 5 * 60 * 1000, // 5 minutes
    errorRepeatThreshold: 3,
    idleThresholdMs: 10 * 60 * 1000, // 10 minutes
    onStuckDetected: () => { },
    onIdleDetected: () => { },
};

class StuckDetectorAgent {
    private config: StuckDetectorConfig;
    private lastCodeSnapshot: string = '';
    private lastChangeTime: number = Date.now();
    private lastActivityTime: number = Date.now();
    private errorHistory: Map<string, number> = new Map();
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private currentFile: string = '';
    private currentLine: number = 0;
    private isRunning: boolean = false;

    constructor(config: Partial<StuckDetectorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;

        // Check every 30 seconds
        this.checkInterval = setInterval(() => {
            this.performCheck();
        }, 30 * 1000);
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
    }

    // Called when new screen context is captured
    updateContext(context: ScreenContext): void {
        this.lastActivityTime = Date.now();

        // Check for code changes
        if (context.detectedCode !== this.lastCodeSnapshot) {
            const hasSignificantChange = this.isSignificantChange(
                this.lastCodeSnapshot,
                context.detectedCode
            );

            if (hasSignificantChange) {
                this.lastChangeTime = Date.now();
                this.lastCodeSnapshot = context.detectedCode;
            }
        }

        // Track errors
        context.detectedErrors.forEach((error) => {
            const errorKey = this.normalizeError(error);
            const count = this.errorHistory.get(errorKey) || 0;
            this.errorHistory.set(errorKey, count + 1);

            // Check if same error repeated too many times
            if (count + 1 >= this.config.errorRepeatThreshold) {
                this.triggerStuck(
                    'repeated_error',
                    `Same error repeated ${count + 1} times: ${error}`
                );
                // Reset counter after triggering
                this.errorHistory.set(errorKey, 0);
            }
        });
    }

    // Manually report cursor position
    updateCursor(file: string, line: number): void {
        this.currentFile = file;
        this.currentLine = line;
        this.lastActivityTime = Date.now();
    }

    private performCheck(): void {
        const now = Date.now();

        // Check for idle
        if (now - this.lastActivityTime > this.config.idleThresholdMs) {
            this.config.onIdleDetected();
            this.lastActivityTime = now; // Reset to avoid repeated triggers
            return;
        }

        // Check for stuck (no meaningful progress)
        if (now - this.lastChangeTime > this.config.stuckThresholdMs) {
            this.triggerStuck(
                'no_progress',
                `No significant code changes for ${Math.round(
                    (now - this.lastChangeTime) / 1000 / 60
                )} minutes`
            );
            this.lastChangeTime = now; // Reset to avoid repeated triggers
        }
    }

    private triggerStuck(_type: string, reason: string): void {
        const moment: StuckMoment = {
            timestamp: new Date(),
            file: this.currentFile,
            line: this.currentLine,
            duration: Math.round((Date.now() - this.lastChangeTime) / 1000),
            resolved: false,
        };

        this.config.onStuckDetected(moment, reason);
    }

    private isSignificantChange(oldCode: string, newCode: string): boolean {
        // Ignore whitespace-only changes
        const oldNormalized = oldCode.replace(/\s+/g, ' ').trim();
        const newNormalized = newCode.replace(/\s+/g, ' ').trim();

        if (oldNormalized === newNormalized) return false;

        // Consider significant if more than 10 characters changed
        const lengthDiff = Math.abs(newNormalized.length - oldNormalized.length);
        if (lengthDiff > 10) return true;

        // Simple diff: count character differences
        let differences = 0;
        const maxLen = Math.max(oldNormalized.length, newNormalized.length);
        for (let i = 0; i < maxLen; i++) {
            if (oldNormalized[i] !== newNormalized[i]) {
                differences++;
            }
        }

        return differences > 5;
    }

    private normalizeError(error: string): string {
        // Normalize error messages to group similar errors
        return error
            .toLowerCase()
            .replace(/line \d+/g, 'line X')
            .replace(/column \d+/g, 'column X')
            .replace(/'[^']*'/g, "'...'")
            .replace(/"[^"]*"/g, '"..."')
            .trim();
    }

    // Reset after user asks for help (to avoid double-triggering)
    acknowledgeHelp(): void {
        this.lastChangeTime = Date.now();
        this.errorHistory.clear();
    }

    getStats(): {
        timeSinceLastChange: number;
        uniqueErrors: number;
        isStuck: boolean;
    } {
        return {
            timeSinceLastChange: Date.now() - this.lastChangeTime,
            uniqueErrors: this.errorHistory.size,
            isStuck: Date.now() - this.lastChangeTime > this.config.stuckThresholdMs,
        };
    }
}

// Singleton instance
let stuckDetector: StuckDetectorAgent | null = null;

export const initializeStuckDetector = (
    config: Partial<StuckDetectorConfig> = {}
): StuckDetectorAgent => {
    stuckDetector = new StuckDetectorAgent(config);
    return stuckDetector;
};

export const getStuckDetector = (): StuckDetectorAgent | null => stuckDetector;

export { StuckDetectorAgent };
export type { StuckDetectorConfig };
