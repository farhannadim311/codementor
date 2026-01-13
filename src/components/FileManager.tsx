// File Manager Component - Sidebar with tree structure for file management
import { useState, useMemo } from 'react';
import {
    Folder,
    FolderOpen,
    File,
    Upload,
    Trash2,
    FileText,
    FileCode,
    ChevronRight,
    ChevronDown,
    Image,
    Plus,
    X,
} from 'lucide-react';
import type { FileItem } from './MonacoEditor';
import { extractTextFromPdf } from '../services/pdfParser';
import './FileManager.css';

interface FileManagerProps {
    files: FileItem[];
    activeFileId: string | null;
    onFileSelect: (fileId: string) => void;
    onFileDelete: (fileId: string) => void;
    onFilesUpload: (files: FileItem[]) => void;
    onFileCreate?: (file: FileItem) => void;
}

// Directory tree node
interface TreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    file?: FileItem;
    children: TreeNode[];
}

// Get file type from extension
const getFileType = (filename: string): 'code' | 'pdf' | 'image' => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    return 'code';
};

// Get icon based on file type
const getFileIcon = (filename: string) => {
    const type = getFileType(filename);
    if (type === 'pdf') return <FileText size={14} className="file-icon pdf" />;
    if (type === 'image') return <Image size={14} className="file-icon image" />;

    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const codeExts = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php'];
    if (codeExts.includes(ext)) {
        return <FileCode size={14} className="file-icon code" />;
    }
    return <File size={14} className="file-icon" />;
};

// Get language from extension
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
    };
    return languageMap[ext] || 'plaintext';
};

// Build directory tree from flat file list
const buildTree = (files: FileItem[]): TreeNode[] => {
    const root: TreeNode[] = [];

    files.forEach(file => {
        const parts = file.name.split('/');
        let currentLevel = root;
        let currentPath = '';

        parts.forEach((part, index) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const isFile = index === parts.length - 1;

            let existing = currentLevel.find(n => n.name === part);

            if (!existing) {
                existing = {
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'directory',
                    file: isFile ? file : undefined,
                    children: [],
                };
                currentLevel.push(existing);
            }

            if (!isFile) {
                currentLevel = existing.children;
            }
        });
    });

    // Sort: directories first, then files, alphabetically
    const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        nodes.forEach(n => {
            if (n.children.length > 0) {
                sortNodes(n.children);
            }
        });
    };

    sortNodes(root);
    return root;
};

