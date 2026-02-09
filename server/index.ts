// Express Backend Server - Gemini 3 with Interactions API
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Validate API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables!');
    process.exit(1);
}

// Initialize Gemini client
const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Model configuration
const MODEL_NAME = 'gemini-3-flash-preview';

// =============================================================================
// LANGUAGE CONFIGURATION REGISTRY
// Defines how to handle each language for code execution
// =============================================================================
interface LanguageConfig {
    extension: string;
    interpreted: boolean;
    runner: string;
    compiler?: string;
    compileArgs?: string[];
    // Template placeholders: {CODE}, {INPUT}, {INPUT_ESCAPED}
    wrapperTemplate: string;
    // If true, input is passed via stdin instead of template substitution
    usesStdin?: boolean;
}

const LANGUAGE_REGISTRY: Record<string, LanguageConfig> = {
    javascript: {
        extension: '.js',
        interpreted: true,
        runner: 'node',
        wrapperTemplate: `{CODE}

// Test execution
try {
    const input = JSON.parse('{INPUT_ESCAPED}');
    const result = solution(input);
    console.log(JSON.stringify(result));
} catch (e) {
    console.error(e.message);
}`,
    },
    typescript: {
        extension: '.ts',
        interpreted: true,
        runner: 'npx tsx',
        wrapperTemplate: `{CODE}

// Test execution
try {
    const input = JSON.parse('{INPUT_ESCAPED}');
    const result = solution(input);
    console.log(JSON.stringify(result));
} catch (e) {
    console.error((e as Error).message);
}`,
    },
    python: {
        extension: '.py',
        interpreted: true,
        runner: 'python3',
        wrapperTemplate: `{CODE}

# Test execution
import json
import sys

try:
    input_val = json.loads(r'''{INPUT}''')
    result = solution(input_val)
    print(json.dumps(result))
except Exception as e:
    print(str(e), file=sys.stderr)`,
    },
    cpp: {
        extension: '.cpp',
        interpreted: false,
        compiler: 'g++',
        compileArgs: ['-std=c++17', '-O2'],
        runner: '',
        // For compiled languages, user writes complete main() that reads from stdin
        // We just compile and run, passing input via stdin
        wrapperTemplate: `{CODE}`,
        usesStdin: true,
    },
    c: {
        extension: '.c',
        interpreted: false,
        compiler: 'gcc',
        compileArgs: ['-O2'],
        runner: '',
        wrapperTemplate: `{CODE}`,
        usesStdin: true,
    },
    java: {
        extension: '.java',
        interpreted: false,
        compiler: 'javac',
        runner: 'java',
        wrapperTemplate: `{CODE}`,
        usesStdin: true,
    },
    ruby: {
        extension: '.rb',
        interpreted: true,
        runner: 'ruby',
        wrapperTemplate: `{CODE}

require 'json'

begin
    input = JSON.parse('{INPUT_ESCAPED}')
    result = solution(input)
    puts JSON.generate(result)
rescue => e
    STDERR.puts e.message
end`,
    },
    go: {
        extension: '.go',
        interpreted: false,
        compiler: 'go',
        compileArgs: ['build', '-o'],
        runner: '',
        wrapperTemplate: `{CODE}`,
        usesStdin: true,
    },
    bash: {
        extension: '.sh',
        interpreted: true,
        runner: 'bash',
        wrapperTemplate: `{CODE}

# Test execution
INPUT='{INPUT_ESCAPED}'
solution "$INPUT"`,
    },
};

// Helper to get language config with fallback
function getLanguageConfig(lang: string): LanguageConfig | null {
    const normalized = lang.toLowerCase().trim();
    if (LANGUAGE_REGISTRY[normalized]) {
        return LANGUAGE_REGISTRY[normalized];
    }
    return null; // Will trigger AI generation
}

// Cache for AI-generated language configs
const aiGeneratedConfigs: Map<string, LanguageConfig> = new Map();

// AI-powered wrapper generation for any language
async function generateLanguageConfigWithAI(language: string): Promise<LanguageConfig> {
    // Check cache first
    const cached = aiGeneratedConfigs.get(language.toLowerCase());
    if (cached) {
        return cached;
    }

    console.log(`[AI] Generating wrapper for unknown language: ${language}`);

    const prompt = `You are a code execution expert. Generate the configuration needed to run ${language} code.

The code will have a function named "solution" that takes JSON-parsed input and returns a result.
Generate a wrapper that:
1. Contains a {CODE} placeholder where user code will be inserted
2. Contains a {INPUT} placeholder for the raw JSON input string
3. Parses the JSON input using ${language}'s JSON library
4. Calls the solution() function with the parsed input
5. Prints the result as JSON to stdout

Return ONLY this JSON (no markdown, no explanation):
{
    "extension": ".ext",
    "interpreted": true,
    "runner": "command to run the file",
    "compiler": null,
    "compileArgs": [],
    "wrapperTemplate": "full wrapper code with {CODE} and {INPUT} placeholders"
}

IMPORTANT:
- For compiled languages like C++, Go, Rust: set interpreted=false, provide compiler command
- The wrapperTemplate must be valid ${language} code
- Use the language's native JSON parsing library
- Handle errors gracefully, printing to stderr`;

    try {
        const response = await client.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        const text = response.text || '';

        // Parse the JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON in AI response');
        }

        const config = JSON.parse(jsonMatch[0]) as LanguageConfig;

        // Validate required fields
        if (!config.extension || !config.wrapperTemplate) {
            throw new Error('Missing required fields in AI response');
        }

        // Cache it
        aiGeneratedConfigs.set(language.toLowerCase(), config);
        console.log(`[AI] Successfully generated config for ${language}`);

        return config;
    } catch (error) {
        console.error(`[AI] Failed to generate config for ${language}:`, error);
        // Fallback to JavaScript if AI fails
        return LANGUAGE_REGISTRY.javascript;
    }
}

// For compiled languages, generate a complete test harness using AI
// This is needed because compiled languages can't dynamically parse JSON and call typed functions
async function generateTestHarness(
    language: string,
    userCode: string,
    testInput: string,
    config: LanguageConfig
): Promise<string> {
    console.log(`[AI] Generating test harness for ${language}...`);

    const prompt = `You are a ${language} expert. Generate a complete, compilable test harness.

USER'S CODE (INCLUDE THIS EXACTLY AS-IS, DO NOT MODIFY):
\`\`\`${language}
${userCode}
\`\`\`

TEST INPUT (as JSON):
${testInput}

REQUIREMENTS:
1. Include the USER'S CODE above EXACTLY as written - do not change it at all
2. Add a main() function that:
   - Constructs the input data as ${language} native types (vectors, strings, etc.) based on the JSON
   - Calls the user's solution() function with this data
   - Prints ONLY the result to stdout (as JSON-compatible format)
3. Include any necessary headers/imports
4. The code must compile and run without external dependencies

CRITICAL: You MUST include the user's solution() function EXACTLY as provided above.
Do NOT rewrite or "fix" the user's code. Just wrap it with a main() that tests it.

Return ONLY the complete code, no explanations.`;

    try {
        const response = await client.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        let generatedCode = response.text || '';

        // Strip markdown code blocks if present
        generatedCode = generatedCode.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();

        console.log(`[AI] Generated test harness (${generatedCode.length} chars)`);
        return generatedCode;
    } catch (error) {
        console.error(`[AI] Failed to generate test harness:`, error);
        // Fallback to template
        return config.wrapperTemplate
            .replace('{CODE}', userCode)
            .replace(/{INPUT}/g, testInput);
    }
}


// Store interaction IDs for stateful conversations
const conversationSessions: Map<string, string> = new Map();

