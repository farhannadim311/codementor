// Progress Dashboard Component - Visualize learning journey
import { useEffect, useState } from 'react';
import {
    TrendingUp,
    Clock,
    Target,
    Award,
    AlertTriangle,
    CheckCircle,
    Calendar,
} from 'lucide-react';
import type { LearningProfile, Weakness, TopicProgress } from '../types';
import './ProgressDashboard.css';

interface ProgressDashboardProps {
    profile: LearningProfile | null;
    onStartPractice?: (topic: string) => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
    profile,
    onStartPractice,
}) => {
    const [streakDays, setStreakDays] = useState(0);

    useEffect(() => {
        if (profile) {
            // Calculate streak (simplified)
            const daysSinceLastSession = profile.lastSessionAt
                ? Math.floor(
                    (Date.now() - new Date(profile.lastSessionAt).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
                : 999;

            setStreakDays(daysSinceLastSession <= 1 ? profile.totalSessions : 0);
        }
    }, [profile]);

    const formatTime = (minutes: number): string => {
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    };

    const getSkillLevel = (successRate: number): string => {
        if (successRate >= 80) return 'Advanced';
        if (successRate >= 50) return 'Intermediate';
        return 'Beginner';
    };

    const getSkillColor = (successRate: number): string => {
        if (successRate >= 80) return 'var(--accent-success)';
        if (successRate >= 50) return 'var(--accent-warning)';
        return 'var(--accent-error)';
    };

    if (!profile) {
        return (
            <div className="progress-dashboard empty">
                <div className="empty-state">
                    <Award size={48} />
                    <h3>Start Your Learning Journey!</h3>
                    <p>Complete your first coding session to see your progress here.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="progress-dashboard">
            <div className="dashboard-header">
                <h2>Your Learning Journey</h2>
                <div className="streak-badge">
                    <Calendar size={16} />
                    <span>{streakDays} day streak</span>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">
                        <Target size={20} />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{profile.totalSessions}</div>
                        <div className="stat-label">Sessions</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <Clock size={20} />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{formatTime(profile.totalCodingTime)}</div>
                        <div className="stat-label">Total Time</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{profile.topics.length}</div>
                        <div className="stat-label">Topics Studied</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <CheckCircle size={20} />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{profile.strengths.length}</div>
                        <div className="stat-label">Mastered</div>
                    </div>
                </div>
            </div>

            {/* Skill Radar */}
            <div className="section">
                <h3>Topic Progress</h3>
                <div className="topic-list">
                    {profile.topics.length > 0 ? (
                        profile.topics.map((topic) => (
                            <div key={topic.topic} className="topic-item">
                                <div className="topic-info">
                                    <span className="topic-name">{topic.topic}</span>
                                    <span
                                        className="topic-level"
                                        style={{ color: getSkillColor(topic.successRate) }}
                                    >
                                        {getSkillLevel(topic.successRate)}
                                    </span>
                                </div>
                                <div className="topic-progress">
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{
                                                width: `${topic.successRate}%`,
                                                background: getSkillColor(topic.successRate),
                                            }}
                                        />
                                    </div>
                                    <span className="progress-value">{topic.successRate}%</span>
                                </div>
                                <div className="topic-time">{formatTime(topic.timeSpent)}</div>
                            </div>
                        ))
                    ) : (
                        <p className="empty-text">No topics tracked yet. Start coding!</p>
                    )}
                </div>
            </div>

            {/* Weaknesses */}
            <div className="section">
                <h3>
                    <AlertTriangle size={18} />
                    Areas to Improve
                </h3>
                <div className="weakness-list">
                    {profile.weaknesses.length > 0 ? (
                        profile.weaknesses.map((weakness) => (
                            <div key={weakness.topic} className="weakness-item">
                                <div className="weakness-info">
                                    <span className="weakness-topic">{weakness.topic}</span>
                                    <span className="weakness-count">
                                        Struggled {weakness.occurrences} time
                                        {weakness.occurrences > 1 ? 's' : ''}
                                    </span>
                                </div>
                                <button
                                    className="practice-btn"
                                    onClick={() => onStartPractice?.(weakness.topic)}
                                >
                                    Practice
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="success-message">
                            <CheckCircle size={16} />
                            <span>No weaknesses detected. Great job!</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Strengths */}
            {profile.strengths.length > 0 && (
                <div className="section">
                    <h3>
                        <Award size={18} />
                        Your Strengths
                    </h3>
                    <div className="strength-tags">
                        {profile.strengths.map((strength) => (
                            <span key={strength} className="strength-tag">
                                {strength}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProgressDashboard;
