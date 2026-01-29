// Learning Profile Service - Persistent storage for user learning data
import type { LearningProfile, CodingSession, Weakness, TopicProgress } from '../types';

const DB_NAME = 'CodeMentorDB';
const DB_VERSION = 1;
const PROFILE_STORE = 'profiles';
const SESSIONS_STORE = 'sessions';

let db: IDBDatabase | null = null;

export const initializeDatabase = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Create profiles store
            if (!database.objectStoreNames.contains(PROFILE_STORE)) {
                database.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
            }

            // Create sessions store
            if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
                const sessionsStore = database.createObjectStore(SESSIONS_STORE, {
                    keyPath: 'id',
                });
                sessionsStore.createIndex('startTime', 'startTime', { unique: false });
            }
        };
    });
};

// Profile operations
export const getProfile = async (userId: string = 'default'): Promise<LearningProfile | null> => {
    if (!db) await initializeDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction(PROFILE_STORE, 'readonly');
        const store = transaction.objectStore(PROFILE_STORE);
        const request = store.get(userId);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const createDefaultProfile = (): LearningProfile => ({
    id: 'default',
    createdAt: new Date(),
    lastSessionAt: new Date(),
    totalSessions: 0,
    totalCodingTime: 0,
    topics: [],
    weaknesses: [],
    strengths: [],
});

export const saveProfile = async (profile: LearningProfile): Promise<void> => {
    if (!db) await initializeDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction(PROFILE_STORE, 'readwrite');
        const store = transaction.objectStore(PROFILE_STORE);
        const request = store.put(profile);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const updateWeaknesses = async (
    weaknesses: Weakness[],
    userId: string = 'default'
): Promise<void> => {
    const profile = await getProfile(userId);
    if (!profile) {
        throw new Error('Profile not found');
    }

    profile.weaknesses = weaknesses;
    await saveProfile(profile);
};

export const addTopicProgress = async (
    topic: TopicProgress,
    userId: string = 'default'
): Promise<void> => {
    const profile = await getProfile(userId);
    if (!profile) {
        throw new Error('Profile not found');
    }

    const existingIndex = profile.topics.findIndex((t) => t.topic === topic.topic);
    if (existingIndex >= 0) {
        profile.topics[existingIndex] = topic;
    } else {
        profile.topics.push(topic);
    }

    await saveProfile(profile);
};



// Import profile
export const importProfile = async (jsonData: string): Promise<void> => {
    try {
        const profile = JSON.parse(jsonData) as LearningProfile;
        // Basic validation
        if (!profile.id || !Array.isArray(profile.topics) || !Array.isArray(profile.weaknesses)) {
            throw new Error('Invalid profile format');
        }

        // Ensure dates are parsed correctly if they are strings
        if (typeof profile.lastSessionAt === 'string') profile.lastSessionAt = new Date(profile.lastSessionAt);
        if (typeof profile.createdAt === 'string') profile.createdAt = new Date(profile.createdAt);

        // Save imported profile (overwrites 'default' if that matches, or adds new)
        await saveProfile(profile);
    } catch (error) {
        console.error('Failed to import profile:', error);
        throw error;
    }
};

// Session operations
export const saveSession = async (session: CodingSession): Promise<void> => {
    if (!db) await initializeDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction(SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(SESSIONS_STORE);
        const request = store.put(session);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getSession = async (sessionId: string): Promise<CodingSession | null> => {
    if (!db) await initializeDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction(SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(SESSIONS_STORE);
        const request = store.get(sessionId);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const getRecentSessions = async (limit: number = 10): Promise<CodingSession[]> => {
    if (!db) await initializeDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction(SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(SESSIONS_STORE);
        const index = store.index('startTime');
        const request = index.openCursor(null, 'prev');

        const sessions: CodingSession[] = [];

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && sessions.length < limit) {
                sessions.push(cursor.value);
                cursor.continue();
            } else {
                resolve(sessions);
            }
        };

        request.onerror = () => reject(request.error);
    });
};

export const createSession = (): CodingSession => ({
    id: `session_${Date.now()}`,
    startTime: new Date(),
    files: [],
    interactions: [],
    stuckMoments: [],
});

// Analytics helpers
export const getSessionStats = async (): Promise<{
    totalSessions: number;
    totalTime: number;
    averageSessionLength: number;
    topTopics: string[];
}> => {
    const sessions = await getRecentSessions(100);

    const totalTime = sessions.reduce((acc, session) => {
        if (session.endTime) {
            return acc + (new Date(session.endTime).getTime() - new Date(session.startTime).getTime());
        }
        return acc;
    }, 0);

    const topicCounts: Record<string, number> = {};
    // This would be populated from session analysis

    return {
        totalSessions: sessions.length,
        totalTime: Math.round(totalTime / 1000 / 60), // in minutes
        averageSessionLength: sessions.length > 0 ? Math.round(totalTime / sessions.length / 1000 / 60) : 0,
        topTopics: Object.entries(topicCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([topic]) => topic),
    };
};
