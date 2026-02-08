// Nudge Popup Component - Proactive help when student is stuck
import { X, Lightbulb, ThumbsUp } from 'lucide-react';
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

    if (!isVisible) return null;

    return (
        <div className="nudge-popup-container">
            <div className="nudge-popup animate-slide-in">
                <div className="nudge-header-actions">
                    <button className="nudge-close" onClick={onDismiss} title="Dismiss">
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
                    <button className="nudge-btn secondary" onClick={onDismiss}>
                        <ThumbsUp size={16} />
                        I'm Fine
                    </button>
                    <button className="nudge-btn primary" onClick={onRequestHint}>
                        <Lightbulb size={16} />
                        Get Hint
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NudgePopup;
