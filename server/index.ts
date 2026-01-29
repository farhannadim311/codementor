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
        const cwd = req.body?.cwd || PROJECT_DIR;

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

        console.log(`✅ Shell session created: ${sessionId}`);
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
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
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
const PROJECT_DIR = join(WORKSPACE_BASE, 'DefaultProject');

// Ensure workspace exists
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
        const files = await getFiles(PROJECT_DIR, PROJECT_DIR);
        res.json(files);
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// Read file content
app.get('/api/files/content', async (req, res) => {
    try {
        const { path } = req.query;
        if (!path || typeof path !== 'string') {
            return res.status(400).json({ error: 'Path is required' });
        }

        // Security check: prevent traversal out of project dir
        const fullPath = join(PROJECT_DIR, path);
        if (!fullPath.startsWith(PROJECT_DIR)) {
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
        const { path, content } = req.body;
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const fullPath = join(PROJECT_DIR, path);
        if (!fullPath.startsWith(PROJECT_DIR)) {
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
        const { path } = req.query;
        if (!path || typeof path !== 'string') {
            return res.status(400).json({ error: 'Path is required' });
        }

        const fullPath = join(PROJECT_DIR, path);
        if (!fullPath.startsWith(PROJECT_DIR)) {
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
// START SERVER
// =============================================================================

app.listen(PORT, async () => {
    console.log(`\n🚀 CodeMentor API Server running on http://localhost:${PORT}`);
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
