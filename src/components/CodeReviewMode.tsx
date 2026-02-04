// CodeReviewMode Component - AI-powered code review with probing questions
import { useState, useMemo, useEffect } from 'react';
import { Code2, MessageCircle, Loader, ChevronDown, ChevronRight, AlertTriangle, Lightbulb, CheckCircle2, FileCode, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useVoiceSettings } from '../contexts/VoiceSettingsContext';
import { speak, stop } from '../services/voiceService';
import './CodeReviewMode.css';

interface FileItem {
    id: string;
    name: string;
    content: string;
    type?: 'code' | 'output' | 'pdf' | 'image';
    language: string;
}

interface CodeReviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    code: string;
    language: string;
    fileName: string;
    files?: FileItem[];
    activeFileId?: string;
    onHighlightLines?: (lines: number[]) => void;
}

interface ReviewFeedback {
    category: 'style' | 'logic' | 'performance' | 'security' | 'readability' | 'best-practice';
    severity: 'info' | 'suggestion' | 'warning' | 'critical';
    lineStart: number;
    lineEnd: number;
    title: string;
    description: string;
    question: string;
    suggestion?: string;
}

interface ReviewResult {
    summary: string;
    overallQuality: 'excellent' | 'good' | 'needs-improvement' | 'poor';
    feedback: ReviewFeedback[];
    strengths: string[];
    learningOpportunities: string[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const CodeReviewMode: React.FC<CodeReviewModeProps> = ({
    isOpen,
    onClose,
    code,
    language,
    fileName,
    files = [],
    activeFileId,
    onHighlightLines,
}) => {
    const [isReviewing, setIsReviewing] = useState(false);
    const [result, setResult] = useState<ReviewResult | null>(null);
    const [expandedFeedback, setExpandedFeedback] = useState<Set<number>>(new Set());
    const [phase, setPhase] = useState<'start' | 'reviewing' | 'result'>('start');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const { voiceEnabled } = useVoiceSettings();

    // File selection state
    const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || '');

    // Get code files only
    const codeFiles = useMemo(() => files.filter(f => f.type === 'code'), [files]);

    // Get selected file's code and details
    const selectedFile = useMemo(() =>
        codeFiles.find(f => f.id === selectedFileId) || codeFiles[0],
        [codeFiles, selectedFileId]);

    const currentCode = selectedFile?.content || code;
    const currentLanguage = selectedFile?.language || language;
    const currentFileName = selectedFile?.name || fileName;

    // Update selection when activeFileId changes
    useEffect(() => {
        if (activeFileId && isOpen) {
            setSelectedFileId(activeFileId);
        }
    }, [activeFileId, isOpen]);

    const handleStartReview = async () => {
        setIsReviewing(true);
        setPhase('reviewing');

        try {
            const response = await fetch(`${API_BASE_URL}/api/code-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: currentCode,
                    language: currentLanguage,
                    fileName: currentFileName,
                }),
            });

            if (!response.ok) {
                throw new Error('Review failed');
            }

            const reviewResult: ReviewResult = await response.json();
            setResult(reviewResult);
            setPhase('result');
        } catch (error) {
            console.error('Code review error:', error);
            setResult({
                summary: 'Failed to complete the code review. Please try again.',
                overallQuality: 'needs-improvement',
                feedback: [],
                strengths: [],
                learningOpportunities: []
            });
            setPhase('result');
        } finally {
            setIsReviewing(false);
        }
    };

    const handleToggleFeedback = (index: number) => {
        const newExpanded = new Set(expandedFeedback);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedFeedback(newExpanded);
    };

    const handleFeedbackClick = (feedback: ReviewFeedback) => {
        if (onHighlightLines) {
            const lines: number[] = [];
            for (let i = feedback.lineStart; i <= feedback.lineEnd; i++) {
                lines.push(i);
            }
            onHighlightLines(lines);
        }
    };

    const handleClose = () => {
        setResult(null);
        setPhase('start');
        setExpandedFeedback(new Set());
        stop();
        onClose();
    };

    const handleListenToReview = async () => {
        if (!result) return;
        setIsSpeaking(true);

        // Build text to speak
        let textToSpeak = `Code review complete. Overall quality: ${result.overallQuality.replace('-', ' ')}. `;
        textToSpeak += result.summary + ' ';

        if (result.strengths.length > 0) {
            textToSpeak += 'What you did well: ' + result.strengths.join('. ') + '. ';
        }

        if (result.feedback.length > 0) {
            textToSpeak += `There are ${result.feedback.length} items to review. `;
        }

        try {
            await speak(textToSpeak, 'tutor', true);
        } finally {
            setIsSpeaking(false);
        }
    };

    if (!isOpen) return null;

    const getSeverityIcon = (severity: ReviewFeedback['severity']) => {
        switch (severity) {
            case 'critical': return <AlertTriangle size={16} className="severity-critical" />;
            case 'warning': return <AlertTriangle size={16} className="severity-warning" />;
            case 'suggestion': return <Lightbulb size={16} className="severity-suggestion" />;
            case 'info': return <MessageCircle size={16} className="severity-info" />;
        }
    };

    const getQualityColor = (quality: ReviewResult['overallQuality']) => {
        switch (quality) {
            case 'excellent': return 'var(--accent-success)';
            case 'good': return 'var(--accent-primary)';
            case 'needs-improvement': return 'var(--accent-warning)';
            case 'poor': return 'var(--accent-error)';
        }
    };

    const getQualityEmoji = (quality: ReviewResult['overallQuality']) => {
        switch (quality) {
            case 'excellent': return '🌟';
            case 'good': return '👍';
            case 'needs-improvement': return '📝';
            case 'poor': return '🔧';
        }
    };

    return (
        <div className="code-review-overlay" onClick={handleClose}>
            <div className="code-review-modal" onClick={(e) => e.stopPropagation()}>
                <div className="code-review-header">
                    <Code2 size={24} />
                    <h2>Code Review</h2>
                    <span className="file-badge">{currentFileName}</span>
                    <button className="close-btn" onClick={handleClose}>×</button>
                </div>

                {phase === 'start' && (
                    <div className="start-phase">
                        <div className="review-intro">
                            <div className="intro-icon">🔍</div>
                            <h3>Get AI-Powered Code Feedback</h3>
                            <p>
                                Our AI reviewer will analyze your code and ask probing questions to help you
                                think critically about your design choices, identify potential issues, and
                                learn best practices.
                            </p>
                            <ul className="review-features">
                                <li><CheckCircle2 size={16} /> Style & readability analysis</li>
                                <li><CheckCircle2 size={16} /> Logic & correctness checks</li>
                                <li><CheckCircle2 size={16} /> Performance suggestions</li>
                                <li><CheckCircle2 size={16} /> Socratic questions for learning</li>
                            </ul>
                        </div>

                        {/* File Selector */}
                        {codeFiles.length > 1 && (
                            <div className="file-selector">
                                <label><FileCode size={14} /> Select file to review:</label>
                                <select
                                    value={selectedFileId}
                                    onChange={(e) => setSelectedFileId(e.target.value)}
                                    className="file-select"
                                >
                                    {codeFiles.map(file => (
                                        <option key={file.id} value={file.id}>
                                            {file.name} ({file.language})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="code-preview">
                            <div className="code-label">{currentLanguage} • {currentCode.split('\n').length} lines</div>
                            <pre><code>{currentCode.substring(0, 400)}{currentCode.length > 400 ? '...' : ''}</code></pre>
                        </div>

                        <button
                            className="start-review-btn"
                            onClick={handleStartReview}
                            disabled={isReviewing}
                        >
                            <Code2 size={18} />
                            Start Code Review
                        </button>
                    </div>
                )}


                {phase === 'reviewing' && (
                    <div className="reviewing-phase">
                        <div className="loading-animation">
                            <Loader size={48} className="spinning" />
                            <h3>Analyzing your code...</h3>
                            <p>Looking at structure, style, logic, and best practices</p>
                        </div>
                    </div>
                )}

                {phase === 'result' && result && (
                    <div className="result-phase">
                        {/* Quality Badge */}
                        <div
                            className="quality-badge"
                            style={{ borderColor: getQualityColor(result.overallQuality) }}
                        >
                            <span className="emoji">{getQualityEmoji(result.overallQuality)}</span>
                            <span
                                className="quality-level"
                                style={{ color: getQualityColor(result.overallQuality) }}
                            >
                                {result.overallQuality.replace('-', ' ').toUpperCase()}
                            </span>
                        </div>

                        {/* Summary */}
                        <div className="review-summary">
                            <ReactMarkdown>{result.summary}</ReactMarkdown>
                            <button
                                className="listen-btn"
                                onClick={handleListenToReview}
                                disabled={isSpeaking}
                            >
                                <Volume2 size={16} />
                                {isSpeaking ? 'Speaking...' : 'Listen to Review'}
                            </button>
                        </div>

                        {/* Strengths */}
                        {result.strengths.length > 0 && (
                            <div className="section strengths-section">
                                <h4>✅ What You Did Well</h4>
                                <ul>
                                    {result.strengths.map((s, i) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Feedback Items */}
                        {result.feedback.length > 0 && (
                            <div className="section feedback-section">
                                <h4>💭 Review Feedback ({result.feedback.length})</h4>
                                <div className="feedback-list">
                                    {result.feedback.map((fb, index) => (
                                        <div
                                            key={index}
                                            className={`feedback-item severity-${fb.severity}`}
                                            onClick={() => handleFeedbackClick(fb)}
                                        >
                                            <div
                                                className="feedback-header"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleFeedback(index);
                                                }}
                                            >
                                                {expandedFeedback.has(index)
                                                    ? <ChevronDown size={16} />
                                                    : <ChevronRight size={16} />
                                                }
                                                {getSeverityIcon(fb.severity)}
                                                <span className="feedback-title">{fb.title}</span>
                                                <span className="line-badge">
                                                    Line {fb.lineStart}{fb.lineEnd > fb.lineStart ? `-${fb.lineEnd}` : ''}
                                                </span>
                                            </div>

                                            {expandedFeedback.has(index) && (
                                                <div className="feedback-body">
                                                    <p className="feedback-description">{fb.description}</p>
                                                    <div className="probing-question">
                                                        <strong>🤔 Think about:</strong> {fb.question}
                                                    </div>
                                                    {fb.suggestion && (
                                                        <div className="suggestion">
                                                            <strong>💡 Hint:</strong> {fb.suggestion}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Learning Opportunities */}
                        {result.learningOpportunities.length > 0 && (
                            <div className="section learning-section">
                                <h4>📚 Learning Opportunities</h4>
                                <ul>
                                    {result.learningOpportunities.map((lo, i) => (
                                        <li key={i}>{lo}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="action-buttons">
                            <button className="done-btn" onClick={handleClose}>
                                Continue Coding
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CodeReviewMode;
