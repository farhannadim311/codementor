// Interactive Terminal Component - VS Code Style with Real Shell
import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import {
    Terminal as TerminalIcon,
    Play,
    Trash2,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    XCircle,
    Square,
    RotateCcw
} from 'lucide-react';
import {
    spawnShell,
    sendShellInput,
    subscribeShellOutput,
    interruptShell,
    killShell,
    type ShellSession
} from '../services/gemini';
import './Terminal.css';

export interface TerminalOutput {
    type: 'stdout' | 'stderr' | 'system' | 'command';
    content: string;
    timestamp: Date;
}

export interface CompilerInfo {
    name: string;
    version: string;
    extensions: string[];
}

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
    language: string;
}

interface TerminalProps {
    onRun: () => void;
    isRunning: boolean;
    output: TerminalOutput[];
    compilers: CompilerInfo[];
    activeFilename?: string;
    lastExitCode?: number;
    onClear: () => void;
}

// Parse ANSI color codes to styled spans
function parseAnsiToHtml(text: string): string {
    // Basic ANSI color code patterns
    const ansiColors: { [key: string]: string } = {
        '30': '#000000', '31': '#f14c4c', '32': '#4ec9b0', '33': '#dcdcaa',
        '34': '#569cd6', '35': '#c586c0', '36': '#4ec9b0', '37': '#d4d4d4',
        '90': '#858585', '91': '#f14c4c', '92': '#4ec9b0', '93': '#dcdcaa',
        '94': '#569cd6', '95': '#c586c0', '96': '#4ec9b0', '97': '#ffffff',
    };

    return text
        .replace(/\x1b\[(\d+)m/g, (_, code) => {
            if (code === '0') return '</span>';
            const color = ansiColors[code];
            return color ? `<span style="color: ${color}">` : '';
        })
        .replace(/\x1b\[\d+;\d+m/g, '') // Remove complex sequences
        .replace(/\x1b\[\d+[A-Z]/gi, ''); // Remove cursor movements
}

export function Terminal({
    onRun,
    isRunning,
    output,
    compilers,
    activeFilename,
    lastExitCode,
    onClear,
}: TerminalProps) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [mode, setMode] = useState<'output' | 'shell'>('shell');
    const [shellSession, setShellSession] = useState<ShellSession | null>(null);
    const [shellOutput, setShellOutput] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isShellActive, setIsShellActive] = useState(false);

    const outputRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output, shellOutput]);

    // Expand when running
    useEffect(() => {
        if (isRunning) {
            setIsMinimized(false);
        }
    }, [isRunning]);

    // Initialize shell session
    const initShell = useCallback(async () => {
        if (shellSession || isConnecting) return;

        setIsConnecting(true);
        try {
            const session = await spawnShell();
            setShellSession(session);
            setIsShellActive(true);
            setShellOutput([`🐚 Shell started (${session.shell})\n`]);

            // Subscribe to output
            const eventSource = subscribeShellOutput(
                session.sessionId,
                (type, content, exitCode) => {
                    if (type === 'exit') {
                        setShellOutput(prev => [...prev, `\n[Process exited with code ${exitCode}]\n`]);
                        setIsShellActive(false);
                    } else {
                        // Check for clear screen sequences: \x1b[2J (erase display) or \x1bc (reset)
                        if (content.includes('\x1b[2J') || content.includes('\x1bc')) {
                            setShellOutput([content]);
                        } else {
                            setShellOutput(prev => [...prev, content]);
                        }
                    }
                },
                (error) => {
                    console.error('Shell SSE error callback triggered:', error);
                    // Don't disable immediately on error, might be reconnecting
                    // setIsShellActive(false); 
                }
            );

            eventSourceRef.current = eventSource;
        } catch (error) {
            console.error('Failed to spawn shell:', error);
            setShellOutput([`❌ Failed to start shell: ${error}\n`]);
        } finally {
            setIsConnecting(false);
        }
    }, [shellSession, isConnecting]);

    // Auto-start shell in shell mode
    useEffect(() => {
        if (mode === 'shell' && !shellSession && !isConnecting) {
            initShell();
        }
    }, [mode, shellSession, isConnecting, initShell]);

    // Cleanup on unmount only
    const shellSessionRef = useRef<ShellSession | null>(null);
    useEffect(() => {
        shellSessionRef.current = shellSession;
    }, [shellSession]);

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
            if (shellSessionRef.current) {
                killShell(shellSessionRef.current.sessionId).catch(() => { });
            }
        };
    }, []); // Empty deps - only runs on unmount

    // Handle key press in input
    const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // Send command to shell (even if empty - to get new prompt)
            if (shellSession && isShellActive) {
                e.preventDefault();
                // Echo the command to the output (since bash without PTY doesn't echo)
                if (inputValue.trim()) {
                    setShellOutput(prev => [...prev, `$ ${inputValue}\n`]);
                }
                await sendShellInput(shellSession.sessionId, inputValue + '\n');
                if (inputValue.trim()) {
                    setCommandHistory(prev => [...prev, inputValue]);
                }
                setHistoryIndex(-1);
                setInputValue('');
            }
        } else if (e.key === 'ArrowUp') {
            // Navigate history up
            e.preventDefault();
            if (commandHistory.length > 0) {
                const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
            }
        } else if (e.key === 'ArrowDown') {
            // Navigate history down
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setInputValue('');
            }
        } else if (e.key === 'c' && e.ctrlKey) {
            // Ctrl+C - Interrupt
            e.preventDefault();
            if (shellSession) {
                await interruptShell(shellSession.sessionId);
                setShellOutput(prev => [...prev, '^C\n']);
            }
        }
    };

    // Handle restart shell
    const handleRestartShell = async () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (shellSession) {
            await killShell(shellSession.sessionId).catch(() => { });
        }
        setShellSession(null);
        setShellOutput([]);
        setIsShellActive(false);
        // Will auto-restart due to useEffect
    };

    // Get status display
    const getStatus = () => {
        if (mode === 'shell') {
            if (isConnecting) {
                return { text: 'Connecting...', className: 'running', icon: <div className="execution-spinner" /> };
            }
            if (isShellActive) {
                return { text: 'Shell Active', className: 'success', icon: <CheckCircle size={12} /> };
            }
            return { text: 'Shell Inactive', className: 'error', icon: <XCircle size={12} /> };
        }

        if (isRunning) {
            return { text: 'Running...', className: 'running', icon: <div className="execution-spinner" /> };
        }
        if (lastExitCode === undefined) {
            return { text: 'Ready', className: '', icon: null };
        }
        if (lastExitCode === 0) {
            return { text: 'Exited (0)', className: 'success', icon: <CheckCircle size={12} /> };
        }
        return { text: `Exited (${lastExitCode})`, className: 'error', icon: <XCircle size={12} /> };
    };

    const status = getStatus();

    // Check if active file can be run
    const canRun = activeFilename && compilers.some(c =>
        c.extensions.some(ext => activeFilename.endsWith(ext))
    );

    // Focus input when clicking terminal
    const handleTerminalClick = () => {
        if (mode === 'shell' && inputRef.current) {
            inputRef.current.focus();
        }
    };

    return (
        <div
            className={`terminal-container ${isMinimized ? 'terminal-minimized' : ''}`}
            onClick={handleTerminalClick}
        >
            {/* Header */}
            <div className="terminal-header">
                <div className="terminal-header-left">
                    <div className="terminal-tabs">
                        <button
                            className={`terminal-tab ${mode === 'shell' ? 'active' : ''}`}
                            onClick={() => setMode('shell')}
                        >
                            <TerminalIcon size={12} />
                            <span>Shell</span>
                        </button>
                        <button
                            className={`terminal-tab ${mode === 'output' ? 'active' : ''}`}
                            onClick={() => setMode('output')}
                        >
                            <Play size={12} />
                            <span>Output</span>
                        </button>
                    </div>
                    <div className={`terminal-status ${status.className}`}>
                        {status.icon}
                        <span>{status.text}</span>
                    </div>
                </div>

                <div className="terminal-header-right">
                    {mode === 'output' && (
                        <button
                            className={`run-btn ${isRunning ? 'running' : ''}`}
                            onClick={onRun}
                            disabled={!canRun || isRunning}
                            title={canRun ? `Run ${activeFilename}` : 'Select a runnable file'}
                        >
                            {isRunning ? (
                                <>
                                    <Square size={12} />
                                    <span>Running</span>
                                </>
                            ) : (
                                <>
                                    <Play size={12} />
                                    <span>Run</span>
                                </>
                            )}
                        </button>
                    )}

                    {mode === 'shell' && (
                        <button
                            className="terminal-btn"
                            onClick={handleRestartShell}
                            title="Restart shell"
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}

                    <button
                        className="terminal-btn"
                        onClick={() => {
                            if (mode === 'shell') {
                                setShellOutput([]);
                            } else {
                                onClear();
                            }
                        }}
                        title="Clear terminal"
                    >
                        <Trash2 size={14} />
                    </button>

                    <button
                        className="terminal-btn"
                        onClick={() => setIsMinimized(!isMinimized)}
                        title={isMinimized ? 'Expand terminal' : 'Minimize terminal'}
                    >
                        {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* Output Area */}
            <div className="terminal-output" ref={outputRef}>
                {mode === 'shell' ? (
                    // Interactive shell mode
                    <>
                        {shellOutput.length === 0 && !isConnecting ? (
                            <div className="terminal-welcome">
                                <h4>🐚 Interactive Shell</h4>
                                <p>Type commands just like in VS Code's integrated terminal.</p>
                                <p style={{ color: '#858585', marginTop: '8px' }}>
                                    • Use ↑/↓ arrows to navigate command history<br />
                                    • Press Ctrl+C to interrupt running processes<br />
                                    • Run <code>npm install</code>, <code>git status</code>, etc.
                                </p>
                            </div>
                        ) : (
                            <pre
                                className="terminal-line stdout shell-output"
                                dangerouslySetInnerHTML={{
                                    __html: parseAnsiToHtml(shellOutput.join(''))
                                }}
                            />
                        )}
                    </>
                ) : (
                    // Run output mode
                    <>
                        {output.length === 0 ? (
                            <div className="terminal-welcome">
                                <h4>👋 Welcome to CodeMentor Terminal</h4>
                                <p>Run your code directly from the editor. Click "Run" or press Ctrl+Enter.</p>

                                {compilers.length > 0 ? (
                                    <>
                                        <p style={{ marginTop: '12px', color: '#4ec9b0' }}>
                                            ✓ {compilers.length} language{compilers.length > 1 ? 's' : ''} available:
                                        </p>
                                        <ul className="compiler-list">
                                            {compilers.map((compiler) => (
                                                <li key={compiler.name} className="installed">
                                                    <CheckCircle size={12} />
                                                    <span>{compiler.name}</span>
                                                    <span className="ext">{compiler.extensions.join(', ')}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    <p style={{ marginTop: '12px', color: '#f14c4c' }}>
                                        ⚠ Loading compilers...
                                    </p>
                                )}
                            </div>
                        ) : (
                            output.map((line, index) => (
                                <pre
                                    key={index}
                                    className={`terminal-line ${line.type} ${line.type === 'stderr' ? 'error-highlight' : ''
                                        }`}
                                >
                                    {line.content}
                                </pre>
                            ))
                        )}
                    </>
                )}
            </div>

            {/* Input Line (Shell mode only) */}
            {mode === 'shell' && !isMinimized && (
                <div className="terminal-input-line">
                    <span className="terminal-prompt">❯</span>
                    <input
                        ref={inputRef}
                        type="text"
                        className="terminal-input"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isShellActive ? 'Type a command...' : 'Shell not active'}
                        disabled={!isShellActive}
                        spellCheck={false}
                        autoComplete="off"
                    />
                </div>
            )}
        </div>
    );
}

export default Terminal;
