// ExerciseMode Component - LeetCode-style practice with AI-generated test cases
import React, { useState, useEffect } from 'react';
import {
    Play,
    Send,
    Lightbulb,
    CheckCircle,
    XCircle,
    ChevronLeft,
    Loader,
    Eye,
    EyeOff,
    Trophy,
    Clock,
    Zap
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import type { GeneratedExercise, ValidationResult } from '../services/gemini';
import './ExerciseMode.css';

interface ExerciseModeProps {
    exercise: GeneratedExercise;
    onClose: () => void;
    onComplete: (passed: boolean, score: number) => void;
}

export const ExerciseMode: React.FC<ExerciseModeProps> = ({
    exercise,
    onClose,
    onComplete,
}) => {
    const [code, setCode] = useState(exercise.starterCode || '');
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [currentHintLevel, setCurrentHintLevel] = useState(0);
    const [showHints, setShowHints] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [timerActive, setTimerActive] = useState(true);

    // Timer
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (timerActive) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [timerActive]);

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getLanguageForMonaco = (lang: string): string => {
        const mapping: Record<string, string> = {
            javascript: 'javascript',
            typescript: 'typescript',
            python: 'python',
            java: 'java',
            cpp: 'cpp',
            c: 'c',
        };
        return mapping[lang] || 'javascript';
    };

    const handleRun = async () => {
        setIsRunning(true);
        setValidationResult(null);

        try {
            // Only run visible test cases
            const visibleTests = exercise.testCases.filter(tc => !tc.isHidden);

            const { validateExercise } = await import('../services/gemini');
            const result = await validateExercise(
                code,
                visibleTests,
                exercise.language,
                exercise.id
            );

            setValidationResult(result);
        } catch (error) {
            console.error('Run error:', error);
            setValidationResult({
                results: [],
                passedCount: 0,
                totalCount: 0,
                allPassed: false,
                feedback: error instanceof Error ? error.message : 'Failed to run tests',
                score: 0,
            });
        } finally {
            setIsRunning(false);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setValidationResult(null);

        try {
            const { validateExercise } = await import('../services/gemini');
            const result = await validateExercise(
                code,
                exercise.testCases,
                exercise.language,
                exercise.id
            );

            setValidationResult(result);
            setTimerActive(false);

            if (result.allPassed) {
                onComplete(true, result.score);
            }
        } catch (error) {
            console.error('Submit error:', error);
            setValidationResult({
                results: [],
                passedCount: 0,
                totalCount: 0,
                allPassed: false,
                feedback: error instanceof Error ? error.message : 'Failed to submit',
                score: 0,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const revealNextHint = () => {
        if (currentHintLevel < (exercise.hints?.length || 0)) {
            setCurrentHintLevel(prev => prev + 1);
            setShowHints(true);
        }
    };

    const getDifficultyColor = (diff: string): string => {
        switch (diff) {
            case 'easy': return 'var(--accent-success)';
            case 'medium': return 'var(--accent-warning)';
            case 'hard': return 'var(--accent-error)';
            default: return 'var(--text-secondary)';
        }
    };

    return (
        <div className="exercise-mode">
            {/* Header */}
            <header className="exercise-header">
                <button className="back-btn" onClick={onClose}>
                    <ChevronLeft size={20} />
                    Back
                </button>
                <div className="exercise-title-section">
                    <h1>{exercise.title || 'Practice Exercise'}</h1>
                    <div className="exercise-meta">
                        <span
                            className="difficulty-badge"
                            style={{ backgroundColor: getDifficultyColor(exercise.difficulty) }}
                        >
                            {exercise.difficulty}
                        </span>
                        <span className="topic-badge">{exercise.topic}</span>
                        <span className="timer">
                            <Clock size={14} />
                            {formatTime(elapsedTime)}
                        </span>
                    </div>
                </div>
                <div className="header-actions">
                    <button
                        className="hint-btn"
                        onClick={revealNextHint}
                        disabled={currentHintLevel >= (exercise.hints?.length || 0)}
                    >
                        <Lightbulb size={18} />
                        Hint ({currentHintLevel}/{exercise.hints?.length || 0})
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="exercise-content">
                {/* Problem Panel */}
                <div className="problem-panel">
                    <div className="problem-description">
                        <ReactMarkdown>{exercise.description || exercise.title || 'No description available'}</ReactMarkdown>
                    </div>

                    {/* Hints Section */}
                    {showHints && currentHintLevel > 0 && (
                        <div className="hints-section">
                            <h3>
                                <Lightbulb size={16} />
                                Hints
                            </h3>
                            {exercise.hints?.slice(0, currentHintLevel).map((hint, i) => (
                                <div key={i} className="hint-card">
                                    <span className="hint-level">Level {hint.level}</span>
                                    <p>{hint.content}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Complexity Info */}
                    {(exercise.timeComplexity || exercise.spaceComplexity) && (
                        <div className="complexity-info">
                            {exercise.timeComplexity && (
                                <span>⏱️ Time: {exercise.timeComplexity}</span>
                            )}
                            {exercise.spaceComplexity && (
                                <span>💾 Space: {exercise.spaceComplexity}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Editor Panel */}
                <div className="editor-panel">
                    <div className="editor-header">
                        <span className="language-label">{exercise.language}</span>
                        <div className="editor-actions">
                            <button
                                className="run-btn"
                                onClick={handleRun}
                                disabled={isRunning || isSubmitting}
                            >
                                {isRunning ? (
                                    <Loader size={16} className="spinning" />
                                ) : (
                                    <Play size={16} />
                                )}
                                Run
                            </button>
                            <button
                                className="submit-btn"
                                onClick={handleSubmit}
                                disabled={isRunning || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Loader size={16} className="spinning" />
                                ) : (
                                    <Send size={16} />
                                )}
                                Submit
                            </button>
                        </div>
                    </div>
                    <div className="editor-container">
                        <Editor
                            height="100%"
                            language={getLanguageForMonaco(exercise.language)}
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            theme="vs-dark"
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                tabSize: 2,
                            }}
                        />
                    </div>
                </div>

                {/* Results Panel */}
                <div className="results-panel">
                    <div className="results-header">
                        <h3>Test Results</h3>
                        {validationResult && (
                            <span className={`score ${validationResult.allPassed ? 'passed' : 'failed'}`}>
                                {validationResult.score}%
                            </span>
                        )}
                    </div>

                    {!validationResult ? (
                        <div className="results-placeholder">
                            <Zap size={32} />
                            <p>Run or submit your code to see test results</p>
                        </div>
                    ) : (
                        <div className="results-content">
                            {/* Summary */}
                            <div className={`results-summary ${validationResult.allPassed ? 'success' : 'partial'}`}>
                                {validationResult.allPassed ? (
                                    <>
                                        <Trophy size={24} />
                                        <span>All tests passed!</span>
                                    </>
                                ) : (
                                    <>
                                        <span>
                                            {validationResult.passedCount} / {validationResult.totalCount} tests passed
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Test Cases */}
                            <div className="test-cases-list">
                                {validationResult.results.map((result, idx) => (
                                    <div
                                        key={idx}
                                        className={`test-case-item ${result.passed ? 'passed' : 'failed'}`}
                                    >
                                        <div className="test-case-header">
                                            {result.passed ? (
                                                <CheckCircle size={16} className="icon-pass" />
                                            ) : (
                                                <XCircle size={16} className="icon-fail" />
                                            )}
                                            <span>Test Case {idx + 1}</span>
                                            {result.isHidden && (
                                                <span className="hidden-badge">
                                                    <EyeOff size={12} />
                                                    Hidden
                                                </span>
                                            )}
                                        </div>
                                        {!result.isHidden && (
                                            <div className="test-case-details">
                                                <div className="detail-row">
                                                    <span className="label">Input:</span>
                                                    <code>{result.input}</code>
                                                </div>
                                                <div className="detail-row">
                                                    <span className="label">Expected:</span>
                                                    <code>{result.expectedOutput}</code>
                                                </div>
                                                {!result.passed && (
                                                    <div className="detail-row actual">
                                                        <span className="label">Your Output:</span>
                                                        <code>{result.actualOutput || '(no output)'}</code>
                                                    </div>
                                                )}
                                                {result.error && (
                                                    <div className="detail-row error">
                                                        <span className="label">Error:</span>
                                                        <code>{result.error}</code>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Feedback */}
                            {validationResult.feedback && (
                                <div className="feedback-section">
                                    <h4>Feedback</h4>
                                    <p>{validationResult.feedback}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExerciseMode;
