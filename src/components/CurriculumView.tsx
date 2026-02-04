import React, { useState } from 'react';
import { BookOpen, Sparkles, CheckCircle, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { initializeCurriculumGenerator } from '../agents/curriculumGenerator';
import type { Curriculum, Weakness } from '../types';
import './CurriculumView.css';

interface CurriculumViewProps {
    weaknesses: Weakness[];
    totalSessions?: number;
    totalCodingTime?: number;
    onStartPractice?: (topic: string, prompt?: string) => void;
}

export const CurriculumView: React.FC<CurriculumViewProps> = ({
    weaknesses,
    totalSessions = 0,
    totalCodingTime = 0,
    onStartPractice
}) => {
    const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedModule, setExpandedModule] = useState<string | null>(null);

    // Check if we have enough data for personalization
    const hasEnoughData = weaknesses.length > 0 || totalSessions >= 3 || totalCodingTime >= 5;

    const handleGenerate = async () => {
        if (!hasEnoughData) {
            return; // Don't generate without real data
        }

        setIsGenerating(true);
        try {
            const generator = initializeCurriculumGenerator();
            const newCurriculum = await generator.generateFromWeaknesses(weaknesses);
            setCurriculum(newCurriculum);

            // Auto expand first module
            if (newCurriculum.modules.length > 0) {
                setExpandedModule(newCurriculum.modules[0].id);
            }
        } catch (error) {
            console.error('Failed to generate curriculum', error);
        } finally {
            setIsGenerating(false);
        }
    };

    // Show insufficient data message
    if (!hasEnoughData && !curriculum) {
        return (
            <div className="curriculum-container">
                <div className="curriculum-header">
                    <h3>
                        <BookOpen size={20} />
                        Personalized Learning Path
                    </h3>
                </div>
                <div className="insufficient-data-message">
                    <AlertCircle size={48} className="warning-icon" />
                    <h4>Not Enough Data Yet</h4>
                    <p>
                        We need more interaction to create a truly personalized curriculum for you.
                        To build your learning profile:
                    </p>
                    <ul>
                        <li>💬 Ask questions in the chat about coding concepts</li>
                        <li>⌨️ Write some code in the editor</li>
                        <li>🔍 Use the code review feature</li>
                        <li>⏱️ Spend at least 5 minutes coding</li>
                    </ul>
                    <p className="progress-note">
                        <strong>Current Progress:</strong> {weaknesses.length} weaknesses detected,
                        {totalSessions} sessions, {Math.round(totalCodingTime)} mins coding time
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="curriculum-container">
            <div className="curriculum-header">
                <h3>
                    <BookOpen size={20} />
                    Personalized Learning Path
                </h3>
                {!curriculum && (
                    <button
                        className="generate-btn"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 size={16} className="spin" />
                                Generating Plan...
                            </>
                        ) : (
                            <>
                                <Sparkles size={16} />
                                Generate Plan
                            </>
                        )}
                    </button>
                )}
            </div>

            {!curriculum ? (
                <div className="empty-curriculum">
                    <p>
                        Based on your {weaknesses.length} detected weakness(es), we can build a custom curriculum.
                        Click "Generate Plan" to get started!
                    </p>
                </div>
            ) : (
                <div className="modules-list">
                    {curriculum.modules.map((module, index) => (
                        <div key={module.id} className="module-card">
                            <div
                                className="module-header"
                                onClick={() => setExpandedModule(expandedModule === module.id ? null : module.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="module-number">{index + 1}</div>
                                <div className="module-info">
                                    <h4>{module.topic}</h4>
                                    <p>{module.description}</p>
                                </div>
                                <ChevronRight
                                    size={20}
                                    style={{
                                        transform: expandedModule === module.id ? 'rotate(90deg)' : 'none',
                                        transition: 'transform 0.2s',
                                        color: 'var(--text-secondary)'
                                    }}
                                />
                            </div>

                            {expandedModule === module.id && (
                                <div className="exercises-list">
                                    {module.exercises.map((exercise) => (
                                        <div key={exercise.id} className="exercise-item">
                                            <div className="exercise-details">
                                                <div className="exercise-meta">
                                                    <span className={`difficulty-badge ${exercise.difficulty}`}>
                                                        {exercise.difficulty}
                                                    </span>
                                                    {exercise.completed && (
                                                        <CheckCircle size={12} color="var(--accent-success)" />
                                                    )}
                                                </div>
                                                <span className="exercise-prompt">{exercise.prompt}</span>
                                            </div>
                                            <button
                                                className="start-btn"
                                                onClick={() => onStartPractice?.(module.topic, exercise.prompt)}
                                            >
                                                Start
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    <button
                        className="generate-btn"
                        onClick={handleGenerate}
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', margin: '0 auto', marginTop: '10px' }}
                    >
                        Regenerate Plan
                    </button>
                </div>
            )}
        </div>
    );
};
