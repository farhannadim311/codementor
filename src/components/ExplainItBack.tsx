// ExplainItBack Component - Validates student understanding using Feynman technique
import { useState, useMemo, useEffect, useRef } from 'react';
import { Brain, CheckCircle, Loader, RefreshCw, FileCode, ChevronDown, Volume2, Mic, MicOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useVoiceSettings } from '../contexts/VoiceSettingsContext';
import { speak, stop } from '../services/voiceService';
import './ExplainItBack.css';

interface FileItem {
    id: string;
    name: string;
    content: string;
    type?: 'code' | 'output' | 'pdf' | 'image';
    language: string;
}

interface CodeScope {
    name: string;
    type: 'file' | 'function' | 'class';
    code: string;
    startLine?: number;
    endLine?: number;
}

interface ExplainItBackProps {
    isOpen: boolean;
    onClose: () => void;
    code: string;
    language: string;
    files?: FileItem[];
    activeFileId?: string;
    onValidationComplete?: (passed: boolean, feedback: string) => void;
    onAskAboutConcept?: (concept: string) => void;
}

interface ValidationResult {
    passed: boolean;
    understanding: 'excellent' | 'good' | 'partial' | 'needs_work';
    feedback: string;
    followUpQuestions?: string[];
    conceptsCovered?: string[];
    conceptsMissed?: string[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Extract functions and classes from code
const extractCodeScopes = (code: string, fileName: string): CodeScope[] => {
    const scopes: CodeScope[] = [
        { name: `Entire File: ${fileName}`, type: 'file', code }
    ];

    // Extract functions (JS/TS/Python style)
    const functionPatterns = [
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g,
        /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
        /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
        /def\s+(\w+)\s*\([^)]*\)\s*:/g, // Python
    ];

    functionPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(code)) !== null) {
            const funcName = match[1];
            // Extract function body (simplified - just get name and surrounding context)
            const startIndex = match.index;
            const contextStart = Math.max(0, startIndex - 50);
            const contextEnd = Math.min(code.length, startIndex + 500);
            scopes.push({
                name: `Function: ${funcName}()`,
                type: 'function',
                code: code.substring(contextStart, contextEnd) + (contextEnd < code.length ? '\n...' : '')
            });
        }
    });

    // Extract classes
    const classPattern = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/g;
    let classMatch;
    while ((classMatch = classPattern.exec(code)) !== null) {
        const className = classMatch[1];
        const startIndex = classMatch.index;
        const contextEnd = Math.min(code.length, startIndex + 800);
        scopes.push({
            name: `Class: ${className}`,
            type: 'class',
            code: code.substring(startIndex, contextEnd) + (contextEnd < code.length ? '\n...' : '')
        });
    }

    return scopes;
};

