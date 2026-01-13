// GitHub Service - Clone repos via GitHub API
import type { FileItem } from '../components/MonacoEditor';

interface GitHubFile {
    name: string;
    path: string;
    type: 'file' | 'dir';
    download_url: string | null;
    sha: string;
}

interface GitHubTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
}

interface GitHubTreeResponse {
    sha: string;
    url: string;
    tree: GitHubTreeItem[];
    truncated: boolean;
}

// Parse GitHub URL to extract owner and repo
export const parseGitHubUrl = (url: string): { owner: string; repo: string; branch?: string } | null => {
    // Support formats:
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // https://github.com/owner/repo/tree/branch
    // github.com/owner/repo
    // owner/repo

    try {
        let cleanUrl = url.trim();

        // Remove .git suffix
        if (cleanUrl.endsWith('.git')) {
            cleanUrl = cleanUrl.slice(0, -4);
        }

        // Handle full URLs
        if (cleanUrl.includes('github.com')) {
            const urlObj = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
            const parts = urlObj.pathname.split('/').filter(Boolean);

            if (parts.length >= 2) {
                const owner = parts[0];
                const repo = parts[1];
                const branch = parts[2] === 'tree' && parts[3] ? parts[3] : undefined;
                return { owner, repo, branch };
            }
        }

        // Handle owner/repo format
        const simpleParts = cleanUrl.split('/').filter(Boolean);
        if (simpleParts.length === 2) {
            return { owner: simpleParts[0], repo: simpleParts[1] };
        }

        return null;
    } catch {
        return null;
    }
};

// Get language from file extension
const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        py: 'python',
        java: 'java',
        c: 'c',
        cpp: 'cpp',
        h: 'c',
        hpp: 'cpp',
        cs: 'csharp',
        go: 'go',
        rs: 'rust',
        rb: 'ruby',
        php: 'php',
        html: 'html',
        css: 'css',
        scss: 'scss',
        less: 'less',
        json: 'json',
        md: 'markdown',
        sql: 'sql',
        sh: 'shell',
        bash: 'shell',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        txt: 'plaintext',
        vue: 'vue',
        svelte: 'svelte',
    };
    return languageMap[ext] || 'plaintext';
};

// Check if file should be included (skip large/binary files)
const shouldIncludeFile = (path: string): boolean => {
    const ext = path.split('.').pop()?.toLowerCase() || '';

    // Skip binary/non-text files
    const binaryExts = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
        'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm',
        'zip', 'tar', 'gz', 'rar', '7z',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'exe', 'dll', 'so', 'dylib',
        'woff', 'woff2', 'ttf', 'eot', 'otf',
        'pyc', 'class', 'o', 'obj',
    ];

    if (binaryExts.includes(ext)) return false;

    // Skip common directories
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv'];
    if (skipDirs.some(dir => path.includes(`/${dir}/`) || path.startsWith(`${dir}/`))) {
        return false;
    }

    return true;
};

// Fetch repository tree
export const fetchRepoTree = async (
    owner: string,
    repo: string,
    branch: string = 'main'
): Promise<GitHubTreeItem[]> => {
    // First try the specified branch, then try 'master' as fallback
    const branches = [branch, 'master'];

    for (const b of branches) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${b}?recursive=1`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                    },
                }
            );

            if (response.ok) {
                const data: GitHubTreeResponse = await response.json();
                return data.tree.filter(item =>
                    item.type === 'blob' && shouldIncludeFile(item.path)
                );
            }
        } catch {
            continue;
        }
    }

    throw new Error(`Could not access repository ${owner}/${repo}. Make sure it's public.`);
};

// Fetch file content
export const fetchFileContent = async (
    owner: string,
    repo: string,
    path: string,
    branch: string = 'main'
): Promise<string> => {
    // Try specified branch first, then master
    const branches = [branch, 'master'];

    for (const b of branches) {
        try {
            const response = await fetch(
                `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${path}`
            );

            if (response.ok) {
                return await response.text();
            }
        } catch {
            continue;
        }
    }

    throw new Error(`Could not fetch file: ${path}`);
};

// Clone a repository - returns all files
export const cloneRepository = async (
    repoUrl: string,
    onProgress?: (message: string, progress: number) => void
): Promise<FileItem[]> => {
    const parsed = parseGitHubUrl(repoUrl);

    if (!parsed) {
        throw new Error('Invalid GitHub URL. Use format: https://github.com/owner/repo');
    }

    const { owner, repo, branch } = parsed;

    onProgress?.(`Fetching repository structure for ${owner}/${repo}...`, 10);

    // Fetch file tree
    const tree = await fetchRepoTree(owner, repo, branch);

    if (tree.length === 0) {
        throw new Error('Repository is empty or has no text files');
    }

    // Limit files to prevent overwhelming the browser
    const maxFiles = 100;
    const filesToFetch = tree.slice(0, maxFiles);

    if (tree.length > maxFiles) {
        onProgress?.(`Repository has ${tree.length} files. Fetching first ${maxFiles}...`, 15);
    }

    const files: FileItem[] = [];

    // Fetch each file
    for (let i = 0; i < filesToFetch.length; i++) {
        const item = filesToFetch[i];
        const progress = 15 + (i / filesToFetch.length) * 80;

        onProgress?.(`Fetching: ${item.path}`, progress);

        try {
            const content = await fetchFileContent(owner, repo, item.path, branch);

            files.push({
                id: `github_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: item.path.includes('/') ? item.path : item.path,
                content,
                language: getLanguageFromPath(item.path),
                lastModified: new Date(),
                type: 'code',
            });
        } catch {
            // Skip files that fail to fetch
            console.warn(`Failed to fetch: ${item.path}`);
        }

        // Small delay to avoid rate limiting
        if (i % 10 === 0 && i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    onProgress?.(`Cloned ${files.length} files from ${owner}/${repo}`, 100);

    return files;
};

export default {
    parseGitHubUrl,
    fetchRepoTree,
    fetchFileContent,
    cloneRepository,
};
