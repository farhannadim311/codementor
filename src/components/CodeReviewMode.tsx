// CodeReviewMode Component - AI-powered code review with probing questions
import { useState } from 'react';
import { Code2, MessageCircle, Loader, ChevronDown, ChevronRight, AlertTriangle, Lightbulb, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './CodeReviewMode.css';

interface CodeReviewModeProps {
    isOpen: boolean;
    onClose: () => void;
    code: string;
    language: string;
    fileName: string;
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
    onHighlightLines,
}) => {
    const [isReviewing, setIsReviewing] = useState(false);
    const [result, setResult] = useState<ReviewResult | null>(null);
    const [expandedFeedback, setExpandedFeedback] = useState<Set<number>>(new Set());
    const [phase, setPhase] = useState<'start' | 'reviewing' | 'result'>('start');

    const handleStartReview = async () => {
        setIsReviewing(true);
        setPhase('reviewing');

        try {
            const response = await fetch(`${API_BASE_URL}/api/code-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    language,
                    fileName,
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
        onClose();
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
                    <span className="file-badge">{fileName}</span>
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

                        <div className="code-preview">
                            <div className="code-label">{language} • {code.split('\n').length} lines</div>
                            <pre><code>{code.substring(0, 400)}{code.length > 400 ? '...' : ''}</code></pre>
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
