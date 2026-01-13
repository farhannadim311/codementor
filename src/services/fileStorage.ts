// File Storage Service - IndexedDB persistence for uploaded files
import type { FileItem } from '../components/MonacoEditor';

const DB_NAME = 'codementor-files';
const DB_VERSION = 1;
const FILES_STORE = 'files';
const PDF_STORE = 'pdfs';

let db: IDBDatabase | null = null;

// Initialize database
export const initializeFileDatabase = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Files store
            if (!database.objectStoreNames.contains(FILES_STORE)) {
                database.createObjectStore(FILES_STORE, { keyPath: 'id' });
            }

            // PDF store
            if (!database.objectStoreNames.contains(PDF_STORE)) {
                database.createObjectStore(PDF_STORE, { keyPath: 'name' });
            }
        };
    });
};

// Save a single file
export const saveFile = async (file: FileItem): Promise<void> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([FILES_STORE], 'readwrite');
        const store = transaction.objectStore(FILES_STORE);

        const request = store.put({
            ...file,
            lastModified: file.lastModified.toISOString(),
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Save all files
export const saveAllFiles = async (files: FileItem[]): Promise<void> => {
    for (const file of files) {
        await saveFile(file);
    }
};

// Load all files
export const loadFiles = async (): Promise<FileItem[]> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([FILES_STORE], 'readonly');
        const store = transaction.objectStore(FILES_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const files = request.result.map((f: FileItem & { lastModified: string }) => ({
                ...f,
                lastModified: new Date(f.lastModified),
            }));
            resolve(files);
        };
        request.onerror = () => reject(request.error);
    });
};

// Delete a file
export const deleteFile = async (fileId: string): Promise<void> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([FILES_STORE], 'readwrite');
        const store = transaction.objectStore(FILES_STORE);
        const request = store.delete(fileId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Save PDF
export const savePdf = async (pdf: { name: string; content: string }): Promise<void> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([PDF_STORE], 'readwrite');
        const store = transaction.objectStore(PDF_STORE);
        const request = store.put(pdf);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Load PDF
export const loadPdf = async (): Promise<{ name: string; content: string } | null> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([PDF_STORE], 'readonly');
        const store = transaction.objectStore(PDF_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const pdfs = request.result;
            resolve(pdfs.length > 0 ? pdfs[0] : null);
        };
        request.onerror = () => reject(request.error);
    });
};

// Delete PDF
export const deletePdf = async (name: string): Promise<void> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([PDF_STORE], 'readwrite');
        const store = transaction.objectStore(PDF_STORE);
        const request = store.delete(name);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Clear all files
export const clearAllFiles = async (): Promise<void> => {
    if (!db) await initializeFileDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([FILES_STORE, PDF_STORE], 'readwrite');

        transaction.objectStore(FILES_STORE).clear();
        transaction.objectStore(PDF_STORE).clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};
