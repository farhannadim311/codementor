import React, { useState } from 'react';
import { BookOpen, Sparkles, CheckCircle, ChevronRight, Loader2 } from 'lucide-react';
import { initializeCurriculumGenerator } from '../agents/curriculumGenerator';
import type { Curriculum, Weakness } from '../types';
import './CurriculumView.css';

interface CurriculumViewProps {
    weaknesses: Weakness[];
    onStartPractice?: (topic: string, prompt?: string) => void;
}

export const CurriculumView: React.FC<CurriculumViewProps> = ({
    weaknesses,
    onStartPractice
}) => {
    const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedModule, setExpandedModule] = useState<string | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const generator = initializeCurriculumGenerator();
            // Use top 3 weaknesses or at least some default tags if empty
            const targetWeaknesses = weaknesses.length > 0
                ? weaknesses
                : [{ topic: 'General Coding', description: 'Foundation', impact: 'high' }];

            const newCurriculum = await generator.generateFromWeaknesses(targetWeaknesses as Weakness[]);
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

    if (!curriculum && weaknesses.length === 0) {
        return null; // Don't show if no weaknesses and no curriculum
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
                        Based on your analysis, we can build a custom curriculum targeting your specific needs.
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
