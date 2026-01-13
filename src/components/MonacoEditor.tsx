// Monaco Editor Component with multi-file support including PDFs
import { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { FileText, FileCode, File } from 'lucide-react';
import { extractTextFromPdf } from '../services/pdfParser';
import './MonacoEditor.css';

export interface FileItem {
    id: string;
    name: string;
    content: string;
    language: string;
    lastModified: Date;
    type?: 'code' | 'pdf' | 'image'; // File type for special handling
    extractedText?: string; // Extracted text content for PDFs
}

interface MonacoEditorProps {
    files: FileItem[];
    activeFileId: string | null;
    onFileChange: (fileId: string, content: string) => void;
    onFileSelect: (fileId: string) => void;
    onFileClose: (fileId: string) => void;
    onFilesUpload: (files: FileItem[]) => void;
    highlightedLines?: number[];
    readOnly?: boolean;
    onCodeActivity?: (code: string, file: string, line: number) => void;
    onSyntaxErrors?: (errors: string[]) => void;
}

// Detect language from file extension
const getLanguageFromExtension = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        py: 'python',
        java: 'java',
        c: 'c',
        cpp: 'cpp',
        cs: 'csharp',
        go: 'go',
        rs: 'rust',
        rb: 'ruby',
        php: 'php',
        html: 'html',
        css: 'css',
        json: 'json',
        md: 'markdown',
        sql: 'sql',
        sh: 'shell',
        bash: 'shell',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        txt: 'plaintext',
    };
    return languageMap[ext] || 'plaintext';
};

// Get file type from extension
const getFileType = (filename: string): 'code' | 'pdf' | 'image' => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    return 'code';
};

