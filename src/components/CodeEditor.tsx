// Code Editor Component with Monaco-like highlighting
import { useRef } from 'react';
import './CodeEditor.css';

interface CodeEditorProps {
    code: string;
    language?: string;
    highlightedLines?: number[];
    readOnly?: boolean;
    onChange?: (code: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
    code,
    language = 'javascript',
    highlightedLines = [],
    readOnly = true,
    onChange,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);

    const renderLines = () => {
        const lines = code.split('\n');
        return lines.map((line, index) => {
            const lineNumber = index + 1;
            const isHighlighted = highlightedLines.includes(lineNumber);

            return (
                <div
                    key={index}
                    className={`code-line ${isHighlighted ? 'highlighted' : ''}`}
                    data-line={lineNumber}
                >
                    <span className="line-number">{lineNumber}</span>
                    <span className="line-content">
                        <code>{line || ' '}</code>
                    </span>
                </div>
            );
        });
    };

    return (
        <div className="code-editor" ref={editorRef}>
            <div className="code-editor-header">
                <div className="window-controls">
                    <span className="control close"></span>
                    <span className="control minimize"></span>
                    <span className="control maximize"></span>
                </div>
                <span className="language-badge">{language}</span>
            </div>
            <div className="code-editor-content">
                {readOnly ? (
                    <div className="code-display">{renderLines()}</div>
                ) : (
                    <textarea
                        value={code}
                        onChange={(e) => onChange?.(e.target.value)}
                        spellCheck={false}
                        className="code-input"
                    />
                )}
            </div>
            {highlightedLines.length > 0 && (
                <div className="highlight-indicator">
                    <span className="pulse-dot"></span>
                    <span>
                        Mentor is discussing line{highlightedLines.length > 1 ? 's' : ''}{' '}
                        {highlightedLines.join(', ')}
                    </span>
                </div>
            )}
        </div>
    );
};

export default CodeEditor;
