// Gemini API Service - Frontend calls to backend proxy
// Updated for Gemini 3 Interactions API with streaming and interactive shell

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Generate a unique session ID for conversation continuity
let currentSessionId: string | null = null;

export const getSessionId = (): string => {
    if (!currentSessionId) {
        currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return currentSessionId;
};

export const resetSession = (): void => {
    currentSessionId = null;
};

// Check if backend is available
export const checkBackendHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
};

// =============================================================================
// TEACHING RESPONSES
// =============================================================================

// Get teaching response from backend
export const getTeachingResponse = async (
    message: string,
    code: string,
    learningHistory: string,
    hintLevel: number,
    pdfContent?: string
): Promise<{
    response: string;
    highlightLines: number[];
    suggestedHintLevel: number;
    thinkingSummary?: string;
}> => {
    const response = await fetch(`${API_BASE_URL}/api/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            code,
            learningHistory,
            hintLevel,
            sessionId: getSessionId(),
            pdfContent,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to get teaching response');
    }

    return response.json();
};

// Streaming teaching response (returns async generator)
export async function* streamTeachingResponse(
    message: string,
    code: string,
    learningHistory: string,
    hintLevel: number,
    pdfContent?: string,
    struggleContext?: string
): AsyncGenerator<{ type: 'text' | 'thought' | 'done' | 'error'; content: string }> {
    const response = await fetch(`${API_BASE_URL}/api/teach/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            code,
            learningHistory,
            hintLevel,
            sessionId: getSessionId(),
            pdfContent,
            struggleContext,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to get streaming response');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    yield data;
                } catch {
                    // Ignore parse errors
                }
            }
        }
    }
}

// =============================================================================
// SCREEN & PDF ANALYSIS
// =============================================================================

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

// Analyze PDF document
export const analyzePdf = async (
    pdfData: string,
    question?: string
): Promise<{
    analysis: string;
    interactionId: string;
}> => {
    const response = await fetch(`${API_BASE_URL}/api/analyze-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfData, question }),
    });

    if (!response.ok) {
        throw new Error('Failed to analyze PDF');
    }

    return response.json();
};

// =============================================================================
// WEAKNESS DETECTION & CURRICULUM
// =============================================================================

// Detect weaknesses via backend
export const detectWeaknesses = async (
    sessionHistory: string,
    existingWeaknesses: string[]
): Promise<{
    newWeaknesses: string[];
    reinforcedWeaknesses: string[];
    resolvedWeaknesses: string[];
    newStrengths: string[];
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

// =============================================================================
// INTERACTIVE SHELL
// =============================================================================

export interface ShellSession {
    sessionId: string;
    shell: string;
    cwd: string;
}

// Spawn a new interactive shell
export const spawnShell = async (cwd?: string, userId?: string): Promise<ShellSession> => {
    const response = await fetch(`${API_BASE_URL}/api/shell/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, userId }),
    });

    if (!response.ok) {
        throw new Error('Failed to spawn shell');
    }

    return response.json();
};

// Send input to shell
export const sendShellInput = async (sessionId: string, input: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/shell/input/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
    });

    if (!response.ok) {
        throw new Error('Failed to send shell input');
    }
};

// Subscribe to shell output (returns EventSource)
export const subscribeShellOutput = (
    sessionId: string,
    onOutput: (type: 'stdout' | 'stderr' | 'exit', content: string, exitCode?: number) => void,
    onError: (error: Event) => void
): EventSource => {
    console.log(`🔌 [SSE] Connecting to output for session ${sessionId}...`);
    const eventSource = new EventSource(`${API_BASE_URL}/api/shell/output/${sessionId}`);

    eventSource.onopen = (_event) => {
        console.log(`✅ [SSE] Connection opened for session ${sessionId}`);
    };

    eventSource.onmessage = (event) => {
        // console.log(`📩 [SSE] Message received:`, event.data.substring(0, 50));
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'exit') {
                console.log(`🛑 [SSE] Process exit received`);
                onOutput('exit', '', data.code);
            } else {
                onOutput(data.type, data.content);
            }
        } catch (e) {
            // Check for heartbeat or special messages
            if (event.data === ':connected') {
                console.log(`💓 [SSE] Connected message received`);
            } else if (event.data === ':heartbeat') {
                // Heartbeat - ignore or log verbose
                // console.log(`💓 [SSE] Heartbeat`);
            } else {
                console.warn(`⚠️ [SSE] Parse error or unknown message:`, event.data);
            }
        }
    };

    eventSource.onerror = (error) => {
        console.error(`❌ [SSE] Error for session ${sessionId}:`, error);
        console.log('EventSource state:', eventSource.readyState); // 0=CONNECTING, 1=OPEN, 2=CLOSED
        onError(error);
    };

    return eventSource;
};

