// ExplainItBack Component - Validates student understanding using Feynman technique
import { useState } from 'react';
import { Brain, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './ExplainItBack.css';

interface ExplainItBackProps {
    isOpen: boolean;
    onClose: () => void;
    code: string;
    language: string;
    onValidationComplete?: (passed: boolean, feedback: string) => void;
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

export const ExplainItBack: React.FC<ExplainItBackProps> = ({
    isOpen,
    onClose,
    code,
    language,
    onValidationComplete,
}) => {
    const [explanation, setExplanation] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [phase, setPhase] = useState<'explain' | 'result'>('explain');

    const handleSubmit = async () => {
        if (!explanation.trim()) return;

        setIsValidating(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/explain-it-back`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    language,
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
        onClose();
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

                        <div className="code-preview">
                            <div className="code-label">Your code ({language})</div>
                            <pre><code>{code.substring(0, 500)}{code.length > 500 ? '...' : ''}</code></pre>
                        </div>

                        <textarea
                            className="explanation-input"
                            placeholder="Type your explanation here... 

For example:
- What does this code do overall?
- How does each part contribute to the solution?
- Why did you choose this approach?"
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            rows={8}
                            disabled={isValidating}
                        />

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
