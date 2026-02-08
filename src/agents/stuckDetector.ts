// Stuck Detector Agent - Autonomous detection of when student needs help
import type { ScreenContext, StuckMoment } from '../types';

interface StuckDetectorConfig {
    stuckThresholdMs: number; // How long without progress before considered "stuck"
    errorRepeatThreshold: number; // How many times same error before triggering
    idleThresholdMs: number; // How long idle before gentle check-in
    onStuckDetected: (moment: StuckMoment, reason: string) => void;
    onIdleDetected: () => void;
}

// Adaptive Difficulty Engine - tracks struggle and adjusts hint specificity
interface AdaptiveHintState {
    currentTopic: string;
    hintRequestCount: number;
    firstHintTime: number;
    lastHintTime: number;
    struggleLevel: 'minimal' | 'moderate' | 'significant' | 'severe';
}

const DEFAULT_CONFIG: StuckDetectorConfig = {
    stuckThresholdMs: 10 * 60 * 1000, // 10 minutes
    errorRepeatThreshold: 5,
    idleThresholdMs: 15 * 60 * 1000, // 15 minutes
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

    // Adaptive Difficulty Engine state
    private adaptiveState: AdaptiveHintState = {
        currentTopic: '',
        hintRequestCount: 0,
        firstHintTime: 0,
        lastHintTime: 0,
        struggleLevel: 'minimal'
    };

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

    // =========================================================================
    // ADAPTIVE DIFFICULTY ENGINE
    // =========================================================================

    /**
     * Record a hint request - increases hint specificity over time
     * Call this when user asks for help on a topic
     */
    recordHintRequest(topic?: string): void {
        const now = Date.now();
        const normalizedTopic = (topic || this.currentFile || 'general').toLowerCase();

        // Reset if switching to new topic
        if (normalizedTopic !== this.adaptiveState.currentTopic) {
            this.adaptiveState = {
                currentTopic: normalizedTopic,
                hintRequestCount: 1,
                firstHintTime: now,
                lastHintTime: now,
                struggleLevel: 'minimal'
            };
            return;
        }

        // Same topic - increment
        this.adaptiveState.hintRequestCount++;
        this.adaptiveState.lastHintTime = now;

        // Calculate struggle level based on hints + time
        const struggleDuration = now - this.adaptiveState.firstHintTime;
        const minutesStrugging = struggleDuration / (1000 * 60);

        if (this.adaptiveState.hintRequestCount >= 5 || minutesStrugging > 15) {
            this.adaptiveState.struggleLevel = 'severe';
        } else if (this.adaptiveState.hintRequestCount >= 3 || minutesStrugging > 8) {
            this.adaptiveState.struggleLevel = 'significant';
        } else if (this.adaptiveState.hintRequestCount >= 2 || minutesStrugging > 3) {
            this.adaptiveState.struggleLevel = 'moderate';
        } else {
            this.adaptiveState.struggleLevel = 'minimal';
        }
    }

    /**
     * Get the recommended hint level (1-5) based on struggle
     * 1 = Very vague, 5 = Very specific
     */
    getAdaptiveHintLevel(): number {
        const { hintRequestCount, struggleLevel } = this.adaptiveState;

        // Base level from hint count (each hint gets more specific)
        let level = Math.min(hintRequestCount, 5);

        // Boost based on struggle severity
        switch (struggleLevel) {
            case 'severe':
                level = Math.max(level, 4); // At least level 4
                break;
            case 'significant':
                level = Math.max(level, 3); // At least level 3
                break;
            case 'moderate':
                level = Math.max(level, 2); // At least level 2
                break;
        }

        return Math.min(Math.max(level, 1), 5); // Clamp 1-5
    }

    /**
     * Get context string for AI about student's struggle level
     */
    getStruggleContext(): string {
        const { hintRequestCount, struggleLevel } = this.adaptiveState;
        const timeSinceFirst = this.adaptiveState.firstHintTime
            ? Math.round((Date.now() - this.adaptiveState.firstHintTime) / 60000)
            : 0;

        if (struggleLevel === 'severe') {
            return `IMPORTANT: Student has been struggling for ${timeSinceFirst} minutes and asked ${hintRequestCount} times for help. They need more concrete guidance but still not the direct answer.`;
        } else if (struggleLevel === 'significant') {
            return `Student has asked ${hintRequestCount} times for help over ${timeSinceFirst} minutes. Provide clearer direction while maintaining the Socratic approach.`;
        } else if (struggleLevel === 'moderate') {
            return `Student asked for help ${hintRequestCount} times. Some additional guidance is appropriate.`;
        }
        return 'First time asking about this topic - keep hints conceptual.';
    }

    /**
     * Reset adaptive state (call when student successfully solves problem)
     */
    resetAdaptiveState(): void {
        this.adaptiveState = {
            currentTopic: '',
            hintRequestCount: 0,
            firstHintTime: 0,
            lastHintTime: 0,
            struggleLevel: 'minimal'
        };
    }

    getStats(): {
        timeSinceLastChange: number;
        uniqueErrors: number;
        isStuck: boolean;
        adaptiveHintLevel: number;
        struggleLevel: string;
        hintRequestCount: number;
    } {
        return {
            timeSinceLastChange: Date.now() - this.lastChangeTime,
            uniqueErrors: this.errorHistory.size,
            isStuck: Date.now() - this.lastChangeTime > this.config.stuckThresholdMs,
            adaptiveHintLevel: this.getAdaptiveHintLevel(),
            struggleLevel: this.adaptiveState.struggleLevel,
            hintRequestCount: this.adaptiveState.hintRequestCount
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