// Teaching system prompt
const TEACHING_SYSTEM_PROMPT = `You are CodeMentor, an expert programming tutor who uses the Socratic method.
Your core principles:
1. NEVER give direct answers or complete code solutions
2. Guide students to discover answers themselves through questions
3. Provide hints that increase in specificity based on the hint level (1-5)
4. Celebrate small victories and encourage persistence
5. If you see errors in their code, ask questions that lead them to find the error
6. Use analogies and real-world examples to explain concepts

## PROGRESSIVE DISCLOSURE (Hint Levels)
Adjust your response specificity based on the provided hint level:

### Level 1 (Vague - First attempt)
- Use analogies and conceptual hints only
- Ask Socratic questions: "What do you think happens when...?"
- Never mention specific functions, methods, or syntax

### Level 2 (Directional)
- Point toward the general area: "Consider looking at your loop structure"
- Still no specific code or function names
- Ask guiding questions about the approach

### Level 3 (Focused)
- Identify the specific concept: "Think about how array indexing works"
- Can mention relevant function names without showing usage
- Provide pseudocode if helpful

### Level 4 (Detailed)
- Explain the concept thoroughly with examples
- Walk through the logic step by step
- Can show similar examples (but not the exact solution)

### Level 5 (Maximum Help - Student severely struggling)
- Show detailed pseudocode
- Explain exactly what needs to happen
- Can show code patterns (still avoid the exact solution)
- Be extra encouraging - student has been trying hard

Remember: Your goal is to build understanding, not to solve problems for them.`;


// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'CodeMentor API is running', model: MODEL_NAME });
});

// Debug endpoint - View user profile data (for development)
// NOTE: Profile is stored in browser IndexedDB, not on backend
// This endpoint returns info about what the backend knows
app.get('/api/debug/info', (_req, res) => {
    res.json({
        message: 'Profile data is stored in browser IndexedDB, not on the server',
        howToView: 'Open browser DevTools → Application → IndexedDB → CodeMentorDB',
        stores: ['profiles', 'sessions'],
        note: 'The frontend fetches profile data and sends relevant portions to API endpoints'
    });
});

// =============================================================================
// TEACHING ENDPOINT - Using Interactions API (Beta)
// =============================================================================

app.post('/api/teach', async (req, res) => {
    try {
        const { message, code, learningHistory, hintLevel, sessionId, pdfContent, struggleContext } = req.body;

        // Build prompt with adaptive hint context
        const textContent = `
${TEACHING_SYSTEM_PROMPT}

Current hint level: ${hintLevel}/5
${struggleContext ? `\n[ADAPTIVE CONTEXT]: ${struggleContext}\n` : ''}
${learningHistory ? `Learning context: ${learningHistory}` : ''}

${code ? `Student's current code:\n\`\`\`\n${code}\n\`\`\`` : ''}
${pdfContent ? `\n[Assignment/PDF Content]:\n${pdfContent}` : ''}

Student's message: ${message}

Respond as a supportive tutor at EXACTLY hint level ${hintLevel}. If referencing specific lines, format as "lines X-Y".
End with a thought-provoking question to keep them engaged.`;


        // Determine thinking level based on hint complexity
        const thinkingLevel = hintLevel >= 3 ? 'high' : 'low';

        // Get previous interaction for conversation continuity
        const prevId = sessionId ? conversationSessions.get(sessionId) : undefined;

        // Call Interactions API (per official docs)
        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: textContent,
            previous_interaction_id: prevId,
            generation_config: {
                thinking_level: thinkingLevel as 'high' | 'low',
                thinking_summaries: 'auto',
                temperature: 1.0,
            },
        });

        // Store interaction ID for conversation continuity
        if (sessionId && interaction.id) {
            conversationSessions.set(sessionId, interaction.id);
        }

        // Extract outputs per Interactions API response format
        const outputs = interaction.outputs || [];
        let responseText = '';
        let thinkingSummary = '';

        for (const output of outputs) {
            const out = output as { type?: string; text?: string; summary?: string };
            if (out.type === 'thought' && out.summary) {
                thinkingSummary = out.summary;
            } else if (out.type === 'text' && out.text) {
                responseText = out.text;
            }
        }

        // Extract line references
        const lineMatches = responseText.match(/lines?\s+(\d+)(?:\s*-\s*(\d+))?/gi);
        const highlightLines: number[] = [];
        if (lineMatches) {
            lineMatches.forEach((match) => {
                const nums = match.match(/\d+/g);
                if (nums) {
                    const start = parseInt(nums[0]);
                    const end = nums[1] ? parseInt(nums[1]) : start;
                    for (let i = start; i <= end; i++) {
                        highlightLines.push(i);
                    }
                }
            });
        }

        res.json({
            response: responseText,
            highlightLines: [...new Set(highlightLines)],
            suggestedHintLevel: Math.min(hintLevel + 1, 5),
            thinkingSummary,
            interactionId: interaction.id,
        });
    } catch (error) {
        console.error('Teaching error:', error);
        res.status(500).json({ error: 'Failed to generate response', details: String(error) });
    }
});

// =============================================================================
// STREAMING TEACHING ENDPOINT - Using Interactions API
// =============================================================================

app.post('/api/teach/stream', async (req, res) => {
    try {
        const { message, code, learningHistory, hintLevel, sessionId, pdfContent } = req.body;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const textContent = `
${TEACHING_SYSTEM_PROMPT}

Current hint level: ${hintLevel}/5
${learningHistory ? `Learning context: ${learningHistory}` : ''}

${code ? `Student's current code:\n\`\`\`\n${code}\n\`\`\`` : ''}
${pdfContent ? `\n[Assignment/PDF Content]:\n${pdfContent}` : ''}

Student's message: ${message}

Respond as a supportive tutor.`;

        const thinkingLevel = hintLevel >= 3 ? 'high' : 'low';
        const prevId = sessionId ? conversationSessions.get(sessionId) : undefined;

        // Streaming with Interactions API (per docs)
        const stream = await client.interactions.create({
            model: MODEL_NAME,
            input: textContent,
            previous_interaction_id: prevId,
            stream: true,
            generation_config: {
                thinking_level: thinkingLevel as 'high' | 'low',
                thinking_summaries: 'auto',
                temperature: 1.0,
            },
        });

        let interactionId = '';

        for await (const chunk of stream) {
            const event = chunk as { event_type?: string; delta?: { type?: string; text?: string; thought?: string }; interaction?: { id?: string; usage?: { total_tokens?: number } } };

            if (event.event_type === 'content.delta') {
                if (event.delta?.type === 'text' && event.delta?.text) {
                    res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
                } else if (event.delta?.type === 'thought' && event.delta?.thought) {
                    res.write(`data: ${JSON.stringify({ type: 'thought', content: event.delta.thought })}\n\n`);
                }
            } else if (event.event_type === 'interaction.complete') {
                interactionId = event.interaction?.id || '';
                if (sessionId && interactionId) {
                    conversationSessions.set(sessionId, interactionId);
                }
            }
        }

        res.write(`data: ${JSON.stringify({ type: 'done', interactionId })}\n\n`);
        res.end();
    } catch (error) {
        console.error('Streaming error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: String(error) })}\n\n`);
        res.end();
    }
});

// =============================================================================
// EXPLAIN IT BACK - Feynman Technique Validation
// =============================================================================

