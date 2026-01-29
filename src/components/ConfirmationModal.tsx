import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import './ConfirmationModal.css';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onClose
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={18} className="text-warning" style={{ color: 'var(--accent-warning)' }} />
                        {title}
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <p className="modal-message">{message}</p>
                <div className="modal-actions">
                    <button className="modal-btn cancel" onClick={onClose}>
                        {cancelLabel}
                    </button>
                    <button className="modal-btn confirm" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