// Get icon for file
const getFileIcon = (file: FileItem) => {
    const type = file.type || getFileType(file.name);
    if (type === 'pdf') return <FileText size={14} className="tab-icon pdf" />;
    if (type === 'image') return <File size={14} className="tab-icon image" />;
    return <FileCode size={14} className="tab-icon code" />;
};

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
    files,
    activeFileId,
    onFileChange,
    onFileSelect,
    onFileClose,
    onFilesUpload,
    highlightedLines = [],
    readOnly = false,
    onCodeActivity,
    onSyntaxErrors,
}) => {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const activityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

    const activeFile = files.find((f) => f.id === activeFileId);
    const activeFileType = activeFile ? (activeFile.type || getFileType(activeFile.name)) : null;

    const handleEditorMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        updateHighlights();
    };

    const handleEditorChange = (value: string | undefined) => {
        if (activeFileId && value !== undefined) {
            onFileChange(activeFileId, value);

            // Debounced code activity tracking (500ms)
            if (activityDebounceRef.current) {
                clearTimeout(activityDebounceRef.current);
            }
            activityDebounceRef.current = setTimeout(() => {
                // Get cursor line
                const line = editorRef.current?.getPosition()?.lineNumber || 1;
                const fileName = activeFile?.name || '';

                // Report code activity for stuck detection
                if (onCodeActivity) {
                    onCodeActivity(value, fileName, line);
                }

                // Check for syntax errors
                if (onSyntaxErrors && monacoRef.current && activeFile) {
                    const model = editorRef.current?.getModel();
                    if (model) {
                        const markers = monacoRef.current.editor.getModelMarkers({ resource: model.uri });
                        const errors = markers
                            .filter(m => m.severity === monacoRef.current!.MarkerSeverity.Error)
                            .map(m => `${m.message} (line ${m.startLineNumber})`);
                        if (errors.length > 0) {
                            onSyntaxErrors(errors);
                        }
                    }
                }
            }, 500);
        }
    };

    const updateHighlights = useCallback(() => {
        if (!editorRef.current) return;

        // Clear previous decorations
        decorationsRef.current = editorRef.current.deltaDecorations(
            decorationsRef.current,
            []
        );

        if (highlightedLines.length === 0) return;

        // Add new decorations
        const newDecorations = highlightedLines.map((line) => ({
            range: {
                startLineNumber: line,
                startColumn: 1,
                endLineNumber: line,
                endColumn: 1,
            },
            options: {
                isWholeLine: true,
                className: 'highlighted-line',
                glyphMarginClassName: 'highlighted-glyph',
            },
        }));

        decorationsRef.current = editorRef.current.deltaDecorations(
            decorationsRef.current,
            newDecorations
        );
    }, [highlightedLines]);

    // Handle file drop
    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const droppedFiles = Array.from(e.dataTransfer.files);
            const newFiles: FileItem[] = [];

            for (const file of droppedFiles) {
                const fileType = getFileType(file.name);

                const content = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target?.result as string);
                    if (fileType === 'pdf' || fileType === 'image') {
                        reader.readAsDataURL(file);
                    } else {
                        reader.readAsText(file);
                    }
                });

                const fileItem: FileItem = {
                    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: file.name,
                    content,
                    language: fileType === 'code' ? getLanguageFromExtension(file.name) : fileType,
                    lastModified: new Date(file.lastModified),
                    type: fileType,
                };

                if (fileType === 'pdf') {
                    fileItem.extractedText = await extractTextFromPdf(content);
                }

                newFiles.push(fileItem);
            }

            onFilesUpload(newFiles);
        },
        [onFilesUpload]
    );

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    // Handle file input
    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputFiles = e.target.files;
        if (!inputFiles) return;

        const newFiles: FileItem[] = [];
        const fileArray = Array.from(inputFiles);

        for (const file of fileArray) {
            const fileType = getFileType(file.name);

            const content = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string);
                if (fileType === 'pdf' || fileType === 'image') {
                    reader.readAsDataURL(file);
                } else {
                    reader.readAsText(file);
                }
            });

            const fileItem: FileItem = {
                id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                content,
                language: fileType === 'code' ? getLanguageFromExtension(file.name) : fileType,
                lastModified: new Date(file.lastModified),
                type: fileType,
            };

            if (fileType === 'pdf') {
                fileItem.extractedText = await extractTextFromPdf(content);
            }

            newFiles.push(fileItem);
        }

        onFilesUpload(newFiles);

        // Reset input
        e.target.value = '';
    };

    // Render content based on file type
    const renderContent = () => {
        if (!activeFile) {
            return (
                <div className="empty-editor">
                    <div className="drop-zone">
                        <div className="drop-icon">📂</div>
                        <h3>Drop files here or click to upload</h3>
                        <p>Supports: Code files, PDFs, and images</p>
                        <label className="upload-button">
                            <input
                                type="file"
                                multiple
                                accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.html,.css,.json,.md,.sql,.sh,.yaml,.yml,.xml,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />
                            Choose Files
                        </label>
                    </div>
                </div>
            );
        }

        // PDF Viewer
        if (activeFileType === 'pdf') {
            return (
                <div className="pdf-embed-viewer">
                    <iframe
                        src={activeFile.content}
                        title={activeFile.name}
                        className="pdf-iframe-full"
                    />
                </div>
            );
        }

        // Image Viewer
        if (activeFileType === 'image') {
            return (
                <div className="image-viewer">
                    <img src={activeFile.content} alt={activeFile.name} />
                </div>
            );
        }

        // Code Editor
        return (
            <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                theme="vs-dark"
                options={{
                    readOnly,
                    minimap: { enabled: true },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineNumbers: 'on',
                    renderWhitespace: 'selection',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    glyphMargin: true,
                    folding: true,
                    lineDecorationsWidth: 10,
                    padding: { top: 10, bottom: 10 },
                }}
            />
        );
    };

    return (
        <div
            className="monaco-editor-container"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            {/* File Tabs */}
            <div className="editor-tabs">
                <div className="tabs-list">
                    {files.map((file) => {
                        const shortName = file.name.includes('/')
                            ? file.name.split('/').pop()
                            : file.name;
                        return (
                            <div
                                key={file.id}
                                className={`tab ${file.id === activeFileId ? 'active' : ''} ${file.type || getFileType(file.name)}`}
                                onClick={() => onFileSelect(file.id)}
                                title={file.name}
                            >
                                {getFileIcon(file)}
                                <span className="tab-name">{shortName}</span>
                                <button
                                    className="tab-close"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onFileClose(file.id);
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
                <label className="upload-btn">
                    <input
                        type="file"
                        multiple
                        accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.html,.css,.json,.md,.sql,.sh,.yaml,.yml,.xml,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                        onChange={handleFileInput}
                        style={{ display: 'none' }}
                    />
                    + Add File
                </label>
            </div>

            {/* Editor/Viewer Content */}
            <div className="editor-content">
                {renderContent()}
            </div>

            {/* Highlighted lines indicator (only for code files) */}
            {activeFileType === 'code' && highlightedLines.length > 0 && (
                <div className="highlight-indicator">
                    <span className="pulse-dot"></span>
                    <span>
                        Mentor discussing line{highlightedLines.length > 1 ? 's' : ''}{' '}
                        {highlightedLines.join(', ')}
                    </span>
                </div>
            )}
        </div>
    );
};

export default MonacoEditor;
export { getLanguageFromExtension, getFileType };