// Send interrupt (Ctrl+C) to shell
export const interruptShell = async (sessionId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/shell/interrupt/${sessionId}`, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error('Failed to interrupt shell');
    }
};

// Kill shell session
export const killShell = async (sessionId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/shell/kill/${sessionId}`, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error('Failed to kill shell');
    }
};

// =============================================================================
// CODE EXECUTION (One-shot)
// =============================================================================

export interface CompilerInfo {
    name: string;
    version: string;
    extensions: string[];
}

export interface CompilersResponse {
    available: CompilerInfo[];
    supported: Array<{
        name: string;
        extensions: string[];
        installed: boolean;
    }>;
}

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
    language: string;
}

// Get available compilers
export const getCompilers = async (): Promise<CompilersResponse> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/compilers`);
        if (!response.ok) {
            throw new Error('Failed to get compilers');
        }
        return response.json();
    } catch (error) {
        console.error('Failed to get compilers:', error);
        return { available: [], supported: [] };
    }
};

// Execute code (one-shot)
export const executeCode = async (
    code: string,
    filename: string,
    additionalFiles?: Array<{ name: string; content: string }>
): Promise<ExecutionResult> => {
    const response = await fetch(`${API_BASE_URL}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, filename, additionalFiles }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute code');
    }

    return response.json();
};

// =============================================================================
// AI-POWERED TOPIC EXTRACTION
// =============================================================================

export const extractTopicsWithAI = async (text: string): Promise<string[]> => {
    if (!text || text.length < 50) {
        return [];
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/extract-topics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.topics || [];
    } catch (error) {
        console.error('Topic extraction failed:', error);
        return [];
    }
};

// =============================================================================
// EXERCISE GENERATION & VALIDATION
// =============================================================================

export interface GeneratedExercise {
    id: string;
    title: string;
    description: string;
    starterCode: string;
    testCases: Array<{
        input: string;
        expectedOutput: string;
        isHidden: boolean;
        explanation?: string;
    }>;
    hints: Array<{ level: number; content: string }>;
    topic: string;
    difficulty: string;
    language: string;
    solutionApproach?: string;
    timeComplexity?: string;
    spaceComplexity?: string;
}

export interface ValidationResult {
    results: Array<{
        testCaseId: number;
        input: string;
        expectedOutput: string;
        actualOutput: string;
        passed: boolean;
        error?: string;
        isHidden: boolean;
    }>;
    passedCount: number;
    totalCount: number;
    allPassed: boolean;
    feedback: string;
    score: number;
}

// Generate a LeetCode-style exercise for a specific weakness
export const generateExercise = async (
    topic: string,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    weaknessContext?: string,
    language: string = 'javascript',
    userCodeSamples?: string // User's recent code for personalization
): Promise<GeneratedExercise> => {
    const response = await fetch(`${API_BASE_URL}/api/generate-exercise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, difficulty, weaknessContext, language, userCodeSamples }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate exercise');
    }

    return response.json();
};

// Validate user's solution against test cases
export const validateExercise = async (
    code: string,
    testCases: Array<{ input: string; expectedOutput: string; isHidden: boolean }>,
    language: string = 'javascript',
    exerciseId?: string
): Promise<ValidationResult> => {
    const response = await fetch(`${API_BASE_URL}/api/validate-exercise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, testCases, language, exerciseId }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to validate exercise');
    }

    return response.json();
};

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

export const initializeGemini = (_apiKey: string): void => {
    console.log('API key handled by backend - no client initialization needed');
};

export const isInitialized = (): boolean => {
    return true;
};
