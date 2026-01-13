// Express Backend Server - Secure API Proxy
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Large limit for screenshots

// Validate API key is configured
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables!');
    console.error('   Create a .env file with: GEMINI_API_KEY=your_key_here');
    process.exit(1);
}

// Initialize new Gemini SDK
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Model to use
const MODEL_NAME = 'gemini-3-pro-preview';

// Teaching system prompt
const TEACHING_SYSTEM_PROMPT = `You are CodeMentor, an expert programming tutor who uses the Socratic method.
Your core principles:
1. NEVER give direct answers or complete code solutions
2. Guide students to discover answers themselves through questions
3. Provide hints that increase in specificity based on the hint level (1-5)
4. Celebrate small victories and encourage persistence
5. If you see errors in their code, ask questions that lead them to find the error
6. Use analogies and real-world examples to explain concepts

Hint Levels:
- Level 1: Very vague conceptual hint
- Level 2: Point toward the right direction
- Level 3: Identify the specific area to focus on
- Level 4: Explain the concept needed with pseudocode
- Level 5: Walk through the logic step by step (still no direct code)

Remember: Your goal is to build understanding, not to solve problems for them.`;

// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'CodeMentor API is running' });
});

// Teaching response endpoint
app.post('/api/teach', async (req, res) => {
    try {
        const { message, code, learningHistory, hintLevel } = req.body;

        const prompt = `
${TEACHING_SYSTEM_PROMPT}

Current hint level: ${hintLevel}/5
${learningHistory ? `Learning context: ${learningHistory}` : ''}

${code ? `Student's current code:\n\`\`\`\n${code}\n\`\`\`` : ''}

Student's message: ${message}

Respond as a supportive tutor. If referencing specific lines, format as "lines X-Y".
End with a thought-provoking question to keep them engaged.`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        const text = response.text || '';

        // Extract line references
        const lineMatches = text.match(/lines?\s+(\d+)(?:\s*-\s*(\d+))?/gi);
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

        // Suggest next hint level
        const suggestedHintLevel = Math.min(hintLevel + 1, 5);

        res.json({
            response: text,
            highlightLines: [...new Set(highlightLines)],
            suggestedHintLevel,
        });
    } catch (error) {
        console.error('Teaching error:', error);
        res.status(500).json({ error: 'Failed to generate response' });
    }
});

// Screen analysis endpoint
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

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                prompt,
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: screenshot.replace(/^data:image\/\w+;base64,/, ''),
                    },
                },
            ],
        });

        const text = response.text || '';

        // Try to parse JSON from response
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
            res.json({
                detectedCode: '',
                language: 'unknown',
                errors: [],
                assignmentContext: '',
            });
        }
    } catch (error) {
        console.error('Screen analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze screen' });
    }
});

// Weakness detection endpoint
app.post('/api/detect-weaknesses', async (req, res) => {
    try {
        const { sessionHistory, existingWeaknesses } = req.body;

        const prompt = `Analyze this coding session history to identify learning weaknesses:

${sessionHistory}

${existingWeaknesses?.length > 0 ? `Known weaknesses: ${existingWeaknesses.join(', ')}` : ''}

Identify patterns where the student struggled. Return JSON:
{
  "newWeaknesses": ["topic1", "topic2"],
  "reinforcedWeaknesses": ["existing topic that appeared again"],
  "resolvedWeaknesses": ["topic they seem to have mastered"]
}`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        const text = response.text || '';

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json({ newWeaknesses: [], reinforcedWeaknesses: [], resolvedWeaknesses: [] });
        }
    } catch (error) {
        console.error('Weakness detection error:', error);
        res.status(500).json({ error: 'Failed to detect weaknesses' });
    }
});

// Curriculum generation endpoint
app.post('/api/generate-curriculum', async (req, res) => {
    try {
        const { weaknesses, level } = req.body;

        const prompt = `Create a personalized learning curriculum for a ${level} programmer.
Focus on these weak areas: ${weaknesses.join(', ')}

Generate 3-5 learning modules. Each module should have:
- topic: the concept to learn
- description: brief explanation
- exercises: array of 2-3 practice problems with difficulty (easy/medium/hard)

Return as JSON array of modules.`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        const text = response.text || '';

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

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 CodeMentor API Server running on http://localhost:${PORT}`);
    console.log(`   API Key: ${GEMINI_API_KEY.slice(0, 8)}...${GEMINI_API_KEY.slice(-4)}`);
    console.log(`   Model: ${MODEL_NAME}`);
    console.log(`\n📚 Endpoints:`);
    console.log(`   GET  /api/health           - Health check`);
    console.log(`   POST /api/teach            - Get teaching response`);
    console.log(`   POST /api/analyze-screen   - Analyze screenshot`);
    console.log(`   POST /api/detect-weaknesses - Detect learning gaps`);
    console.log(`   POST /api/generate-curriculum - Generate learning path\n`);
});
