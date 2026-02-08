// Weakness Detector Agent - Analyzes patterns to identify learning gaps
import type { Weakness, CodingSession, TopicProgress } from '../types';
import { detectWeaknesses as geminiDetectWeaknesses, extractTopicsWithAI } from '../services/gemini';
import { getProfile, saveProfile, getRecentSessions } from '../services/learningProfile';

interface WeaknessPattern {
    topic: string;
    indicators: string[];
    frequency: number;
    lastSeen: Date;
    severity: 'low' | 'medium' | 'high';
}

class WeaknessDetectorAgent {
    private patterns: Map<string, WeaknessPattern> = new Map();
    private analysisInterval: ReturnType<typeof setInterval> | null = null;
    private onWeaknessDetected: (weakness: Weakness) => void = () => { };
    private onStrengthDetected: (strength: string) => void = () => { };
    private onWeaknessResolved: (topic: string) => void = () => { };
    private topicCache: Map<string, string[]> = new Map(); // Cache AI-extracted topics

    constructor() { }

    setWeaknessCallback(callback: (weakness: Weakness) => void): void {
        this.onWeaknessDetected = callback;
    }

    setStrengthCallback(callback: (strength: string) => void): void {
        this.onStrengthDetected = callback;
    }

    setResolvedCallback(callback: (topic: string) => void): void {
        this.onWeaknessResolved = callback;
    }

    // Start periodic analysis (runs every hour or after each session)
    startPeriodicAnalysis(intervalMs: number = 60 * 60 * 1000): void {
        this.analysisInterval = setInterval(() => {
            this.analyzeRecentActivity();
        }, intervalMs);
    }

    stopPeriodicAnalysis(): void {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
    }

    // Analyze recent sessions to find patterns
    async analyzeRecentActivity(): Promise<Weakness[]> {
        try {
            const sessions = await getRecentSessions(20);
            const profile = await getProfile();

            if (sessions.length === 0) {
                return [];
            }

            // Build session history summary for Gemini (AI-powered topic extraction)
            const sessionSummary = await this.buildSessionSummary(sessions);
            const existingWeaknesses = profile?.weaknesses.map((w) => w.topic) || [];

            // Use Gemini to detect patterns
            const detected = await geminiDetectWeaknesses(sessionSummary, existingWeaknesses);

            // Process new weaknesses
            const newWeaknesses: Weakness[] = detected.newWeaknesses.map((topic) => ({
                topic,
                description: `Detected struggle with ${topic} across recent sessions`,
                occurrences: 1,
                lastOccurred: new Date(),
                suggestedExercises: [],
            }));

            // Update existing weaknesses
            if (profile) {
                const updatedWeaknesses = [...profile.weaknesses];

                // Increment reinforced weaknesses
                detected.reinforcedWeaknesses.forEach((topic) => {
                    const existing = updatedWeaknesses.find((w) => w.topic === topic);
                    if (existing) {
                        existing.occurrences++;
                        existing.lastOccurred = new Date();
                    }
                });

                // Remove resolved weaknesses
                const finalWeaknesses = updatedWeaknesses.filter(
                    (w) => !detected.resolvedWeaknesses.includes(w.topic)
                );

                // Add new weaknesses
                newWeaknesses.forEach((w) => {
                    if (!finalWeaknesses.find((fw) => fw.topic === w.topic)) {
                        finalWeaknesses.push(w);
                    }
                });

                // Update strengths (limit to 6 most recent)
                const MAX_ITEMS = 6;
                const currentStrengths = new Set(profile.strengths);
                detected.newStrengths?.forEach(s => currentStrengths.add(s));
                const strengthsArray = Array.from(currentStrengths);
                // Keep only most recent 6 (new ones are added at the end)
                profile.strengths = strengthsArray.slice(-MAX_ITEMS);

                // Save updated profile (also limit weaknesses to 6)
                const limitedWeaknesses = finalWeaknesses
                    .sort((a, b) => new Date(b.lastOccurred).getTime() - new Date(a.lastOccurred).getTime())
                    .slice(0, MAX_ITEMS);
                profile.weaknesses = limitedWeaknesses;
                await saveProfile(profile);

                // Notify about new weaknesses & strengths & resolved
                newWeaknesses.forEach((w) => this.onWeaknessDetected(w));
                detected.newStrengths?.forEach(s => this.onStrengthDetected(s));
                detected.resolvedWeaknesses?.forEach(topic => this.onWeaknessResolved(topic));

                return finalWeaknesses;
            }

            return newWeaknesses;
        } catch (error) {
            console.error('Weakness analysis failed:', error);
            return [];
        }
    }

