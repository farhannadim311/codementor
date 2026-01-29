// Certifications Component - Micro-certifications with visual badges
import { useState } from 'react';
import { Award, Star, Trophy, Medal, Shield, Zap, Target, Code, CheckCircle, Lock } from 'lucide-react';
import type { LearningProfile } from '../types';
import './Certifications.css';

interface CertificationsProps {
    profile: LearningProfile | null;
    onClaimCertificate?: (certId: string) => void;
}

interface Certificate {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    requirement: {
        type: 'sessions' | 'topics' | 'strengths' | 'time' | 'streak';
        count: number;
    };
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

const CERTIFICATES: Certificate[] = [
    // Session-based certificates
    {
        id: 'first-steps',
        name: 'First Steps',
        description: 'Complete your first coding session',
        icon: <Zap size={24} />,
        color: '#f59e0b',
        requirement: { type: 'sessions', count: 1 },
        tier: 'bronze'
    },
    {
        id: 'getting-started',
        name: 'Getting Started',
        description: 'Complete 5 coding sessions',
        icon: <Target size={24} />,
        color: '#3b82f6',
        requirement: { type: 'sessions', count: 5 },
        tier: 'bronze'
    },
    {
        id: 'dedicated-learner',
        name: 'Dedicated Learner',
        description: 'Complete 25 coding sessions',
        icon: <Star size={24} />,
        color: '#8b5cf6',
        requirement: { type: 'sessions', count: 25 },
        tier: 'silver'
    },
    {
        id: 'code-warrior',
        name: 'Code Warrior',
        description: 'Complete 100 coding sessions',
        icon: <Shield size={24} />,
        color: '#ec4899',
        requirement: { type: 'sessions', count: 100 },
        tier: 'gold'
    },

    // Topic-based certificates
    {
        id: 'curious-mind',
        name: 'Curious Mind',
        description: 'Explore 3 different topics',
        icon: <Code size={24} />,
        color: '#10b981',
        requirement: { type: 'topics', count: 3 },
        tier: 'bronze'
    },
    {
        id: 'well-rounded',
        name: 'Well Rounded',
        description: 'Study 10 different topics',
        icon: <Medal size={24} />,
        color: '#06b6d4',
        requirement: { type: 'topics', count: 10 },
        tier: 'silver'
    },

    // Mastery certificates
    {
        id: 'skill-seeker',
        name: 'Skill Seeker',
        description: 'Master 1 programming skill',
        icon: <CheckCircle size={24} />,
        color: '#14b8a6',
        requirement: { type: 'strengths', count: 1 },
        tier: 'bronze'
    },
    {
        id: 'skill-master',
        name: 'Skill Master',
        description: 'Master 5 programming skills',
        icon: <Award size={24} />,
        color: '#f97316',
        requirement: { type: 'strengths', count: 5 },
        tier: 'silver'
    },
    {
        id: 'code-legend',
        name: 'Code Legend',
        description: 'Master 15 programming skills',
        icon: <Trophy size={24} />,
        color: '#fbbf24',
        requirement: { type: 'strengths', count: 15 },
        tier: 'gold'
    },

    // Time-based certificates
    {
        id: 'time-investor',
        name: 'Time Investor',
        description: 'Spend 60 minutes learning',
        icon: <Star size={24} />,
        color: '#a855f7',
        requirement: { type: 'time', count: 60 },
        tier: 'bronze'
    },
    {
        id: 'marathon-coder',
        name: 'Marathon Coder',
        description: 'Spend 10 hours learning',
        icon: <Trophy size={24} />,
        color: '#ef4444',
        requirement: { type: 'time', count: 600 },
        tier: 'gold'
    },
];

const getTierStyle = (tier: Certificate['tier']) => {
    switch (tier) {
        case 'bronze':
            return { background: 'linear-gradient(135deg, #cd7f32, #8b4513)', border: '#cd7f32' };
        case 'silver':
            return { background: 'linear-gradient(135deg, #c0c0c0, #808080)', border: '#c0c0c0' };
        case 'gold':
            return { background: 'linear-gradient(135deg, #ffd700, #ff8c00)', border: '#ffd700' };
        case 'platinum':
            return { background: 'linear-gradient(135deg, #e5e4e2, #c0c0c0)', border: '#e5e4e2' };
    }
};

export const Certifications: React.FC<CertificationsProps> = ({
    profile,
    onClaimCertificate,
}) => {
    const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
    const [claimedCerts, setClaimedCerts] = useState<Set<string>>(new Set());

    // Check if certificate is earned
    const isEarned = (cert: Certificate): boolean => {
        if (!profile) return false;

        switch (cert.requirement.type) {
            case 'sessions':
                return profile.totalSessions >= cert.requirement.count;
            case 'topics':
                return profile.topics.length >= cert.requirement.count;
            case 'strengths':
                return profile.strengths.length >= cert.requirement.count;
            case 'time':
                return profile.totalCodingTime >= cert.requirement.count;
            default:
                return false;
        }
    };

    // Get progress towards certificate
    const getProgress = (cert: Certificate): number => {
        if (!profile) return 0;

        let current = 0;
        switch (cert.requirement.type) {
            case 'sessions':
                current = profile.totalSessions;
                break;
            case 'topics':
                current = profile.topics.length;
                break;
            case 'strengths':
                current = profile.strengths.length;
                break;
            case 'time':
                current = profile.totalCodingTime;
                break;
        }

        return Math.min((current / cert.requirement.count) * 100, 100);
    };

    const handleClaim = (cert: Certificate) => {
        setClaimedCerts(prev => new Set([...prev, cert.id]));
        onClaimCertificate?.(cert.id);
    };

    const earnedCerts = CERTIFICATES.filter(c => isEarned(c));
    const lockedCerts = CERTIFICATES.filter(c => !isEarned(c));

    return (
        <div className="certifications">
            <div className="certs-header">
                <Award size={24} />
                <h3>Micro-Certifications</h3>
                <span className="earned-count">{earnedCerts.length}/{CERTIFICATES.length} Earned</span>
            </div>

            {/* Earned Certificates */}
            {earnedCerts.length > 0 && (
                <div className="section earned-section">
                    <h4>🏆 Earned</h4>
                    <div className="cert-grid">
                        {earnedCerts.map(cert => (
                            <div
                                key={cert.id}
                                className={`cert-card earned ${claimedCerts.has(cert.id) ? 'claimed' : ''}`}
                                onClick={() => setSelectedCert(cert)}
                            >
                                <div
                                    className="cert-badge"
                                    style={{
                                        background: getTierStyle(cert.tier).background,
                                        color: 'white'
                                    }}
                                >
                                    {cert.icon}
                                </div>
                                <div className="cert-info">
                                    <span className="cert-name">{cert.name}</span>
                                    <span className="cert-tier">{cert.tier}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Locked Certificates */}
            {lockedCerts.length > 0 && (
                <div className="section locked-section">
                    <h4>🔒 In Progress</h4>
                    <div className="cert-grid">
                        {lockedCerts.map(cert => (
                            <div
                                key={cert.id}
                                className="cert-card locked"
                                onClick={() => setSelectedCert(cert)}
                            >
                                <div className="cert-badge locked-badge">
                                    <Lock size={20} />
                                </div>
                                <div className="cert-info">
                                    <span className="cert-name">{cert.name}</span>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${getProgress(cert)}%` }}
                                        />
                                    </div>
                                    <span className="progress-text">
                                        {Math.round(getProgress(cert))}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Certificate Detail Modal */}
            {selectedCert && (
                <div className="cert-modal-overlay" onClick={() => setSelectedCert(null)}>
                    <div className="cert-modal" onClick={(e) => e.stopPropagation()}>
                        <div
                            className="modal-badge"
                            style={{
                                background: isEarned(selectedCert)
                                    ? getTierStyle(selectedCert.tier).background
                                    : 'var(--bg-tertiary)',
                                color: isEarned(selectedCert) ? 'white' : 'var(--text-secondary)'
                            }}
                        >
                            {isEarned(selectedCert) ? selectedCert.icon : <Lock size={32} />}
                        </div>
                        <h3>{selectedCert.name}</h3>
                        <p className="cert-description">{selectedCert.description}</p>

                        <div className="cert-details">
                            <span className="tier-badge" style={{ color: getTierStyle(selectedCert.tier).border }}>
                                {selectedCert.tier.toUpperCase()}
                            </span>
                        </div>

                        {!isEarned(selectedCert) && (
                            <div className="modal-progress">
                                <div className="progress-bar large">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${getProgress(selectedCert)}%` }}
                                    />
                                </div>
                                <span className="progress-text">
                                    {Math.round(getProgress(selectedCert))}% complete
                                </span>
                            </div>
                        )}

                        {isEarned(selectedCert) && !claimedCerts.has(selectedCert.id) && (
                            <button
                                className="claim-btn"
                                onClick={() => handleClaim(selectedCert)}
                            >
                                🎉 Claim Certificate!
                            </button>
                        )}

                        {claimedCerts.has(selectedCert.id) && (
                            <div className="claimed-badge">
                                <CheckCircle size={16} />
                                Claimed!
                            </div>
                        )}

                        <button className="close-btn" onClick={() => setSelectedCert(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Certifications;
