// LearningAnalytics Component - Enhanced analytics with time series and trends
import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, BarChart2, Clock, Target, Zap } from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';
import type { LearningProfile, CodingSession } from '../types';
import { getRecentSessions } from '../services/learningProfile';
import './LearningAnalytics.css';

interface LearningAnalyticsProps {
    profile: LearningProfile | null;
}

interface DayData {
    date: string;
    sessions: number;
    minutes: number;
    skillScore: number;
}

// Aggregate real session data by day
const aggregateSessionsByDay = (sessions: CodingSession[], profile: LearningProfile | null): DayData[] => {
    const now = new Date();
    const dayMap = new Map<string, { sessions: number; minutes: number }>();

    // Initialize last 14 days
    for (let i = 13; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dayMap.set(dateKey, { sessions: 0, minutes: 0 });
    }

    // Aggregate sessions
    sessions.forEach(session => {
        const startDate = new Date(session.startTime);
        const dateKey = startDate.toISOString().split('T')[0];

        if (dayMap.has(dateKey)) {
            const existing = dayMap.get(dateKey)!;
            existing.sessions += 1;

            // Calculate session duration
            if (session.endTime) {
                const duration = (new Date(session.endTime).getTime() - startDate.getTime()) / 1000 / 60;
                existing.minutes += Math.round(duration);
            } else {
                // Active session - estimate based on interactions
                existing.minutes += session.interactions.length * 2; // ~2 min per interaction
            }
        }
    });

    // Convert to array with skill score calculation
    const data: DayData[] = [];
    let cumulativeScore = 50; // Base skill score

    dayMap.forEach((value, dateKey) => {
        const date = new Date(dateKey);
        // Skill score improves with activity
        if (value.sessions > 0) {
            cumulativeScore = Math.min(100, cumulativeScore + value.sessions * 2 + value.minutes * 0.1);
        }

        // Factor in strengths and weaknesses
        const strengthBonus = (profile?.strengths.length || 0) * 3;
        const weaknessPenalty = (profile?.weaknesses.length || 0) * 2;
        const adjustedScore = Math.min(100, Math.max(0, cumulativeScore + strengthBonus - weaknessPenalty));

        data.push({
            date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            sessions: value.sessions,
            minutes: value.minutes,
            skillScore: Math.round(adjustedScore),
        });
    });

    return data;
};

const getImprovementPercentage = (data: { skillScore: number }[]): number => {
    if (data.length < 2) return 0;
    const first = data[0].skillScore;
    const last = data[data.length - 1].skillScore;
    if (first === 0) return last > 0 ? 100 : 0;
    return Math.round(((last - first) / first) * 100);
};

export const LearningAnalytics: React.FC<LearningAnalyticsProps> = ({ profile }) => {
    const [sessions, setSessions] = useState<CodingSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSessions = async () => {
            try {
                const recentSessions = await getRecentSessions(100);
                setSessions(recentSessions);
            } catch (error) {
                console.error('Failed to load sessions:', error);
            } finally {
                setLoading(false);
            }
        };
        loadSessions();
    }, []);

    const historicalData = useMemo(() => aggregateSessionsByDay(sessions, profile), [sessions, profile]);
    const improvement = useMemo(() => getImprovementPercentage(historicalData), [historicalData]);

    if (!profile) return null;

    // Calculate weekly stats
    const thisWeekSessions = historicalData.slice(-7).reduce((acc, d) => acc + d.sessions, 0);
    const lastWeekSessions = historicalData.slice(0, 7).reduce((acc, d) => acc + d.sessions, 0);
    const sessionGrowth = lastWeekSessions > 0
        ? Math.round(((thisWeekSessions - lastWeekSessions) / lastWeekSessions) * 100)
        : 100;

    return (
        <div className="learning-analytics">
            <div className="analytics-header">
                <BarChart2 size={20} />
                <h3>Learning Analytics</h3>
            </div>

            {/* Improvement Badges */}
            <div className="improvement-badges">
                <div className={`improvement-badge ${improvement >= 0 ? 'positive' : 'negative'}`}>
                    {improvement >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    <div className="badge-content">
                        <span className="badge-value">
                            {improvement >= 0 ? '+' : ''}{improvement}%
                        </span>
                        <span className="badge-label">Skill Growth (14d)</span>
                    </div>
                </div>

                <div className={`improvement-badge ${sessionGrowth >= 0 ? 'positive' : 'neutral'}`}>
                    <Zap size={18} />
                    <div className="badge-content">
                        <span className="badge-value">
                            {sessionGrowth >= 0 ? '+' : ''}{sessionGrowth}%
                        </span>
                        <span className="badge-label">Activity (vs last week)</span>
                    </div>
                </div>

                <div className="improvement-badge info">
                    <Clock size={18} />
                    <div className="badge-content">
                        <span className="badge-value">{Math.round(profile.totalCodingTime)}</span>
                        <span className="badge-label">Total Minutes</span>
                    </div>
                </div>

                <div className="improvement-badge info">
                    <Target size={18} />
                    <div className="badge-content">
                        <span className="badge-value">{profile.strengths.length}</span>
                        <span className="badge-label">Skills Mastered</span>
                    </div>
                </div>
            </div>

            {/* Time Series Chart - Sessions */}
            <div className="chart-section">
                <h4>📈 Activity Over Time</h4>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="sessionGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={{ stroke: 'var(--border-color)' }}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={{ stroke: 'var(--border-color)' }}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                                }}
                                labelStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="sessions"
                                stroke="#6366f1"
                                strokeWidth={2}
                                fill="url(#sessionGradient)"
                                name="Sessions"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Skill Progress Chart */}
            <div className="chart-section">
                <h4>🎯 Skill Score Trend</h4>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={{ stroke: 'var(--border-color)' }}
                            />
                            <YAxis
                                domain={[0, 100]}
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={{ stroke: 'var(--border-color)' }}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                                }}
                                labelStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="skillScore"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={{ fill: '#10b981', strokeWidth: 0, r: 3 }}
                                activeDot={{ r: 5, strokeWidth: 0 }}
                                name="Skill Score"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default LearningAnalytics;