// Tree node component
interface TreeNodeComponentProps {
    node: TreeNode;
    depth: number;
    activeFileId: string | null;
    expandedDirs: Set<string>;
    onToggleDir: (path: string) => void;
    onFileSelect: (fileId: string) => void;
    onFileDelete: (fileId: string) => void;
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
    node,
    depth,
    activeFileId,
    expandedDirs,
    onToggleDir,
    onFileSelect,
    onFileDelete,
}) => {
    const isExpanded = expandedDirs.has(node.path);

    if (node.type === 'directory') {
        return (
            <div className="tree-node">
                <div
                    className="tree-item directory"
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onClick={() => onToggleDir(node.path)}
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {isExpanded ? <FolderOpen size={14} className="folder-icon" /> : <Folder size={14} className="folder-icon" />}
                    <span className="tree-item-name">{node.name}</span>
                </div>
                {isExpanded && (
                    <div className="tree-children">
                        {node.children.map(child => (
                            <TreeNodeComponent
                                key={child.path}
                                node={child}
                                depth={depth + 1}
                                activeFileId={activeFileId}
                                expandedDirs={expandedDirs}
                                onToggleDir={onToggleDir}
                                onFileSelect={onFileSelect}
                                onFileDelete={onFileDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // File node
    const file = node.file!;
    const isActive = file.id === activeFileId;

    return (
        <div
            className={`tree-item file ${isActive ? 'active' : ''}`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => onFileSelect(file.id)}
        >
            {getFileIcon(file.name)}
            <span className="tree-item-name">{node.name}</span>
            <button
                className="delete-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    onFileDelete(file.id);
                }}
                title="Delete file"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
};

export const FileManager: React.FC<FileManagerProps> = ({
    files,
    activeFileId,
    onFileSelect,
    onFileDelete,
    onFilesUpload,
    onFileCreate,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isDragOver, setIsDragOver] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [showNewFileModal, setShowNewFileModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');

    // Build tree structure
    const tree = useMemo(() => buildTree(files), [files]);

    // Auto-expand first level directories
    useMemo(() => {
        const firstLevelDirs = tree
            .filter(n => n.type === 'directory')
            .map(n => n.path);
        setExpandedDirs(prev => {
            const newSet = new Set(prev);
            firstLevelDirs.forEach(d => newSet.add(d));
            return newSet;
        });
    }, [tree]);

    const handleToggleDir = (path: string) => {
        setExpandedDirs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        processFiles(droppedFiles);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputFiles = e.target.files;
        if (!inputFiles) return;
        processFiles(Array.from(inputFiles));
        e.target.value = '';
    };

    const processFiles = async (fileList: globalThis.File[]) => {
        const newFiles: FileItem[] = [];

        // Process each file
        for (const file of fileList) {
            const fileType = getFileType(file.name);

            // Read file content
            const content = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    resolve(event.target?.result as string);
                };
                if (fileType === 'pdf' || fileType === 'image') {
                    reader.readAsDataURL(file);
                } else {
                    reader.readAsText(file);
                }
            });

            // Create file item
            const fileItem: FileItem = {
                id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                content,
                language: fileType === 'code' ? getLanguageFromExtension(file.name) : fileType,
                lastModified: new Date(file.lastModified),
                type: fileType,
            };

            // Extract text from PDFs
            if (fileType === 'pdf') {
                console.log('[PDF Parser] Extracting text from:', file.name);
                fileItem.extractedText = await extractTextFromPdf(content);
                console.log('[PDF Parser] Extracted', fileItem.extractedText?.length || 0, 'characters');
            }

            newFiles.push(fileItem);
        }

        onFilesUpload(newFiles);
    };

    const handleCreateNewFile = () => {
        if (!newFileName.trim() || !onFileCreate) return;

        const fileName = newFileName.trim();
        const newFile: FileItem = {
            id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: fileName,
            content: '',
            language: getLanguageFromExtension(fileName),
            lastModified: new Date(),
            type: 'code',
        };

        onFileCreate(newFile);
        setNewFileName('');
        setShowNewFileModal(false);
    };

    return (
        <div
            className={`file-manager ${isDragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
        >
            <div className="file-manager-header">
                <button
                    className="folder-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Folder size={16} />
                    <span>Files</span>
                    <span className="file-count">{files.length}</span>
                </button>
                <div className="header-actions-group">
                    {onFileCreate && (
                        <button
                            className="new-file-btn"
                            title="New file"
                            onClick={() => setShowNewFileModal(true)}
                        >
                            <Plus size={16} />
                        </button>
                    )}
                    <label className="upload-icon-btn" title="Upload files">
                        <input
                            type="file"
                            multiple
                            accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.html,.css,.json,.md,.sql,.sh,.yaml,.yml,.xml,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                            onChange={handleFileInput}
                            style={{ display: 'none' }}
                        />
                        <Upload size={16} />
                    </label>
                </div>
            </div>

            {/* New File Modal */}
            {showNewFileModal && (
                <div className="new-file-modal-overlay" onClick={() => setShowNewFileModal(false)}>
                    <div className="new-file-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="new-file-modal-header">
                            <h4>New File</h4>
                            <button onClick={() => setShowNewFileModal(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            placeholder="filename.py"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateNewFile();
                                if (e.key === 'Escape') setShowNewFileModal(false);
                            }}
                        />
                        <div className="new-file-modal-actions">
                            <button className="cancel-btn" onClick={() => setShowNewFileModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="create-btn"
                                onClick={handleCreateNewFile}
                                disabled={!newFileName.trim()}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isExpanded && (
                <div className="file-list">
                    {tree.length > 0 ? (
                        <div className="file-tree">
                            {tree.map(node => (
                                <TreeNodeComponent
                                    key={node.path}
                                    node={node}
                                    depth={0}
                                    activeFileId={activeFileId}
                                    expandedDirs={expandedDirs}
                                    onToggleDir={handleToggleDir}
                                    onFileSelect={onFileSelect}
                                    onFileDelete={onFileDelete}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="empty-files">
                            <p>No files yet</p>
                            <label className="upload-link">
                                <input
                                    type="file"
                                    multiple
                                    accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.html,.css,.json,.md,.sql,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                                    onChange={handleFileInput}
                                    style={{ display: 'none' }}
                                />
                                Drop files here or click to upload
                            </label>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FileManager;
