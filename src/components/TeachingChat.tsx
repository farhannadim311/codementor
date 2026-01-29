// Teaching Chat Component - Text-based interaction with teaching AI
import { useState, useRef, useEffect } from 'react';
import { Send, Lightbulb, BookOpen, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Interaction } from '../types';
import './TeachingChat.css';

interface TeachingChatProps {
    interactions: Interaction[];
    onSendMessage: (message: string) => void;
    onRequestHint: () => void;
    isLoading?: boolean;
    currentHintLevel: number;
}

export const TeachingChat: React.FC<TeachingChatProps> = ({
    interactions,
    onSendMessage,
    onRequestHint,
    isLoading = false,
    currentHintLevel,
}) => {
    const [message, setMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [interactions]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading) {
            onSendMessage(message.trim());
            setMessage('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const renderMessage = (interaction: Interaction, index: number) => {

        return (
            <div key={interaction.id || index} className="message-group animate-slide-in">
                {interaction.userMessage && (
                    <div className="message user-message">
                        <div className="message-content">{interaction.userMessage}</div>
                    </div>
                )}
                <div className="message ai-message">
                    <div className="message-avatar">
                        <BookOpen size={16} />
                    </div>
                    <div className="message-content">
                        <div className="message-text markdown-content">
                            {interaction.thinkingSummary && (
                                <div className="thinking-summary">
                                    <div className="thinking-label">
                                        <Lightbulb size={12} />
                                        <span>Thinking Process</span>
                                    </div>
                                    <div className="thinking-content">{interaction.thinkingSummary}</div>
                                </div>
                            )}
                            <ReactMarkdown>{interaction.aiResponse}</ReactMarkdown>
                        </div>
                        {interaction.highlightedLines && interaction.highlightedLines.length > 0 && (
                            <div className="referenced-lines">
                                📍 Discussing line{interaction.highlightedLines.length > 1 ? 's' : ''}{' '}
                                {interaction.highlightedLines.join(', ')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="teaching-chat">
            <div className="chat-header">
                <h3>
                    <BookOpen size={20} />
                    CodeMentor
                </h3>
                <div className="hint-level">
                    <span className="label">Hint Level:</span>
                    <div className="level-dots">
                        {[1, 2, 3, 4, 5].map((level) => (
                            <span
                                key={level}
                                className={`level-dot ${level <= currentHintLevel ? 'active' : ''}`}
                                title={`Level ${level}`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="chat-messages">
                {interactions.length === 0 && !isLoading ? (
                    <div className="empty-state">
                        <div className="empty-icon">🎓</div>
                        <h4>Ready to Learn!</h4>
                        <p>
                            Share your code or ask a question. I'll guide you to the answer
                            without giving it away.
                        </p>
                        <div className="quick-actions">
                            <button className="quick-action" onClick={onRequestHint}>
                                <Lightbulb size={16} />
                                Get a hint
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {interactions.map(renderMessage)}

                        {/* active response being streamed */}
                        {isLoading && !interactions.find(i => i.isStreaming) && (
                            <div className="message ai-message loading">
                                <div className="message-avatar">
                                    <RefreshCw size={16} className="spinning" />
                                </div>
                                <div className="message-content">
                                    <div className="thinking-message">
                                        <span className="thinking-text">Thinking</span>
                                        <div className="typing-indicator">
                                            <span></span>
                                            <span></span>
                                            <span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSubmit}>
                <div className="input-wrapper">
                    <textarea
                        ref={inputRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question or describe your problem..."
                        rows={1}
                        disabled={isLoading}
                    />
                    <div className="input-actions">
                        <button
                            type="button"
                            className="hint-btn"
                            onClick={onRequestHint}
                            disabled={isLoading}
                            title="Get a hint"
                        >
                            <Lightbulb size={18} />
                        </button>
                        <button
                            type="submit"
                            className="send-btn"
                            disabled={!message.trim() || isLoading}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default TeachingChat;
