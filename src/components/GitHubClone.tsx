// GitHub Clone Modal Component
import { useState } from 'react';
import { Github, X, Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { cloneRepository, parseGitHubUrl } from '../services/github';
import type { FileItem } from './MonacoEditor';
import './GitHubClone.css';

interface GitHubCloneProps {
    isOpen: boolean;
    onClose: () => void;
    onFilesCloned: (files: FileItem[]) => void;
}

export const GitHubClone: React.FC<GitHubCloneProps> = ({
    isOpen,
    onClose,
    onFilesCloned,
}) => {
    const [repoUrl, setRepoUrl] = useState('');
    const [isCloning, setIsCloning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleClone = async () => {
        if (!repoUrl.trim()) {
            setError('Please enter a GitHub repository URL');
            return;
        }

        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            setError('Invalid GitHub URL. Use format: https://github.com/owner/repo');
            return;
        }

        setIsCloning(true);
        setError(null);
        setProgress(0);
        setStatusMessage('Starting clone...');

        try {
            const files = await cloneRepository(repoUrl, (message, prog) => {
                setStatusMessage(message);
                setProgress(prog);
            });

            if (files.length === 0) {
                setError('No files were cloned. The repository may be empty.');
                setIsCloning(false);
                return;
            }

            onFilesCloned(files);
            setRepoUrl('');
            setProgress(100);
            setStatusMessage(`Successfully cloned ${files.length} files!`);

            // Close modal after short delay
            setTimeout(() => {
                onClose();
                setIsCloning(false);
                setProgress(0);
                setStatusMessage('');
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clone repository');
            setIsCloning(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isCloning) {
            handleClone();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="github-clone-overlay" onClick={onClose}>
            <div className="github-clone-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title">
                        <Github size={20} />
                        <h2>Clone GitHub Repository</h2>
                    </div>
                    <button className="close-btn" onClick={onClose} disabled={isCloning}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-content">
                    <p className="modal-description">
                        Enter a public GitHub repository URL to clone it into your workspace.
                    </p>

                    <div className="input-group">
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => {
                                setRepoUrl(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            disabled={isCloning}
                            autoFocus
                            autoComplete="new-password"
                            name="github-repo-url-no-autofill"
                        />
                    </div>

                    {error && (
                        <div className="error-message">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {isCloning && (
                        <div className="progress-section">
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="status-message">
                                {progress === 100 ? (
                                    <CheckCircle size={14} className="success-icon" />
                                ) : (
                                    <Loader size={14} className="spinning" />
                                )}
                                <span>{statusMessage}</span>
                            </div>
                        </div>
                    )}

                    <div className="example-repos">
                        <span className="example-label">Examples:</span>
                        <button
                            className="example-btn"
                            onClick={() => setRepoUrl('https://github.com/microsoft/vscode-extension-samples')}
                            disabled={isCloning}
                        >
                            vscode-extension-samples
                        </button>
                        <button
                            className="example-btn"
                            onClick={() => setRepoUrl('https://github.com/gothinkster/realworld')}
                            disabled={isCloning}
                        >
                            realworld
                        </button>
                    </div>
                </div>

                <div className="modal-footer">
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={isCloning}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleClone}
                        disabled={isCloning || !repoUrl.trim()}
                    >
                        {isCloning ? (
                            <>
                                <Loader size={16} className="spinning" />
                                Cloning...
                            </>
                        ) : (
                            <>
                                <Github size={16} />
                                Clone Repository
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GitHubClone;