app.post('/api/explain-it-back', async (req, res) => {
    try {
        const { code, language, explanation } = req.body;

        if (!code || !explanation) {
            return res.status(400).json({ error: 'Code and explanation are required' });
        }

        const prompt = `You are an expert programming instructor validating a student's understanding.

## Task
The student has written some ${language || 'code'} and is trying to explain it to demonstrate their understanding.
Evaluate their explanation using the Feynman Technique: someone who truly understands a concept should be able to explain it simply.

## Student's Code:
\`\`\`${language || ''}
${code}
\`\`\`

## Student's Explanation:
"${explanation}"

## Evaluation Criteria:
1. **Accuracy**: Is their explanation technically correct?
2. **Completeness**: Did they cover the key concepts and logic?
3. **Clarity**: Can they explain it in simple terms?
4. **Reasoning**: Do they understand WHY the code works, not just WHAT it does?

## Response Format (JSON only):
{
    "passed": boolean,  // true if understanding is 'good' or 'excellent'
    "understanding": "excellent" | "good" | "partial" | "needs_work",
    "feedback": "Constructive feedback explaining what they got right and what to improve. Be encouraging! Use markdown formatting.",
    "conceptsCovered": ["concept1", "concept2"],  // concepts they demonstrated understanding of
    "conceptsMissed": ["concept3"],  // concepts they didn't mention or misunderstood
    "followUpQuestions": ["question1", "question2"]  // 2-3 questions to deepen understanding
}

Evaluate fairly but encouragingly. Learning is a process!`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: {
                thinking_level: 'high',
                thinking_summaries: 'auto',
                temperature: 0.7,
            },
        });

        // Extract response text
        let responseText = '';
        if (interaction.outputs) {
            for (const part of interaction.outputs) {
                if (part.type === 'text' && part.text) {
                    responseText += part.text;
                }
            }
        }

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            res.json(result);
        } else {
            // Fallback response if parsing fails
            res.json({
                passed: true,
                understanding: 'good',
                feedback: responseText || 'Good effort explaining your code! Keep practicing.',
                conceptsCovered: [],
                conceptsMissed: [],
                followUpQuestions: ['What would happen if you changed the input?']
            });
        }
    } catch (error) {
        console.error('Explain it back error:', error);
        res.status(500).json({ error: 'Failed to validate explanation' });
    }
});

// =============================================================================
// CODE REVIEW - AI-powered code review with probing questions
// =============================================================================

app.post('/api/code-review', async (req, res) => {
    try {
        const { code, language, fileName } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const prompt = `You are an expert code reviewer and programming mentor. Review the following ${language || 'code'} and provide constructive feedback with Socratic questions to help the student learn.

## Code to Review (${fileName || 'code'}):
\`\`\`${language || ''}
${code}
\`\`\`

## Review Guidelines:
1. **Be encouraging** - Focus on learning, not criticism
2. **Ask probing questions** - Help them discover issues themselves
3. **Identify specific lines** - Reference exact line numbers
4. **Cover multiple aspects**: style, logic, performance, readability, best practices

## Response Format (JSON only):
{
    "summary": "Brief 2-3 sentence overview of the code quality and main observations",
    "overallQuality": "excellent" | "good" | "needs-improvement" | "poor",
    "feedback": [
        {
            "category": "style" | "logic" | "performance" | "security" | "readability" | "best-practice",
            "severity": "info" | "suggestion" | "warning" | "critical",
            "lineStart": 1,
            "lineEnd": 1,
            "title": "Short issue title",
            "description": "What the issue/observation is",
            "question": "Socratic question to make them think about this",
            "suggestion": "Optional hint without giving the full answer"
        }
    ],
    "strengths": ["What they did well - be positive!"],
    "learningOpportunities": ["Topics they should explore to improve"]
}

Provide 3-8 feedback items covering different aspects. Be fair and constructive!`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: {
                thinking_level: 'high',
                thinking_summaries: 'auto',
                temperature: 0.7,
            },
        });

        // Extract response text
        let responseText = '';
        if (interaction.outputs) {
            for (const part of interaction.outputs) {
                if (part.type === 'text' && part.text) {
                    responseText += part.text;
                }
            }
        }

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            res.json(result);
        } else {
            // Fallback response
            res.json({
                summary: responseText || 'Review completed. Keep coding!',
                overallQuality: 'good',
                feedback: [],
                strengths: ['You wrote code!'],
                learningOpportunities: []
            });
        }
    } catch (error) {
        console.error('Code review error:', error);
        res.status(500).json({ error: 'Failed to review code' });
    }
});

// =============================================================================
// TIMER CHECK-IN - AI encouragement during Pomodoro breaks
// =============================================================================

app.post('/api/timer-checkin', async (req, res) => {
    try {
        const { sessionsCompleted, totalFocusTime, isBreakStarting } = req.body;

        const prompt = `You are a supportive study buddy for a programming student. They're using a Pomodoro timer.

Current status:
- Sessions completed today: ${sessionsCompleted}
- Total focus time: ${totalFocusTime} minutes
- ${isBreakStarting ? 'A focus session just ended, break is starting' : 'Break just ended, about to start a focus session'}

Generate a short, encouraging message (2-3 sentences max). Be friendly and motivating!
${isBreakStarting ? 'Encourage them to take a real break, stretch, hydrate.' : 'Pump them up for the next focus session.'}

Reply with ONLY the message, no JSON or formatting.`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: {
                thinking_level: 'low',
                temperature: 0.9,
            },
        });

        // Extract response text
        let message = '';
        if (interaction.outputs) {
            for (const part of interaction.outputs) {
                if (part.type === 'text' && part.text) {
                    message += part.text;
                }
            }
        }

        res.json({ message: message.trim() || 'Keep up the great work! 💪' });
    } catch (error) {
        console.error('Timer check-in error:', error);
        // Fallback messages
        const messages = [
            "You're doing great! Keep up the momentum! 🚀",
            "Every session counts. You're making progress! 💪",
            "Take a breath, you've earned this break! ☕",
            "Ready for another round of learning? Let's go! 🎯"
        ];
        res.json({ message: messages[Math.floor(Math.random() * messages.length)] });
    }
});

// TEXT-TO-SPEECH - Natural Voice Generation with ElevenLabs
// =============================================================================

// ElevenLabs API configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
console.log('🎙️ ElevenLabs TTS:', ELEVENLABS_API_KEY ? 'API key configured ✓' : '⚠️  No API key found');

// ElevenLabs voice IDs for different styles
const ELEVENLABS_VOICES: Record<string, string> = {
    tutor: 'EXAVITQu4vr4xnSDxMaL',      // Sarah - soft, warm, friendly
    helper: '21m00Tcm4TlvDq8ikWAM',      // Rachel - calm and clear
    neutral: 'ErXwobaYiN019PkySvjV',     // Antoni - professional male
    excited: 'MF3mGyEYCl7XYWbV9V6O',     // Elli - energetic female
};

