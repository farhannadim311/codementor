// StudyTimer Component - Pomodoro-style timer with AI check-ins
import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Play, Pause, RotateCcw, Coffee, Target, Sparkles } from 'lucide-react';
import './StudyTimer.css';

interface StudyTimerProps {
    onSessionComplete?: (duration: number, sessionType: 'focus' | 'break') => void;
    onCheckIn?: () => Promise<string>; // Returns AI message
}

interface TimerPreset {
    name: string;
    focusMinutes: number;
    breakMinutes: number;
    icon: React.ReactNode;
}

const PRESETS: TimerPreset[] = [
    { name: 'Pomodoro', focusMinutes: 25, breakMinutes: 5, icon: <Target size={16} /> },
    { name: 'Short Sprint', focusMinutes: 15, breakMinutes: 3, icon: <Sparkles size={16} /> },
    { name: 'Deep Work', focusMinutes: 50, breakMinutes: 10, icon: <Timer size={16} /> },
];

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const StudyTimer: React.FC<StudyTimerProps> = ({
    onSessionComplete,
    onCheckIn,
}) => {
    const [selectedPreset, setSelectedPreset] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isBreak, setIsBreak] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(PRESETS[0].focusMinutes * 60);
    const [sessionsCompleted, setSessionsCompleted] = useState(0);
    const [totalFocusTime, setTotalFocusTime] = useState(0);
    const [aiMessage, setAiMessage] = useState<string | null>(null);
    const [showCheckIn, setShowCheckIn] = useState(false);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);

    const currentPreset = PRESETS[selectedPreset];

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Get progress percentage
    const getProgress = (): number => {
        const total = isBreak
            ? currentPreset.breakMinutes * 60
            : currentPreset.focusMinutes * 60;
        return ((total - timeRemaining) / total) * 100;
    };

    // Fetch AI check-in message
    const fetchAICheckIn = async () => {
        try {
            if (onCheckIn) {
                const message = await onCheckIn();
                setAiMessage(message);
            } else {
                // Fallback to direct API call
                const response = await fetch(`${API_BASE_URL}/api/timer-checkin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionsCompleted,
                        totalFocusTime,
                        isBreakStarting: !isBreak,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    setAiMessage(data.message);
                }
            }
        } catch (error) {
            console.error('AI check-in error:', error);
            // Fallback messages
            const messages = isBreak
                ? ["Time for a break! Stretch, hydrate, and rest your eyes. 🧘", "Great focus session! Take a well-deserved break. ☕"]
                : ["Ready to dive back in? Let's make this session count! 💪", "Break's over - time to continue learning! 🚀"];
            setAiMessage(messages[Math.floor(Math.random() * messages.length)]);
        }
    };

    // Handle timer completion
    const handleTimerComplete = useCallback(async () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // Play notification sound
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAABCxAgAEABAAZGF0YQQAAAB/f38A');
        audio.play().catch(() => { });

        if (!isBreak) {
            // Focus session completed
            const focusMinutes = currentPreset.focusMinutes;
            setSessionsCompleted(prev => prev + 1);
            setTotalFocusTime(prev => prev + focusMinutes);
            onSessionComplete?.(focusMinutes, 'focus');
        } else {
            // Break completed
            onSessionComplete?.(currentPreset.breakMinutes, 'break');
        }

        // Show check-in with AI message
        setShowCheckIn(true);
        await fetchAICheckIn();

        // Switch between focus and break
        const newIsBreak = !isBreak;
        setIsBreak(newIsBreak);
        setTimeRemaining(newIsBreak
            ? currentPreset.breakMinutes * 60
            : currentPreset.focusMinutes * 60
        );
        setIsRunning(false);
        setIsPaused(false);
    }, [isBreak, currentPreset, onSessionComplete, sessionsCompleted, totalFocusTime]);

    // Timer tick effect
    useEffect(() => {
        if (isRunning && !isPaused && timeRemaining > 0) {
            intervalRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        handleTimerComplete();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }
            };
        }
    }, [isRunning, isPaused, handleTimerComplete]);

    const handleStart = () => {
        setIsRunning(true);
        setIsPaused(false);
        setShowCheckIn(false);
        setAiMessage(null);
        startTimeRef.current = Date.now();
    };

    const handlePause = () => {
        setIsPaused(!isPaused);
    };

    const handleReset = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsRunning(false);
        setIsPaused(false);
        setIsBreak(false);
        setTimeRemaining(currentPreset.focusMinutes * 60);
        setShowCheckIn(false);
        setAiMessage(null);
    };

    const handlePresetChange = (index: number) => {
        if (!isRunning) {
            setSelectedPreset(index);
            setTimeRemaining(PRESETS[index].focusMinutes * 60);
            setIsBreak(false);
        }
    };

    const handleDismissCheckIn = () => {
        setShowCheckIn(false);
        setAiMessage(null);
    };

    return (
        <div className="study-timer">
            <div className="timer-header">
                <Timer size={20} />
                <h3>Study Timer</h3>
                <span className="session-count">{sessionsCompleted} sessions</span>
            </div>

            {/* Preset Selector */}
            {!isRunning && (
                <div className="preset-selector">
                    {PRESETS.map((preset, index) => (
                        <button
                            key={preset.name}
                            className={`preset-btn ${selectedPreset === index ? 'active' : ''}`}
                            onClick={() => handlePresetChange(index)}
                        >
                            {preset.icon}
                            <span>{preset.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Timer Display */}
            <div className="timer-display">
                <div className="timer-circle">
                    <svg className="timer-svg" viewBox="0 0 100 100">
                        <circle
                            cx="50"
                            cy="50"
                            r="45"
                            className="timer-bg"
                        />
                        <circle
                            cx="50"
                            cy="50"
                            r="45"
                            className={`timer-progress ${isBreak ? 'break' : 'focus'}`}
                            style={{
                                strokeDasharray: `${getProgress() * 2.83} 283`,
                            }}
                        />
                    </svg>
                    <div className="timer-content">
                        <span className="timer-label">{isBreak ? 'Break' : 'Focus'}</span>
                        <span className="timer-time">{formatTime(timeRemaining)}</span>
                        <span className="timer-preset">{currentPreset.name}</span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="timer-controls">
                {!isRunning ? (
                    <button className="control-btn start" onClick={handleStart}>
                        <Play size={24} />
                        <span>Start {isBreak ? 'Break' : 'Focus'}</span>
                    </button>
                ) : (
                    <>
                        <button className="control-btn pause" onClick={handlePause}>
                            {isPaused ? <Play size={20} /> : <Pause size={20} />}
                            <span>{isPaused ? 'Resume' : 'Pause'}</span>
                        </button>
                        <button className="control-btn reset" onClick={handleReset}>
                            <RotateCcw size={20} />
                            <span>Reset</span>
                        </button>
                    </>
                )}
            </div>

            {/* AI Check-in Message */}
            {showCheckIn && aiMessage && (
                <div className="checkin-overlay" onClick={handleDismissCheckIn}>
                    <div className="checkin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="checkin-icon">
                            {isBreak ? <Coffee size={32} /> : <Target size={32} />}
                        </div>
                        <h4>{isBreak ? '☕ Break Time!' : '🎯 Ready to Focus!'}</h4>
                        <p className="checkin-message">{aiMessage}</p>
                        <button className="checkin-btn" onClick={handleDismissCheckIn}>
                            {isBreak ? 'Start Break' : 'Let\'s Go!'}
                        </button>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="timer-stats">
                <div className="stat">
                    <span className="stat-value">{totalFocusTime}</span>
                    <span className="stat-label">mins focused</span>
                </div>
                <div className="stat">
                    <span className="stat-value">{sessionsCompleted}</span>
                    <span className="stat-label">sessions</span>
                </div>
            </div>
        </div>
    );
};

export default StudyTimer;
