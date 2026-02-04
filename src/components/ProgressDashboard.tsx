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
    X
} from 'lucide-react';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid
} from 'recharts';
import type { LearningProfile } from '../types';
import { getWeaknessDetector } from '../agents/weaknessDetector';
import { saveProfile } from '../services/learningProfile';
import { ConfirmationModal } from './ConfirmationModal';
import { CurriculumView } from './CurriculumView';
import { StudyTimer } from './StudyTimer';
import { Certifications } from './Certifications';
import { LearningAnalytics } from './LearningAnalytics';
import './ProgressDashboard.css';

interface ProgressDashboardProps {
    profile: LearningProfile | null;
    onStartPractice?: (topic: string, prompt?: string) => void;
    onAskAboutTopic?: (topic: string) => void;
    onProfileUpdate?: () => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
    profile,
    onStartPractice,
    onAskAboutTopic,
    onProfileUpdate,
}) => {
    const [streakDays, setStreakDays] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Modal state
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        type: 'strength' | 'weakness' | null;
        item: string | null;
    }>({
        isOpen: false,
        type: null,
        item: null
    });

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
        if (minutes < 1) return '< 1m';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
    };

    const _getSkillLevel = (successRate: number): string => {
        if (successRate >= 80) return 'Advanced';
        if (successRate >= 50) return 'Intermediate';
        return 'Beginner';
    };

    const _getSkillColor = (successRate: number): string => {
        if (successRate >= 80) return 'var(--accent-success)';
        if (successRate >= 50) return 'var(--accent-warning)';
        return 'var(--accent-error)';
    };

    const initiateRemoveStrength = (strength: string) => {
        setModalState({
            isOpen: true,
            type: 'strength',
            item: strength
        });
    };

    const initiateRemoveWeakness = (weaknessTopic: string) => {
        setModalState({
            isOpen: true,
            type: 'weakness',
            item: weaknessTopic
        });
    };

    const handleConfirmRemove = async () => {
        if (!profile || !modalState.item || !modalState.type) return;

        const updatedProfile = { ...profile };

        if (modalState.type === 'strength') {
            updatedProfile.strengths = updatedProfile.strengths.filter(s => s !== modalState.item);
            try {
                await saveProfile(updatedProfile);
                onProfileUpdate?.();
            } catch (error) {
                console.error('Failed to update strengths:', error);
            }
        } else if (modalState.type === 'weakness') {
            updatedProfile.weaknesses = updatedProfile.weaknesses.filter(w => w.topic !== modalState.item);
            try {
                await saveProfile(updatedProfile);
                onProfileUpdate?.();
            } catch (error) {
                console.error('Failed to update weaknesses:', error);
            }
        }

        setModalState({ isOpen: false, type: null, item: null });
    };

    const handleAnalyze = async () => {
        const detector = getWeaknessDetector();
        if (detector) {
            setIsAnalyzing(true);
            try {
                await detector.analyzeRecentActivity();
                // Profile update happens via App.tsx callback
            } catch (e) {
                console.error(e);
            } finally {
                setIsAnalyzing(false);
            }
        }
    };

    const handleExport = () => {
        if (!profile) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "codementor_profile.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (text) {
                try {
                    const { importProfile } = await import('../services/learningProfile');
                    await importProfile(text);
                    window.location.reload();
                } catch (error) {
                    alert('Failed to import profile: Invalid format');
                }
            }
        };
        reader.readAsText(file);
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
                <div>
                    <h2>Your Learning Journey</h2>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div className="streak-badge">
                        <Calendar size={16} />
                        <span>{streakDays} day streak</span>
                    </div>

                    <button className="icon-btn" onClick={handleExport} title="Export Profile">
                        Export
                    </button>
                    <label className="icon-btn" title="Import Profile" style={{ cursor: 'pointer' }}>
                        Import
                        <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                    </label>
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

            {/* Study Timer Section */}
            <div className="section timer-section">
                <StudyTimer
                    onSessionComplete={(duration, type) => {
                        console.log(`Completed ${type} session: ${duration} mins`);
                        // Could update profile session count here
                    }}
                />
            </div>

            {/* Learning Analytics - Time Series & Improvement */}
            <div className="section">
                <LearningAnalytics profile={profile} />
            </div>

            {/* Skill Chart */}
            <div className="section" id="skill-chart-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3>Skill Balance</h3>
                    <button
                        className="export-btn"
                        onClick={() => {
                            const chartElement = document.getElementById('skill-chart-section');
                            if (chartElement) {
                                // Create a temporary canvas for export
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                canvas.width = chartElement.offsetWidth * 2;
                                canvas.height = chartElement.offsetHeight * 2;

                                if (ctx) {
                                    ctx.scale(2, 2);
                                    ctx.fillStyle = '#1a1a2e';
                                    ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2);

                                    // Add header
                                    ctx.fillStyle = '#fff';
                                    ctx.font = 'bold 20px system-ui';
                                    ctx.fillText('🎓 CodeMentor Skill Report', 20, 40);
                                    ctx.font = '12px system-ui';
                                    ctx.fillStyle = '#9ca3af';
                                    ctx.fillText(`Generated: ${new Date().toLocaleDateString()}`, 20, 60);

                                    // Add stats
                                    ctx.fillStyle = '#fff';
                                    ctx.font = '14px system-ui';
                                    ctx.fillText(`Sessions: ${profile.totalSessions}`, 20, 90);
                                    ctx.fillText(`Topics: ${profile.topics.length}`, 150, 90);
                                    ctx.fillText(`Mastered: ${profile.strengths.length}`, 280, 90);

                                    // Convert to image and download
                                    const link = document.createElement('a');
                                    link.download = `codementor-report-${Date.now()}.png`;
                                    link.href = canvas.toDataURL('image/png');
                                    link.click();
                                }

                                alert('📸 Report Card exported! Check your downloads.');
                            }
                        }}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: 'white',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        📸 Export Report
                    </button>
                </div>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        {profile.topics.length >= 3 ? (
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={profile.topics}>
                                <PolarGrid stroke="var(--border-color)" />
                                <PolarAngleAxis dataKey="topic" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                    name="Proficiency"
                                    dataKey="successRate"
                                    stroke="var(--accent-primary)"
                                    fill="var(--accent-primary)"
                                    fillOpacity={0.6}
                                    isAnimationActive={true}
                                    animationDuration={1500}
                                    animationEasing="ease-out"
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        borderRadius: '8px'
                                    }}
                                />
                            </RadarChart>
                        ) : (
                            <BarChart data={profile.topics} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                                <XAxis type="number" domain={[0, 100]} hide />
                                <YAxis dataKey="topic" type="category" width={100} tick={{ fill: 'var(--text-secondary)' }} />
                                <Tooltip
                                    cursor={{ fill: 'var(--bg-tertiary)' }}
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Bar
                                    dataKey="successRate"
                                    name="Proficiency"
                                    fill="var(--accent-primary)"
                                    radius={[0, 4, 4, 0]}
                                    barSize={20}
                                    isAnimationActive={true}
                                    animationDuration={1200}
                                />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Analysis Grid */}
            <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Strengths */}
                <div className="section" style={{ margin: 0, height: 'fit-content' }}>
                    <h3 style={{ color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Award size={18} />
                        Strengths
                    </h3>
                    <div className="strength-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {profile.strengths.length > 0 ? (
                            profile.strengths.map((strength) => (
                                <span key={strength} className="strength-tag" style={{
                                    background: 'rgba(74, 222, 128, 0.1)',
                                    color: 'var(--accent-success)',
                                    padding: '6px 12px',
                                    borderRadius: '16px',
                                    fontSize: '0.85rem',
                                    border: '1px solid rgba(74, 222, 128, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    {strength}
                                    <button
                                        onClick={() => initiateRemoveStrength(strength)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: 'currentColor',
                                            opacity: 0.7
                                        }}
                                        title="Remove strength"
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))
                        ) : (
                            <p className="empty-text">Keep coding to discover your strengths!</p>
                        )}
                    </div>
                </div>

                {/* Weaknesses */}
                <div className="section" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, color: 'var(--accent-error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={18} />
                            Focus Areas
                        </h3>
                        <button
                            className="icon-btn"
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            style={{
                                fontSize: '0.7rem',
                                padding: '6px 12px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                height: 'auto',
                                cursor: isAnalyzing ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                        </button>
                    </div>
                    <div className="weakness-list">
                        {profile.weaknesses.length > 0 ? (
                            profile.weaknesses.map((weakness) => (
                                <div key={weakness.topic} className="weakness-item" style={{
                                    padding: '16px',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: '8px',
                                    marginBottom: '12px',
                                    borderLeft: '4px solid var(--accent-error)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{weakness.topic}</span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="practice-btn"
                                                onClick={() => onAskAboutTopic?.(weakness.topic)}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '4px 12px',
                                                    height: 'auto',
                                                    whiteSpace: 'nowrap',
                                                    background: 'var(--accent-primary)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Practice
                                            </button>
                                            <button
                                                onClick={() => initiateRemoveWeakness(weakness.topic)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: '4px',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)',
                                                    opacity: 0.7
                                                }}
                                                title="Remove focus area"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                                        {weakness.description || 'Struggled with this concept recently.'}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="success-message">
                                <CheckCircle size={16} />
                                <span>No weaknesses detected.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Curriculum View */}
            <div className="section">
                <CurriculumView
                    weaknesses={profile.weaknesses}
                    totalSessions={profile.totalSessions}
                    totalCodingTime={profile.totalCodingTime}
                    onStartPractice={onStartPractice}
                />
            </div>

            {/* Certifications */}
            <div className="section">
                <Certifications
                    profile={profile}
                    onClaimCertificate={(certId) => {
                        console.log('Claimed certificate:', certId);
                    }}
                />
            </div>

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={modalState.isOpen}
                title={modalState.type === 'strength' ? 'Remove Strength' : 'Remove Focus Area'}
                message={`Are you sure you want to remove '${modalState.item}' from your ${modalState.type === 'strength' ? 'strengths' : 'focus areas'}?`}
                onConfirm={handleConfirmRemove}
                onClose={() => setModalState({ isOpen: false, type: null, item: null })}
            />
        </div>
    );
};

export default ProgressDashboard;