app.post('/api/tts', async (req, res) => {
    console.log('📢 TTS request received');

    try {
        const { text, style = 'tutor' } = req.body;
        console.log(`   Text length: ${text?.length || 0}, Style: ${style}`);

        if (!text || typeof text !== 'string') {
            console.log('   ❌ No text provided');
            return res.status(400).json({ error: 'Text is required' });
        }

        // Limit text length to prevent very long audio generation
        const maxLength = 1000;
        const truncatedText = text.length > maxLength
            ? text.substring(0, maxLength) + '...'
            : text;

        // Check if ElevenLabs API key is available
        if (!ELEVENLABS_API_KEY) {
            console.log('   ⚠️  ElevenLabs API key not found, using fallback');
            return res.json({
                audio: null,
                fallback: true,
                message: 'ElevenLabs API key not configured'
            });
        }

        // Get voice ID for the style
        const voiceId = ELEVENLABS_VOICES[style] || ELEVENLABS_VOICES.tutor;
        console.log(`   🎤 Using voice: ${voiceId}`);

        // Call ElevenLabs API
        console.log('   📡 Calling ElevenLabs API...');
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({
                text: truncatedText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.5,
                    use_speaker_boost: true
                }
            })
        });

        console.log(`   📡 ElevenLabs response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('   ❌ ElevenLabs API error:', response.status, errorText);
            return res.json({
                audio: null,
                fallback: true,
                error: `ElevenLabs API error: ${response.status}`,
                message: 'TTS generation failed, use browser fallback'
            });
        }

        // Get audio as buffer and convert to base64
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');
        console.log(`   ✅ Audio generated: ${base64Audio.length} chars base64`);

        // Return base64 audio data
        res.json({
            audio: base64Audio,
            mimeType: 'audio/mpeg',
            fallback: false
        });

    } catch (error) {
        console.error('   ❌ TTS error:', error);
        // Return fallback signal so frontend can use browser TTS
        res.json({
            audio: null,
            fallback: true,
            error: String(error),
            message: 'TTS generation failed, use browser fallback'
        });
    }
});

// =============================================================================
// SCREEN ANALYSIS
// =============================================================================

app.post('/api/analyze-screen', async (req, res) => {
    try {
        const { screenshot } = req.body;

        if (!screenshot) {
            return res.status(400).json({ error: 'Screenshot required' });
        }

        const prompt = `Analyze this screenshot of a code editor or IDE.
Extract and return:
1. The code visible on screen (preserve formatting)
2. The programming language
3. Any error messages visible
4. Any assignment or problem description visible

Return as JSON: { "code": "...", "language": "...", "errors": [...], "assignment": "..." }`;

        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        // Use Interactions API for multimodal (per docs)
        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: [
                { type: 'text', text: prompt },
                { type: 'image', data: base64Data, mime_type: 'image/png' }
            ],
            generation_config: {
                thinking_level: 'low',
                temperature: 1.0,
            },
        });

        // Extract text from outputs
        const outputs = interaction.outputs || [];
        const textOutput = outputs.find((o: { type?: string }) => o.type === 'text') as { text?: string } | undefined;
        const text = textOutput?.text || '';

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            res.json({
                detectedCode: analysis.code || '',
                language: analysis.language || 'unknown',
                errors: analysis.errors || [],
                assignmentContext: analysis.assignment || '',
            });
        } else {
            res.json({ detectedCode: '', language: 'unknown', errors: [], assignmentContext: '' });
        }
    } catch (error) {
        console.error('Screen analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze screen' });
    }
});

// =============================================================================
// TOPIC EXTRACTION (AI-powered)
// =============================================================================

app.post('/api/extract-topics', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required' });
        }

        // For short texts, use a quick extraction
        if (text.length < 50) {
            return res.json({ topics: [] });
        }

        const prompt = `Extract the specific programming concepts and technical topics discussed in this text.

Text to analyze:
"${text.slice(0, 2000)}"

Return ONLY the topics as a JSON array of strings. Focus on:
- Programming concepts (e.g., "recursion", "closures", "async/await")
- Data structures (e.g., "linked lists", "hash maps", "trees")
- Design patterns (e.g., "observer pattern", "singleton")
- Language features (e.g., "TypeScript generics", "React hooks")
- Algorithms (e.g., "binary search", "dynamic programming")

Return format: ["topic1", "topic2", ...]
If no clear programming topics, return: []`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: { thinking_level: 'low', temperature: 0.3 },
        });

        let responseText = '';
        if (interaction.outputs) {
            for (const part of interaction.outputs) {
                if (part.type === 'text' && part.text) {
                    responseText += part.text;
                }
            }
        }

        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const topics = JSON.parse(jsonMatch[0]);
            res.json({ topics: Array.isArray(topics) ? topics : [] });
        } else {
            res.json({ topics: [] });
        }
    } catch (error) {
        console.error('Topic extraction error:', error);
        res.json({ topics: [] }); // Fail silently with empty topics
    }
});

// =============================================================================
// WEAKNESS DETECTION
// =============================================================================

app.post('/api/detect-weaknesses', async (req, res) => {
    try {
        const { sessionHistory, existingWeaknesses } = req.body;

        const prompt = `Analyze this coding session history to identify TECHNICAL CODING PATTERNS (both weaknesses and strengths).

${sessionHistory}

${existingWeaknesses?.length > 0 ? `Known weaknesses: ${existingWeaknesses.join(', ')}` : ''}

CRITICAL INSTRUCTION:
Focus ONLY on code quality, syntax, design patterns, and technical concepts (e.g., "Misuse of useEffect", "Callback hell", "Strong TypeScript typing").
DO NOT comment on the user's work habits, time management, focus, or behavioral traits.

RESOLVED WEAKNESSES:
Check the "Known weaknesses" list. If the session history shows the user is now correctly applying the concept or no longer struggling with it, add it to 'resolvedWeaknesses'.

Identify patterns where the student struggled technically AND where they showed technical proficiency.
Return JSON:
{ 
  "newWeaknesses": [], 
  "reinforcedWeaknesses": [], 
  "resolvedWeaknesses": [],
  "newStrengths": [] 
}`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: { thinking_level: 'high', temperature: 1.0 },
        });

        const outputs = interaction.outputs || [];
        const textOutput = outputs.find((o: { type?: string }) => o.type === 'text') as { text?: string } | undefined;
        const text = textOutput?.text || '';

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json({ newWeaknesses: [], reinforcedWeaknesses: [], resolvedWeaknesses: [], newStrengths: [] });
        }
    } catch (error) {
        console.error('Weakness detection error:', error);
        res.status(500).json({ error: 'Failed to detect weaknesses' });
    }
});

app.post('/api/generate-curriculum', async (req, res) => {
    try {
        const { weaknesses, level } = req.body;

        const prompt = `Create a personalized coding curriculum for a student at the "${level}" level.
Target areas for improvement: ${weaknesses.join(', ')}.

Generate a structured learning path with 3-5 modules.
Each module should have:
1. "topic": Specific concept name.
2. "description": Brief explanation of why this matters.
3. "exercises": Array of 2-3 practice problems. Each exercise needs:
    - "prompt": The coding task description.
    - "difficulty": "easy", "medium", or "hard".

Return strictly JSON format:
[
  {
    "topic": "...",
    "description": "...",
    "exercises": [
      { "prompt": "...", "difficulty": "..." }
    ]
  }
]`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: { thinking_level: 'high', temperature: 0.8 },
        });

        const outputs = interaction.outputs || [];
        const textOutput = outputs.find((o: { type?: string }) => o.type === 'text') as { text?: string } | undefined;
        const text = textOutput?.text || '';

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Curriculum generation error:', error);
        res.status(500).json({ error: 'Failed to generate curriculum' });
    }
});

// =============================================================================
// CURRICULUM GENERATION
// =============================================================================

app.post('/api/generate-curriculum', async (req, res) => {
    try {
        const { weaknesses, level } = req.body;

        const prompt = `Create a personalized learning curriculum for a ${level} programmer.
Focus on these weak areas: ${weaknesses.join(', ')}

Generate 3-5 learning modules with: topic, description, exercises array.
Return as JSON array.`;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: { thinking_level: 'high', temperature: 1.0 },
        });

        const outputs = interaction.outputs || [];
        const textOutput = outputs.find((o: { type?: string }) => o.type === 'text') as { text?: string } | undefined;
        const text = textOutput?.text || '';

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Curriculum generation error:', error);
        res.status(500).json({ error: 'Failed to generate curriculum' });
    }
});

// =============================================================================
// INTERACTIVE SHELL - Command Execution Model
// =============================================================================
// Each command is run as a separate process, output is streamed via SSE
// This is more reliable than PTY which has compatibility issues

interface ShellSession {
    cwd: string;
    clients: Set<express.Response>;
    outputBuffer: string[];
    currentProcess: ChildProcessWithoutNullStreams | null;
}

const shellSessions: Map<string, ShellSession> = new Map();

app.post('/api/shell/spawn', async (req, res) => {
    try {
        const sessionId = `shell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const userId = req.body?.userId;
        const userDir = await ensureUserWorkspace(userId);
        const cwd = req.body?.cwd || userDir;

        const session: ShellSession = {
            cwd,
            clients: new Set(),
            outputBuffer: [],
            currentProcess: null
        };
        shellSessions.set(sessionId, session);

        // Send initial prompt
        const initialMsg = `data: ${JSON.stringify({ type: 'stdout', content: `$ ` })}\n\n`;
        session.outputBuffer.push(initialMsg);

        console.log(`✅ Shell session created: ${sessionId} for user ${userId || 'shared'}`);
        res.json({ sessionId, shell: 'bash', cwd });
    } catch (error) {
        console.error('Shell spawn error:', error);
        res.status(500).json({ error: 'Failed to create shell session' });
    }
});

