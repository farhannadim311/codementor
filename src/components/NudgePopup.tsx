// Nudge Popup Component - Proactive help when student is stuck
import { useEffect } from 'react';
import { X, Lightbulb, ThumbsUp, Volume2, VolumeX } from 'lucide-react';
import { useVoiceSettings } from '../contexts/VoiceSettingsContext';
import { speak, stop } from '../services/voiceService';
import './NudgePopup.css';

interface NudgePopupProps {
    isVisible: boolean;
    reason: string;
    file?: string;
    line?: number;
    onRequestHint: () => void;
    onDismiss: () => void;
}

export const NudgePopup: React.FC<NudgePopupProps> = ({
    isVisible,
    reason,
    file,
    line,
    onRequestHint,
    onDismiss,
}) => {
    const { voiceEnabled, toggleVoice } = useVoiceSettings();

    // Generate friendly message based on reason
    const getMessage = () => {
        if (reason.includes('repeated')) {
            return "I noticed you're encountering the same error repeatedly. Would you like a hint?";
        }
        if (reason.includes('no progress') || reason.includes('No significant')) {
            return "You've been working on this for a while. Need some guidance?";
        }
        if (reason.includes('logic') || reason.includes('approach')) {
            return "Your approach might need adjusting. Want me to point you in the right direction?";
        }
        return "Looks like you might be stuck. Would you like some help?";
    };

    // Stop speaking when popup is dismissed
    useEffect(() => {
        return () => {
            stop();
        };
    }, [isVisible]);

    if (!isVisible) return null;

    const handleDismiss = () => {
        stop();
        onDismiss();
    };

    const handleRequestHint = () => {
        stop();
        onRequestHint();
    };

    return (
        <div className="nudge-popup-container">
            <div className="nudge-popup animate-slide-in">
                <div className="nudge-header-actions">
                    <button
                        className={`nudge-voice-toggle ${voiceEnabled ? 'active' : ''}`}
                        onClick={toggleVoice}
                        title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
                    >
                        {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    </button>
                    <button className="nudge-close" onClick={handleDismiss} title="Dismiss">
                        <X size={16} />
                    </button>
                </div>

                <div className="nudge-icon">💡</div>

                <div className="nudge-content">
                    <p className="nudge-message">{getMessage()}</p>
                    {file && line && (
                        <p className="nudge-context">
                            Working on: {file.split('/').pop()} (line {line})
                        </p>
                    )}
                </div>

                <div className="nudge-actions">
                    <button className="nudge-btn secondary" onClick={handleDismiss}>
                        <ThumbsUp size={16} />
                        I'm Fine
                    </button>
                    <button className="nudge-btn primary" onClick={handleRequestHint}>
                        <Lightbulb size={16} />
                        Text Hint
                    </button>
                    <button
                        className="nudge-btn voice"
                        onClick={() => {
                            const message = getMessage();
                            speak(message, 'helper', true);
                        }}
                    >
                        <Volume2 size={16} />
                        Voice Hint
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NudgePopup;