export const ExplainItBack: React.FC<ExplainItBackProps> = ({
    isOpen,
    onClose,
    code,
    language,
    files = [],
    activeFileId,
    onValidationComplete,
}) => {
    const [explanation, setExplanation] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [phase, setPhase] = useState<'explain' | 'result'>('explain');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const { voiceEnabled } = useVoiceSettings();

    // Voice input state
    const [isListening, setIsListening] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const recognitionRef = useRef<any>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationRef = useRef<number | null>(null);

    // Initialize speech recognition
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognitionClass =
                (window as any).webkitSpeechRecognition ||
                (window as any).SpeechRecognition;

            recognitionRef.current = new SpeechRecognitionClass();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event: any) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                // Append to existing explanation
                setExplanation(prev => {
                    const separator = prev && !prev.endsWith(' ') ? ' ' : '';
                    return prev + separator + transcript;
                });
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                if (isListening) {
                    // Restart if still supposed to be listening
                    recognitionRef.current?.start();
                }
            };
        }

        return () => {
            stopListening();
        };
    }, [isListening]);

    const startListening = async () => {
        if (!recognitionRef.current) {
            alert('Speech recognition not supported in this browser');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            // Visualize audio level
            const updateLevel = () => {
                if (!analyserRef.current) return;
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setAudioLevel(average / 255);
                animationRef.current = requestAnimationFrame(updateLevel);
            };
            updateLevel();

            recognitionRef.current.start();
            setIsListening(true);
        } catch (error) {
            console.error('Failed to start microphone:', error);
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        setIsListening(false);
        setAudioLevel(0);
    };

    // File and scope selection
    const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || '');
    const [selectedScopeIndex, setSelectedScopeIndex] = useState<number>(0);

    // Update selected file when activeFileId changes
    useEffect(() => {
        if (activeFileId && isOpen) {
            setSelectedFileId(activeFileId);
            setSelectedScopeIndex(0);
        }
    }, [activeFileId, isOpen]);

    // Get code files only
    const codeFiles = useMemo(() => files.filter(f => f.type === 'code'), [files]);

    // Get selected file
    const selectedFile = useMemo(() =>
        codeFiles.find(f => f.id === selectedFileId) || codeFiles[0],
        [codeFiles, selectedFileId]);

    // Extract scopes from selected file
    const scopes = useMemo(() => {
        if (!selectedFile) return [];
        return extractCodeScopes(selectedFile.content, selectedFile.name);
    }, [selectedFile]);

    // Get the code to explain based on selection
    const codeToExplain = useMemo(() => {
        if (scopes.length === 0) return code;
        return scopes[selectedScopeIndex]?.code || code;
    }, [scopes, selectedScopeIndex, code]);

    const currentLanguage = selectedFile?.language || language;

    const handleSubmit = async () => {
        if (!explanation.trim()) return;

        setIsValidating(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/explain-it-back`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: codeToExplain,
                    language: currentLanguage,
                    explanation: explanation.trim(),
                }),
            });

            if (!response.ok) {
                throw new Error('Validation failed');
            }

            const validationResult: ValidationResult = await response.json();
            setResult(validationResult);
            setPhase('result');
            onValidationComplete?.(validationResult.passed, validationResult.feedback);
        } catch (error) {
            console.error('Explain it back error:', error);
            setResult({
                passed: false,
                understanding: 'needs_work',
                feedback: 'Failed to validate your explanation. Please try again.',
            });
            setPhase('result');
        } finally {
            setIsValidating(false);
        }
    };

    const handleTryAgain = () => {
        setResult(null);
        setPhase('explain');
    };

    const handleClose = () => {
        setExplanation('');
        setResult(null);
        setPhase('explain');
        stop();
        onClose();
    };

    const handleReadFeedback = async () => {
        if (!result) return;
        setIsSpeaking(true);

        // Build text to speak
        let textToSpeak = result.passed ? 'Great job! ' : 'Keep learning! ';
        textToSpeak += result.feedback;

        if (result.conceptsCovered && result.conceptsCovered.length > 0) {
            textToSpeak += ' Concepts you demonstrated: ' + result.conceptsCovered.join(', ') + '.';
        }

        try {
            await speak(textToSpeak, 'tutor', true);
        } finally {
            setIsSpeaking(false);
        }
    };

    if (!isOpen) return null;

    const getUnderstandingColor = (level: ValidationResult['understanding']) => {
        switch (level) {
            case 'excellent': return 'var(--accent-success)';
            case 'good': return 'var(--accent-primary)';
            case 'partial': return 'var(--accent-warning)';
            case 'needs_work': return 'var(--accent-error)';
        }
    };

    const getUnderstandingEmoji = (level: ValidationResult['understanding']) => {
        switch (level) {
            case 'excellent': return '🌟';
            case 'good': return '👍';
            case 'partial': return '🤔';
            case 'needs_work': return '💪';
        }
    };

    return (
        <div className="explain-it-back-overlay" onClick={handleClose}>
            <div className="explain-it-back-modal" onClick={(e) => e.stopPropagation()}>
                <div className="explain-it-back-header">
                    <Brain size={24} />
                    <h2>Explain It Back</h2>
                    <button className="close-btn" onClick={handleClose}>×</button>
                </div>

                {phase === 'explain' && (
                    <div className="explain-phase">
                        <div className="prompt-section">
                            <p className="prompt-text">
                                🎓 <strong>Teaching is the best way to learn!</strong>
                            </p>
                            <p className="prompt-subtext">
                                Explain your code as if teaching it to someone new to programming.
                                Cover what it does, why you made your design choices, and how the key parts work.
                            </p>
                        </div>

                        {/* File and Scope Selectors */}
                        {codeFiles.length > 0 && (
                            <div className="selector-section">
                                <div className="selector-row">
                                    <div className="selector-group">
                                        <label><FileCode size={14} /> Select File:</label>
                                        <select
                                            value={selectedFileId}
                                            onChange={(e) => {
                                                setSelectedFileId(e.target.value);
                                                setSelectedScopeIndex(0);
                                            }}
                                            className="file-select"
                                        >
                                            {codeFiles.map(file => (
                                                <option key={file.id} value={file.id}>
                                                    {file.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {scopes.length > 1 && (
                                        <div className="selector-group">
                                            <label><ChevronDown size={14} /> Explain:</label>
                                            <select
                                                value={selectedScopeIndex}
                                                onChange={(e) => setSelectedScopeIndex(Number(e.target.value))}
                                                className="scope-select"
                                            >
                                                {scopes.map((scope, index) => (
                                                    <option key={index} value={index}>
                                                        {scope.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="code-preview">
                            <div className="code-label">
                                {scopes[selectedScopeIndex]?.name || `Your code (${currentLanguage})`}
                            </div>
                            <pre><code>{codeToExplain.substring(0, 600)}{codeToExplain.length > 600 ? '...' : ''}</code></pre>
                        </div>

                        <div className="explanation-input-container">
                            <textarea
                                className="explanation-input"
                                placeholder="Type or speak your explanation here... 

For example:
- What does this code do overall?
- How does each part contribute to the solution?
- Why did you choose this approach?"
                                value={explanation}
                                onChange={(e) => setExplanation(e.target.value)}
                                rows={8}
                                disabled={isValidating}
                            />
                            <button
                                className={`voice-input-btn ${isListening ? 'listening' : ''}`}
                                onClick={isListening ? stopListening : startListening}
                                disabled={isValidating}
                                title={isListening ? 'Stop listening' : 'Speak your explanation'}
                                style={{
                                    transform: isListening ? `scale(${1 + audioLevel * 0.3})` : 'scale(1)',
                                }}
                            >
                                {isListening ? <Mic size={20} /> : <MicOff size={20} />}
                            </button>
                            {isListening && (
                                <div className="listening-indicator">
                                    <span className="pulse-dot" />
                                    Listening... (click mic to stop)
                                </div>
                            )}
                        </div>

                        <div className="action-buttons">
                            <button
                                className="submit-btn"
                                onClick={handleSubmit}
                                disabled={!explanation.trim() || isValidating}
                            >
                                {isValidating ? (
                                    <>
                                        <Loader size={18} className="spinning" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={18} />
                                        Check My Understanding
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {phase === 'result' && result && (
                    <div className="result-phase">
                        <div
                            className="understanding-badge"
                            style={{ borderColor: getUnderstandingColor(result.understanding) }}
                        >
                            <span className="emoji">{getUnderstandingEmoji(result.understanding)}</span>
                            <span
                                className="level"
                                style={{ color: getUnderstandingColor(result.understanding) }}
                            >
                                {result.understanding.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>

                        <div className="feedback-section">
                            <h3>{result.passed ? '✅ Great Job!' : '📚 Keep Learning!'}</h3>
                            <div className="feedback-content">
                                <ReactMarkdown>{result.feedback}</ReactMarkdown>
                            </div>
                            <button
                                className="read-aloud-btn"
                                onClick={handleReadFeedback}
                                disabled={isSpeaking}
                            >
                                <Volume2 size={16} />
                                {isSpeaking ? 'Speaking...' : 'Read Feedback Aloud'}
                            </button>
                        </div>

                        {result.conceptsCovered && result.conceptsCovered.length > 0 && (
                            <div className="concepts-section concepts-covered">
                                <h4>✅ Concepts You Demonstrated:</h4>
                                <div className="concept-tags">
                                    {result.conceptsCovered.map((concept, i) => (
                                        <span key={i} className="concept-tag covered">{concept}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.conceptsMissed && result.conceptsMissed.length > 0 && (
                            <div className="concepts-section concepts-missed">
                                <h4>📝 Concepts to Review:</h4>
                                <div className="concept-tags">
                                    {result.conceptsMissed.map((concept, i) => (
                                        <span key={i} className="concept-tag missed">{concept}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.followUpQuestions && result.followUpQuestions.length > 0 && (
                            <div className="followup-section">
                                <h4>🤔 Think About:</h4>
                                <ul>
                                    {result.followUpQuestions.map((q, i) => (
                                        <li key={i}>{q}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="action-buttons">
                            {!result.passed && (
                                <button className="try-again-btn" onClick={handleTryAgain}>
                                    <RefreshCw size={18} />
                                    Try Again
                                </button>
                            )}
                            <button className="done-btn" onClick={handleClose}>
                                {result.passed ? 'Awesome! Continue Coding' : 'Close'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExplainItBack;
