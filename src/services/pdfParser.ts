// PDF Parser Service - Extracts text from PDF files using pdf.js
import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker - use unpkg CDN which is more reliable
// Using legacy build for better compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Convert a base64 data URL to an ArrayBuffer
 */
function dataUrlToArrayBuffer(dataUrl: string): Uint8Array {
    // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
        throw new Error('Invalid data URL format');
    }

    // Decode base64 to binary string
    const binaryString = atob(base64);

    // Convert to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
}

/**
 * Extract text from a PDF file given its data URL
 * @param dataUrl - The base64 data URL of the PDF
 * @returns Promise<string> - The extracted text content
 */
export async function extractTextFromPdf(dataUrl: string): Promise<string> {
    try {
        // Convert data URL to ArrayBuffer
        const data = dataUrlToArrayBuffer(dataUrl);

        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;

        const textParts: string[] = [];

        // Extract text from each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Concatenate text items
            const pageText = textContent.items
                .map((item) => {
                    if ('str' in item) {
                        return item.str;
                    }
                    return '';
                })
                .join(' ');

            textParts.push(`[Page ${pageNum}]\n${pageText}`);
        }

        return textParts.join('\n\n');
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return `[Error extracting PDF text: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
}

/**
 * Check if a string is a valid PDF data URL
 */
export function isPdfDataUrl(dataUrl: string): boolean {
    return dataUrl.startsWith('data:application/pdf');
}