app.get('/api/shell/output/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = shellSessions.get(sessionId);

    if (!session) {
        console.log(`⚠️ SSE: session ${sessionId} not found`);
        return res.status(404).json({ error: 'Shell session not found' });
    }

    // Set headers for SSE - critical for keeping connection open
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Send initial comment to confirm connection
    res.write(':connected\n\n');

    // Send buffered output to late-joining client
    session.outputBuffer.forEach(msg => res.write(msg));

    // Add to clients set for future broadcasts
    session.clients.add(res);
    console.log(`📡 SSE client connected to ${sessionId}, total: ${session.clients.size}`);

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        session.clients.delete(res);
        console.log(`📴 SSE client disconnected from ${sessionId}, remaining: ${session.clients.size}`);
    });
});

app.post('/api/shell/input/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { input } = req.body;
    const session = shellSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Shell session not found' });
    }

    // Parse the command (remove trailing newline)
    const command = input.trim();

    if (!command) {
        // Empty command - just send a new prompt
        const promptMsg = `data: ${JSON.stringify({ type: 'stdout', content: '$ ' })}\n\n`;
        session.outputBuffer.push(promptMsg);
        session.clients.forEach(client => client.write(promptMsg));
        return res.json({ success: true });
    }

    // Handle cd command specially
    if (command.startsWith('cd ')) {
        const newDir = command.slice(3).trim().replace(/^~/, homedir());
        const targetPath = newDir.startsWith('/') ? newDir : join(session.cwd, newDir);
        try {
            const realPath = require('fs').realpathSync(targetPath);
            session.cwd = realPath;
            const cdMsg = `data: ${JSON.stringify({ type: 'stdout', content: `$ ` })}\n\n`;
            session.outputBuffer.push(cdMsg);
            session.clients.forEach(client => client.write(cdMsg));
        } catch (e) {
            const errorMsg = `data: ${JSON.stringify({ type: 'stderr', content: `cd: ${newDir}: No such file or directory\n$ ` })}\n\n`;
            session.outputBuffer.push(errorMsg);
            session.clients.forEach(client => client.write(errorMsg));
        }
        return res.json({ success: true });
    }

    // Execute the command
    console.log(`📟 Executing command in session ${sessionId}: ${command}`);
    const proc = spawn('bash', ['-c', command], {
        cwd: session.cwd,
        env: { ...process.env, PYTHONUNBUFFERED: '1', TERM: 'xterm-256color' }
    });

    session.currentProcess = proc;

    proc.stdout.on('data', (data) => {
        console.log(`📤 stdout from ${sessionId}: ${data.toString().trim()}, clients: ${session.clients.size}`);
        const msg = `data: ${JSON.stringify({ type: 'stdout', content: data.toString() })}\n\n`;
        session.outputBuffer.push(msg);
        if (session.outputBuffer.length > 100) session.outputBuffer.shift();
        session.clients.forEach(client => client.write(msg));
    });

    proc.stderr.on('data', (data) => {
        const msg = `data: ${JSON.stringify({ type: 'stderr', content: data.toString() })}\n\n`;
        session.outputBuffer.push(msg);
        if (session.outputBuffer.length > 100) session.outputBuffer.shift();
        session.clients.forEach(client => client.write(msg));
    });

    proc.on('close', () => {
        session.currentProcess = null;
        // Send new prompt
        const promptMsg = `data: ${JSON.stringify({ type: 'stdout', content: '$ ' })}\n\n`;
        session.outputBuffer.push(promptMsg);
        session.clients.forEach(client => client.write(promptMsg));
    });

    res.json({ success: true });
});

app.post('/api/shell/kill/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = shellSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Shell session not found' });
    }

    if (session.currentProcess) {
        session.currentProcess.kill('SIGTERM');
        session.currentProcess = null;
    }
    shellSessions.delete(sessionId);
    res.json({ success: true });
});

app.post('/api/shell/interrupt/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = shellSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Shell session not found' });
    }

    // Kill the current process if any
    if (session.currentProcess) {
        session.currentProcess.kill('SIGINT');
        session.currentProcess = null;
        const interruptMsg = `data: ${JSON.stringify({ type: 'stdout', content: '^C\n$ ' })}\n\n`;
        session.outputBuffer.push(interruptMsg);
        session.clients.forEach(client => client.write(interruptMsg));
    }
    res.json({ success: true });
});

// =============================================================================
// CODE EXECUTION
// =============================================================================

interface LanguageRunner {
    name: string;
    extensions: string[];
    checkCmd: string;
    run: (filepath: string, filename: string) => { cmd: string; args: string[] };
    compiled?: boolean;
}

const LANGUAGE_RUNNERS: LanguageRunner[] = [
    { name: 'Node.js', extensions: ['.js', '.mjs'], checkCmd: 'node --version', run: (_fp, fn) => ({ cmd: 'node', args: [fn] }) },
    { name: 'Python', extensions: ['.py'], checkCmd: 'python3 --version', run: (_fp, fn) => ({ cmd: 'python3', args: ['-u', fn] }) },
    { name: 'TypeScript', extensions: ['.ts'], checkCmd: 'npx tsx --version', run: (_fp, fn) => ({ cmd: 'npx', args: ['tsx', fn] }) },
    { name: 'GCC (C)', extensions: ['.c'], checkCmd: 'gcc --version', run: (_fp, fn) => ({ cmd: 'sh', args: ['-c', `gcc "${fn}" -o "${fn.replace('.c', '')}" && "./${fn.replace('.c', '')}"`] }), compiled: true },
    { name: 'G++ (C++)', extensions: ['.cpp', '.cc', '.cxx'], checkCmd: 'g++ --version', run: (_fp, fn) => ({ cmd: 'sh', args: ['-c', `g++ "${fn}" -o "${fn.replace(/\.(cpp|cc|cxx)$/, '')}" && "./${fn.replace(/\.(cpp|cc|cxx)$/, '')}"`] }), compiled: true },
    { name: 'Go', extensions: ['.go'], checkCmd: 'go version', run: (_fp, fn) => ({ cmd: 'go', args: ['run', fn] }) },
    { name: 'Rust', extensions: ['.rs'], checkCmd: 'rustc --version', run: (_fp, fn) => ({ cmd: 'sh', args: ['-c', `rustc "${fn}" -o "${fn.replace('.rs', '')}" && "./${fn.replace('.rs', '')}"`] }), compiled: true },
    { name: 'Java', extensions: ['.java'], checkCmd: 'java --version', run: (_fp, fn) => ({ cmd: 'java', args: [fn] }) },
    { name: 'Ruby', extensions: ['.rb'], checkCmd: 'ruby --version', run: (_fp, fn) => ({ cmd: 'ruby', args: [fn] }) },
    { name: 'PHP', extensions: ['.php'], checkCmd: 'php --version', run: (_fp, fn) => ({ cmd: 'php', args: [fn] }) },
    { name: 'Bash', extensions: ['.sh'], checkCmd: 'bash --version', run: (_fp, fn) => ({ cmd: 'bash', args: [fn] }) },
];

