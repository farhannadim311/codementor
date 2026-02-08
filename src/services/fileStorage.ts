// File Storage Service - Real File System via API
import type { FileItem } from '../components/MonacoEditor';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

export const initializeFileDatabase = async (): Promise<void> => {
    // No-op for real FS, or maybe check connection
    return Promise.resolve();
};

// Helper for language detection
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

// Save a single file
export const saveFile = async (file: FileItem): Promise<void> => {
    try {
        await fetch(`${API_URL}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: file.name,
                content: file.content
            })
        });
    } catch (error) {
        console.error('Failed to save file:', error);
        throw error;
    }
};

// Save all files
export const saveAllFiles = async (files: FileItem[]): Promise<void> => {
    await Promise.all(files.map(saveFile));
};

// Load all files
export const loadFiles = async (): Promise<FileItem[]> => {
    try {
        const response = await fetch(`${API_URL}/files`);
        if (!response.ok) {
            console.warn('Failed to fetch files list, defaulting to empty');
            return [];
        }

        const entries = await response.json();
        const loadedFiles: FileItem[] = [];

        // Filter for files only
        const fileEntries = entries.filter((e: any) => !e.isDirectory);

        // Fetch content in parallel
        await Promise.all(fileEntries.map(async (entry: any) => {
            try {
                // Skip if not a text file we likely support (basic filter)
                // This prevents loading huge binaries as text
                const ext = entry.name.split('.').pop()?.toLowerCase();
                const skipExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'zip', 'tar', 'gz'];
                if (ext && skipExts.includes(ext)) return;

                const contentRes = await fetch(`${API_URL}/files/content?path=${encodeURIComponent(entry.name)}`);
                if (contentRes.ok) {
                    const { content } = await contentRes.json();
                    loadedFiles.push({
                        id: `file_${entry.name}`, // Stable ID
                        name: entry.name,
                        content,
                        language: getLanguageFromExtension(entry.name),
                        lastModified: new Date(), // We could fetch stats if we wanted
                        type: 'code'
                    });
                }
            } catch (e) {
                console.error('Failed to load content for:', entry.name, e);
            }
        }));

        return loadedFiles;
    } catch (error) {
        console.error('Load files error:', error);
        return [];
    }
};

// Delete a file -> Now takes fileName (path)
export const deleteFile = async (fileName: string): Promise<void> => {
    try {
        await fetch(`${API_URL}/files?path=${encodeURIComponent(fileName)}`, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error('Failed to delete file:', error);
        throw error;
    }
};

// PDF Methods - No-ops for now or mapped to FS if strict text requirement is lifted
// For now, we just pretend to succeed to satisfy interfaces
export const savePdf = async (_pdf: { name: string; content: string }): Promise<void> => { };
export const loadPdf = async (): Promise<{ name: string; content: string } | null> => null;
export const deletePdf = async (_name: string): Promise<void> => { };

// Clear all files
export const clearAllFiles = async (): Promise<void> => {
    const files = await loadFiles();
    await Promise.all(files.map(f => deleteFile(f.name)));
};