    // Analyze a single session in real-time
    async analyzeSession(session: CodingSession): Promise<WeaknessPattern[]> {
        const detectedPatterns: WeaknessPattern[] = [];

        // Analyze stuck moments
        session.stuckMoments.forEach((stuck) => {
            if (stuck.duration > 120) {
                // Stuck for more than 2 minutes
                const pattern = this.recordPattern('extended_stuck', stuck.file);
                if (pattern) detectedPatterns.push(pattern);
            }
        });

        // Analyze interactions for repeated struggles
        const interactionTopics = new Map<string, number>();
        for (const interaction of session.interactions) {
            // Extract topics from AI responses using AI
            const topics = await this.extractTopics(interaction.aiResponse);
            topics.forEach((topic: string) => {
                interactionTopics.set(topic, (interactionTopics.get(topic) || 0) + 1);
            });
        }

        // Topics asked about multiple times indicate weakness
        interactionTopics.forEach((count, topic) => {
            if (count >= 2) {
                const pattern = this.recordPattern(topic, 'repeated questions');
                if (pattern) detectedPatterns.push(pattern);
            }
        });

        return detectedPatterns;
    }

    private recordPattern(topic: string, indicator: string): WeaknessPattern | null {
        const existing = this.patterns.get(topic);

        if (existing) {
            existing.frequency++;
            existing.indicators.push(indicator);
            existing.lastSeen = new Date();
            existing.severity = this.calculateSeverity(existing.frequency);
            return existing;
        }

        const newPattern: WeaknessPattern = {
            topic,
            indicators: [indicator],
            frequency: 1,
            lastSeen: new Date(),
            severity: 'low',
        };

        this.patterns.set(topic, newPattern);
        return newPattern;
    }

    private calculateSeverity(frequency: number): 'low' | 'medium' | 'high' {
        if (frequency >= 5) return 'high';
        if (frequency >= 3) return 'medium';
        return 'low';
    }

    // AI-powered topic extraction with caching
    private async extractTopics(text: string): Promise<string[]> {
        // Check cache first
        const cacheKey = text.slice(0, 100); // Use first 100 chars as key
        if (this.topicCache.has(cacheKey)) {
            return this.topicCache.get(cacheKey) || [];
        }

        // Use AI to extract topics
        try {
            const topics = await extractTopicsWithAI(text);
            this.topicCache.set(cacheKey, topics);

            // Limit cache size
            if (this.topicCache.size > 100) {
                const firstKey = this.topicCache.keys().next().value;
                if (firstKey) this.topicCache.delete(firstKey);
            }

            return topics;
        } catch (error) {
            console.error('AI topic extraction failed:', error);
            return this.extractTopicsFallback(text);
        }
    }

    // Fallback to keyword matching if AI fails
    private extractTopicsFallback(text: string): string[] {
        const commonTopics = [
            'loops', 'arrays', 'functions', 'recursion', 'variables',
            'conditionals', 'objects', 'classes', 'async', 'promises',
            'callbacks', 'closures', 'scope', 'types', 'debugging',
            'algorithms', 'data structures',
        ];
        const lowercaseText = text.toLowerCase();
        return commonTopics.filter((topic) => lowercaseText.includes(topic));
    }

    private async buildSessionSummary(sessions: CodingSession[]): Promise<string> {
        const summaries = await Promise.all(sessions.map(async (session) => {
            const _duration = session.endTime
                ? Math.round(
                    (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) /
                    1000 /
                    60
                )
                : 0;

            const mainFile = session.files[0];
            const codeSample = mainFile ? `
Code Sample (${mainFile.filename}):
\`\`\`${mainFile.language}
${mainFile.content.slice(0, 1000)}${mainFile.content.length > 1000 ? '...' : ''}
\`\`\`` : '';

            // Extract topics with AI for each interaction
            const topicsByInteraction = await Promise.all(
                session.interactions.map(async (i) => {
                    const topics = await this.extractTopics(i.aiResponse);
                    return topics.join(', ');
                })
            );

            return `
Session on ${new Date(session.startTime).toLocaleDateString()}:
- Files: ${session.files.map((f) => f.filename).join(', ') || 'unknown'}
- Stuck moments: ${session.stuckMoments.length}
- Help requests: ${session.interactions.length}
- Topics discussed: ${topicsByInteraction.join('; ')}
${codeSample}
      `.trim();
        }));

        return summaries.join('\n\n');
    }

    // Get recommended exercises for detected weaknesses
    getRecommendedFocus(): TopicProgress[] {
        const weakPatterns = Array.from(this.patterns.values())
            .filter((p) => p.severity !== 'low')
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 3);

        return weakPatterns.map((pattern) => ({
            topic: pattern.topic,
            level: 'beginner' as const,
            timeSpent: 0,
            successRate: 0,
            lastPracticed: pattern.lastSeen,
            struggles: pattern.indicators,
        }));
    }
}

// Singleton
let weaknessDetector: WeaknessDetectorAgent | null = null;

export const initializeWeaknessDetector = (): WeaknessDetectorAgent => {
    weaknessDetector = new WeaknessDetectorAgent();
    return weaknessDetector;
};

export const getWeaknessDetector = (): WeaknessDetectorAgent | null => weaknessDetector;

export { WeaknessDetectorAgent };