let availableCompilers: { name: string; version: string; extensions: string[] }[] = [];

async function detectCompilers() {
    console.log('\n🔍 Detecting installed compilers...');
    availableCompilers = [];
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    for (const runner of LANGUAGE_RUNNERS) {
        try {
            const { stdout } = await execAsync(runner.checkCmd);
            const version = stdout.trim().split('\n')[0];
            availableCompilers.push({ name: runner.name, version, extensions: runner.extensions });
            console.log(`   ✅ ${runner.name}: ${version}`);
        } catch {
            console.log(`   ❌ ${runner.name}: not found`);
        }
    }
    console.log(`\n   Total: ${availableCompilers.length} compilers available\n`);
}

function getRunnerForExtension(ext: string): LanguageRunner | undefined {
    return LANGUAGE_RUNNERS.find((r) =>
        r.extensions.includes(ext.toLowerCase()) &&
        availableCompilers.some((c) => c.name === r.name)
    );
}

app.get('/api/compilers', (_req, res) => {
    res.json({
        available: availableCompilers,
        supported: LANGUAGE_RUNNERS.map((r) => ({
            name: r.name,
            extensions: r.extensions,
            installed: availableCompilers.some((c) => c.name === r.name),
        })),
    });
});

// =============================================================================
// FILE SYSTEM API - Real FS Integration
// =============================================================================

const WORKSPACE_BASE = join(homedir(), 'CodeMentorProjects');
const PROJECT_DIR = join(WORKSPACE_BASE, 'DefaultProject'); // Legacy fallback

// Get user-specific project directory (per-user isolation)
const getUserProjectDir = (userId?: string): string => {
    if (!userId || userId === 'undefined' || userId === 'null') {
        return join(WORKSPACE_BASE, 'shared');
    }
    // Sanitize userId to prevent path traversal
    const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
    return join(WORKSPACE_BASE, safeUserId);
};

// Ensure a user's workspace exists
const ensureUserWorkspace = async (userId?: string): Promise<string> => {
    const userDir = getUserProjectDir(userId);
    await mkdir(userDir, { recursive: true });
    return userDir;
};

// Ensure default workspace exists (for backward compatibility)
(async () => {
    try {
        await mkdir(PROJECT_DIR, { recursive: true });
        console.log(`✅ Workspace directory ready: ${PROJECT_DIR}`);
    } catch (err) {
        console.error('❌ Failed to create workspace directory:', err);
    }
})();

// Helper to recursively list files
async function getFiles(dir: string, baseDir: string): Promise<any[]> {
    const dirents = await import('fs').then(fs => fs.promises.readdir(dir, { withFileTypes: true }));
    const files = await Promise.all(dirents.map((dirent) => {
        const res = join(dir, dirent.name);
        const relativePath = res.substring(baseDir.length + 1); // +1 for separator
        if (dirent.isDirectory()) {
            return getFiles(res, baseDir);
        } else {
            return {
                name: relativePath,
                path: res,
                isDirectory: false
            };
        }
    }));
    return Array.prototype.concat(...files);
}

