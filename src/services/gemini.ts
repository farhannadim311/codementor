// Gemini API Service - Frontend calls to backend proxy
// API key is now stored securely on the server

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Check if backend is available
export const checkBackendHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
};

// Get teaching response from backend
export const getTeachingResponse = async (
    message: string,
    code: string,
    learningHistory: string,
    hintLevel: number
): Promise<{
    response: string;
    highlightLines: number[];
    suggestedHintLevel: number;
}> => {
    const response = await fetch(`${API_BASE_URL}/api/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, code, learningHistory, hintLevel }),
    });

    if (!response.ok) {
        throw new Error('Failed to get teaching response');
    }

    return response.json();
};

// Analyze screen context via backend
export const analyzeScreenContext = async (
    screenshot: string
): Promise<{
    detectedCode: string;
    language: string;
    errors: string[];
    assignmentContext: string;
}> => {
    const response = await fetch(`${API_BASE_URL}/api/analyze-screen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshot }),
    });

    if (!response.ok) {
        throw new Error('Failed to analyze screen');
    }

    return response.json();
};

// Detect weaknesses via backend
export const detectWeaknesses = async (
    sessionHistory: string,
    existingWeaknesses: string[]
): Promise<{
    newWeaknesses: string[];
    reinforcedWeaknesses: string[];
    resolvedWeaknesses: string[];
}> => {
    const response = await fetch(`${API_BASE_URL}/api/detect-weaknesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionHistory, existingWeaknesses }),
    });

    if (!response.ok) {
        throw new Error('Failed to detect weaknesses');
    }

    return response.json();
};

// Generate curriculum via backend
export const generateCurriculum = async (
    weaknesses: string[],
    level: string
): Promise<
    Array<{
        topic: string;
        description: string;
        exercises: Array<{ prompt: string; difficulty: string }>;
    }>
> => {
    const response = await fetch(`${API_BASE_URL}/api/generate-curriculum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaknesses, level }),
    });

    if (!response.ok) {
        throw new Error('Failed to generate curriculum');
    }

    return response.json();
};

// Legacy functions for backward compatibility (now no-ops since backend handles key)
export const initializeGemini = (_apiKey: string): void => {
    console.log('API key handled by backend - no client initialization needed');
};

export const isInitialized = (): boolean => {
    return true; // Always true since backend handles the key
};