// Get all files
app.get('/api/files', async (req, res) => {
    try {
        const userId = req.query.userId as string | undefined;
        const userDir = await ensureUserWorkspace(userId);
        const files = await getFiles(userDir, userDir);
        res.json(files);
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// Read file content
app.get('/api/files/content', async (req, res) => {
    try {
        const { path, userId } = req.query;
        if (!path || typeof path !== 'string') {
            return res.status(400).json({ error: 'Path is required' });
        }

        const userDir = await ensureUserWorkspace(userId as string | undefined);

        // Security check: prevent traversal out of user's project dir
        const fullPath = join(userDir, path);
        if (!fullPath.startsWith(userDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const content = await import('fs').then(fs => fs.promises.readFile(fullPath, 'utf-8'));
        res.json({ content });
    } catch (error) {
        console.error('Read file error:', error);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

// Write/Create file
app.post('/api/files', async (req, res) => {
    try {
        const { path, content, userId } = req.body;
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const userDir = await ensureUserWorkspace(userId);

        const fullPath = join(userDir, path);
        if (!fullPath.startsWith(userDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Ensure parent directory exists
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (parentDir) {
            await mkdir(parentDir, { recursive: true });
        }

        await writeFile(fullPath, content || '', 'utf-8');
        res.json({ success: true });
    } catch (error) {
        console.error('Write file error:', error);
        res.status(500).json({ error: 'Failed to write file' });
    }
});

// Delete file
app.delete('/api/files', async (req, res) => {
    try {
        const { path, userId } = req.query;
        if (!path || typeof path !== 'string') {
            return res.status(400).json({ error: 'Path is required' });
        }

        const userDir = await ensureUserWorkspace(userId as string | undefined);

        const fullPath = join(userDir, path);
        if (!fullPath.startsWith(userDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await unlink(fullPath);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

app.post('/api/execute', async (req, res) => {
    const { code, filename, additionalFiles } = req.body;

    if (!code || !filename) {
        return res.status(400).json({ error: 'Code and filename are required' });
    }

    const ext = '.' + filename.split('.').pop()?.toLowerCase();
    const runner = getRunnerForExtension(ext);

    if (!runner) {
        const supported = LANGUAGE_RUNNERS.find((r) => r.extensions.includes(ext));
        if (supported) {
            return res.status(400).json({ error: `${supported.name} is not installed` });
        }
        return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    const tempDir = join(tmpdir(), 'codementor_exec');
    const tempFile = join(tempDir, filename);

    try {
        await mkdir(tempDir, { recursive: true });

        // Write the main code file
        await writeFile(tempFile, code, 'utf-8');

        // Write additional files (like data files referenced by the code)
        if (additionalFiles && Array.isArray(additionalFiles)) {
            console.log(`   📦 Received ${additionalFiles.length} additional file(s)`);
            for (const file of additionalFiles) {
                if (file.name && file.content !== undefined) {
                    const additionalPath = join(tempDir, file.name);
                    // Create subdirectories if needed
                    const dir = additionalPath.substring(0, additionalPath.lastIndexOf('/'));
                    if (dir && dir !== tempDir) {
                        await mkdir(dir, { recursive: true });
                    }
                    await writeFile(additionalPath, file.content, 'utf-8');
                    console.log(`   📄 Wrote: ${file.name} (${file.content.length} bytes)`);
                }
            }
        } else {
            console.log(`   📦 No additional files received`);
        }

        const { cmd, args } = runner.run(tempFile, filename);
        console.log(`\n▶️  Executing: ${cmd} ${args.join(' ')}`);
        console.log(`   📁 Working directory: ${tempDir}`);

        const startTime = Date.now();
        const TIMEOUT_MS = 30000;

        const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
            let stdout = '', stderr = '';
            let killed = false;

            const child = spawn(cmd, args, {
                cwd: tempDir,
                env: { ...process.env, TERM: 'xterm-256color' },
                shell: false,
            });

            const timeout = setTimeout(() => {
                killed = true;
                child.kill('SIGKILL');
                resolve({ stdout, stderr: stderr + '\n⏱️ Timeout after 30s', exitCode: 124 });
            }, TIMEOUT_MS);

            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });
            child.on('close', (exitCode) => {
                if (!killed) { clearTimeout(timeout); resolve({ stdout, stderr, exitCode: exitCode ?? 0 }); }
            });
            child.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: 1 });
            });
        });

        console.log(`   ✅ Completed in ${Date.now() - startTime}ms (exit: ${result.exitCode})`);

        res.json({
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            executionTime: Date.now() - startTime,
            language: runner.name,
        });

        unlink(tempFile).catch(() => { });
    } catch (error) {
        console.error('Execution error:', error);
        res.status(500).json({ error: 'Failed to execute code' });
        unlink(tempFile).catch(() => { });
    }
});

// =============================================================================
// EXERCISE GENERATION - LeetCode-style practice problems
// =============================================================================

app.post('/api/generate-exercise', async (req, res) => {
    try {
        const { topic, difficulty, weaknessContext, language, userCodeSamples } = req.body;

        if (!topic) {
            return res.status(400).json({ error: 'Topic is required' });
        }

        const targetLang = language || 'javascript';
        const diffLevel = difficulty || 'medium';

        // Build personalization context from user's code
        const personalizationSection = userCodeSamples ? `

## Student's Recent Code (for personalization)
Analyze this code to understand the student's coding style, common patterns, and potential areas for improvement:
\`\`\`
${userCodeSamples.slice(0, 2000)}
\`\`\`

Use this information to:
- Match the exercise style to their coding level
- Address patterns or anti-patterns you observe
- Create test cases that challenge their specific habits
` : '';

        const isCompiledLang = ['cpp', 'c', 'c++', 'java', 'go'].includes(targetLang.toLowerCase());

        const prompt = `You are an expert programming instructor creating a LeetCode-style coding exercise.

## Task
Create a coding exercise specifically designed to help a student overcome their weakness in: "${topic}"

${weaknessContext ? `Additional context about the student's struggle: ${weaknessContext}` : ''}
${personalizationSection}

## Requirements
1. The problem should be practical and directly address the weakness
2. Difficulty level: ${diffLevel}
3. Target language: ${targetLang}
4. Include 4-6 test cases (mix of visible and hidden)
5. ${userCodeSamples ? "Tailor the exercise to match the student's apparent skill level from their code" : 'Assume intermediate skill level'}
${isCompiledLang ? `6. **CRITICAL FOR ${targetLang.toUpperCase()}**: The starter code MUST be a COMPLETE PROGRAM with main().
   - The program reads input from stdin (e.g., cin >> for C++, scanf for C)
   - The program prints output to stdout (e.g., cout << for C++, printf for C)
   - Test input will be passed via stdin, output captured from stdout` : `6. **CRITICAL**: The starter code MUST define a function named exactly \`solution\`. This is required for automated testing.`}

## Response Format (JSON only):
{
    "title": "Short descriptive title",
    "description": "Full problem description in markdown. Include:\n- Problem statement\n- Input/output format\n- Constraints\n- 1-2 examples with explanations",
    "starterCode": "${isCompiledLang ? 'Complete program with main() that reads from stdin and prints to stdout' : "MUST contain a function named 'solution'"}",
    "testCases": [
        {
            "input": "MUST be valid JSON. Use null (not None), true/false (not True/False), double quotes for strings.",
            "expectedOutput": "MUST be valid JSON. Same rules apply.",
            "isHidden": false,
            "explanation": "Brief explanation of this test case"
        }
    ],
    "hints": [
        { "level": 1, "content": "Very vague conceptual hint" },
        { "level": 2, "content": "More specific directional hint" },
        { "level": 3, "content": "Detailed approach hint with pseudocode" }
    ],
    "solutionApproach": "Brief explanation of the optimal approach (for grading purposes)",
    "timeComplexity": "Expected time complexity",
    "spaceComplexity": "Expected space complexity"
}

Make the first 2-3 test cases visible (isHidden: false) and the rest hidden (isHidden: true).
Ensure test cases cover edge cases and the core concept being tested.

CRITICAL VALIDATION RULES:
1. ${isCompiledLang ? 'Program MUST have main() and use stdin/stdout' : 'Function MUST be named `solution`'}
2. All test inputs/outputs MUST be valid JSON
3. Use \`null\` NOT \`None\`
4. Use \`true\`/\`false\` NOT \`True\`/\`False\`
5. Use double quotes for strings: \`"text"\` NOT \`'text'\``;

        const interaction = await client.interactions.create({
            model: MODEL_NAME,
            input: prompt,
            generation_config: {
                thinking_level: 'high',
                temperature: 0.8,
            },
        });

        // Extract response text
        let responseText = '';
        if (interaction.outputs) {
            for (const part of interaction.outputs) {
                if (part.type === 'text' && part.text) {
                    responseText += part.text;
                }
            }
        }

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const exercise = JSON.parse(jsonMatch[0]);
            // Add metadata
            exercise.id = `exercise_${Date.now()}`;
            exercise.topic = topic;
            exercise.difficulty = diffLevel;
            exercise.language = targetLang;
            exercise.createdAt = new Date().toISOString();
            res.json(exercise);
        } else {
            console.error('Failed to parse exercise JSON:', responseText);
            res.status(500).json({ error: 'Failed to generate exercise - invalid response format' });
        }
    } catch (error) {
        console.error('Exercise generation error:', error);
        res.status(500).json({ error: 'Failed to generate exercise' });
    }
});

// =============================================================================
// CHAT HISTORY API
// =============================================================================

// Get chat history for a user
app.get('/api/chat-history', async (req, res) => {
    try {
        const userId = req.query.userId as string;
        const userDir = await ensureUserWorkspace(userId);
        const historyFile = join(userDir, 'chat_history.json');

        try {
            const content = await import('fs').then(fs => fs.promises.readFile(historyFile, 'utf-8'));
            res.json(JSON.parse(content));
        } catch (error: any) {
            // If file doesn't exist, return empty array
            if (error.code === 'ENOENT') {
                res.json([]);
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Get chat history error:', error);
        res.status(500).json({ error: 'Failed to get chat history' });
    }
});

// Save chat message
app.post('/api/chat-history', async (req, res) => {
    try {
        const { userId, message } = req.body; // message is type Interaction
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const userDir = await ensureUserWorkspace(userId);
        const historyFile = join(userDir, 'chat_history.json');

        // Read existing history
        let history: any[] = [];
        try {
            const content = await import('fs').then(fs => fs.promises.readFile(historyFile, 'utf-8'));
            history = JSON.parse(content);
        } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
        }

        // Append new message
        history.push(message);

        // Keep last 100 messages to avoid indefinite growth
        if (history.length > 100) {
            history = history.slice(history.length - 100);
        }

        await writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (error) {
        console.error('Save chat history error:', error);
        res.status(500).json({ error: 'Failed to save chat history' });
    }
});

app.post('/api/validate-exercise', async (req, res) => {
    try {
        const { code, testCases, language, exerciseId } = req.body;

        if (!code || !testCases || !Array.isArray(testCases)) {
            return res.status(400).json({ error: 'Code and testCases are required' });
        }

        const results: Array<{
            testCaseId: number;
            input: string;
            expectedOutput: string;
            actualOutput: string;
            passed: boolean;
            error?: string;
            isHidden: boolean;
        }> = [];

        // Run each test case
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];

            // Get language configuration - try registry first, then AI fallback
            const lang = language || 'javascript';
            let config = getLanguageConfig(lang);

            // If language not in registry, use AI to generate config
            if (!config) {
                config = await generateLanguageConfigWithAI(lang);
            }

            // Normalize inputs to strings (AI sometimes returns objects/arrays instead of JSON strings)
            const inputStr = typeof testCase.input === 'string' ? testCase.input : JSON.stringify(testCase.input);
            const expectedStr = typeof testCase.expectedOutput === 'string' ? testCase.expectedOutput : JSON.stringify(testCase.expectedOutput);

            // Build wrapper code using template substitution
            // For compiled languages with usesStdin=true, the template is just {CODE}
            // and input is passed via stdin at runtime
            const inputEscaped = inputStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
            const wrapperCode = config.wrapperTemplate
                .replace('{CODE}', code)
                .replace(/{INPUT}/g, inputStr)
                .replace(/{INPUT_ESCAPED}/g, inputEscaped);

            // Debug logging
            console.log(`[Validation] Running test ${i + 1} for ${lang}:`, { input: testCase.input, expected: testCase.expectedOutput });

            // Execute the code
            try {
                const tempFile = join(tmpdir(), `exercise_${exerciseId || Date.now()}_test${i}${config.extension}`);
                await writeFile(tempFile, wrapperCode);

                let execResult: { stdout: string; stderr: string; exitCode: number };

                if (config.interpreted) {
                    // Interpreted language: run directly
                    const runnerParts = config.runner.split(' ');
                    const runnerCmd = runnerParts[0];
                    const runnerArgs = [...runnerParts.slice(1), tempFile];

                    execResult = await new Promise((resolve) => {
                        let stdout = '';
                        let stderr = '';
                        const child = spawn(runnerCmd, runnerArgs, { timeout: 10000, shell: config.runner.includes(' ') });

                        child.stdout.on('data', (data) => { stdout += data.toString(); });
                        child.stderr.on('data', (data) => { stderr += data.toString(); });
                        child.on('close', (exitCode) => {
                            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 0 });
                        });
                        child.on('error', (err) => {
                            resolve({ stdout: '', stderr: err.message, exitCode: 1 });
                        });
                    });
                } else {
                    // Compiled language: compile first, then run
                    const binaryFile = tempFile.replace(config.extension, '');

                    // Compile
                    const compileResult = await new Promise<{ stderr: string; exitCode: number }>((resolve) => {
                        let stderr = '';
                        const compileArgs = [...(config.compileArgs || []), '-o', binaryFile, tempFile];
                        const child = spawn(config.compiler!, compileArgs, { timeout: 30000 });

                        child.stderr.on('data', (data) => { stderr += data.toString(); });
                        child.on('close', (exitCode) => {
                            resolve({ stderr: stderr.trim(), exitCode: exitCode ?? 0 });
                        });
                        child.on('error', (err) => {
                            resolve({ stderr: err.message, exitCode: 1 });
                        });
                    });

                    if (compileResult.exitCode !== 0) {
                        execResult = { stdout: '', stderr: `Compilation error: ${compileResult.stderr}`, exitCode: 1 };
                    } else {
                        // Run compiled binary, passing input via stdin if usesStdin
                        execResult = await new Promise((resolve) => {
                            let stdout = '';
                            let stderr = '';
                            const child = spawn(binaryFile, [], { timeout: 10000 });

                            // If language uses stdin, pipe the input
                            if (config.usesStdin) {
                                child.stdin.write(inputStr + '\n');
                                child.stdin.end();
                            }

                            child.stdout.on('data', (data) => { stdout += data.toString(); });
                            child.stderr.on('data', (data) => { stderr += data.toString(); });
                            child.on('close', (exitCode) => {
                                resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 0 });
                            });
                            child.on('error', (err) => {
                                resolve({ stdout: '', stderr: err.message, exitCode: 1 });
                            });
                        });

                        // Cleanup binary
                        await unlink(binaryFile).catch(() => { });
                    }
                }

                const result = execResult;
                await unlink(tempFile).catch(() => { });

                const actualOutput = result.stdout.trim();
                const expectedOutput = expectedStr.trim();
                const passed = actualOutput === expectedOutput ||
                    // Try parsing as JSON for comparison
                    ((() => {
                        try {
                            return JSON.stringify(JSON.parse(actualOutput)) === JSON.stringify(JSON.parse(expectedOutput));
                        } catch {
                            return false;
                        }
                    })());

                results.push({
                    testCaseId: i,
                    input: inputStr,
                    expectedOutput,
                    actualOutput: result.stderr ? `Error: ${result.stderr}` : actualOutput,
                    passed,
                    error: result.stderr || undefined,
                    isHidden: testCase.isHidden || false,
                });
            } catch (execError) {
                results.push({
                    testCaseId: i,
                    input: testCase.input,
                    expectedOutput: testCase.expectedOutput,
                    actualOutput: '',
                    passed: false,
                    error: execError instanceof Error ? execError.message : 'Execution failed',
                    isHidden: testCase.isHidden || false,
                });
            }
        }

        const passedCount = results.filter(r => r.passed).length;
        const allPassed = passedCount === results.length;

        // Generate AI feedback if not all tests passed
        let feedback = '';
        if (!allPassed && results.some(r => !r.passed && !r.isHidden)) {
            const failedTests = results.filter(r => !r.passed && !r.isHidden);
            const feedbackPrompt = `A student's code failed some test cases. Provide brief, encouraging feedback without giving away the solution.

Failed test cases:
${failedTests.map(t => `- Input: ${t.input}, Expected: ${t.expectedOutput}, Got: ${t.actualOutput}${t.error ? ` (Error: ${t.error})` : ''}`).join('\n')}

Give 1-2 sentences of guidance to help them debug.`;

            try {
                const feedbackInteraction = await client.interactions.create({
                    model: MODEL_NAME,
                    input: feedbackPrompt,
                    generation_config: { thinking_level: 'low', temperature: 0.7 },
                });

                if (feedbackInteraction.outputs) {
                    for (const part of feedbackInteraction.outputs) {
                        if (part.type === 'text' && part.text) {
                            feedback = part.text;
                        }
                    }
                }
            } catch {
                feedback = 'Some test cases failed. Check your logic and try again!';
            }
        } else if (allPassed) {
            feedback = '🎉 All test cases passed! Great job!';
        }

        res.json({
            results: results.map(r => r.isHidden ? { ...r, input: '[Hidden]', expectedOutput: '[Hidden]' } : r),
            passedCount,
            totalCount: results.length,
            allPassed,
            feedback,
            score: Math.round((passedCount / results.length) * 100),
        });
    } catch (error) {
        console.error('Exercise validation error:', error);
        res.status(500).json({ error: 'Failed to validate exercise' });
    }
});

// =============================================================================
// START SERVER
// =============================================================================


app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`\n🚀 CodeMentor API Server running on http://0.0.0.0:${PORT}`);
    console.log(`   API Key: ${GEMINI_API_KEY.slice(0, 8)}...${GEMINI_API_KEY.slice(-4)}`);
    console.log(`   Model: ${MODEL_NAME} (Gemini 3 Interactions API)`);

    await detectCompilers();

    console.log(`📚 Endpoints:`);
    console.log(`   POST /api/teach               - Teaching response`);
    console.log(`   POST /api/teach/stream        - Streaming (SSE)`);
    console.log(`   POST /api/analyze-screen      - Screenshot analysis`);
    console.log(`   POST /api/shell/spawn         - Start shell`);
    console.log(`   GET  /api/shell/output/:id    - Stream shell output`);
    console.log(`   POST /api/shell/input/:id     - Send to shell`);
    console.log(`   POST /api/execute             - Run code\n`);
});
