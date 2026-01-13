// Screen Capture Service

export interface CaptureOptions {
    video?: boolean;
    audio?: boolean;
}

// Add ImageCapture type declaration
declare class ImageCapture {
    constructor(videoTrack: MediaStreamTrack);
    grabFrame(): Promise<ImageBitmap>;
}

let mediaStream: MediaStream | null = null;
let isCapturing = false;

export const requestScreenCapture = async (
    options: CaptureOptions = {}
): Promise<MediaStream> => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: options.audio ?? false,
        });

        mediaStream = stream;
        isCapturing = true;

        // Handle stream ending (user clicks "Stop sharing")
        stream.getVideoTracks()[0].onended = () => {
            isCapturing = false;
            mediaStream = null;
        };

        return stream;
    } catch (error) {
        console.error('Screen capture failed:', error);
        throw error;
    }
};

export const captureScreenshot = async (): Promise<string> => {
    if (!mediaStream || !isCapturing) {
        throw new Error('Screen capture not active. Call requestScreenCapture first.');
    }

    const videoTrack = mediaStream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);

    try {
        const bitmap = await imageCapture.grabFrame();

        // Convert to canvas and then to base64
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get canvas context');
        }

        ctx.drawImage(bitmap, 0, 0);

        // Return as base64 PNG
        return canvas.toDataURL('image/png');
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        throw error;
    }
};

export const stopScreenCapture = (): void => {
    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
    }
    isCapturing = false;
};

export const getIsCapturing = (): boolean => isCapturing;

// Periodic screenshot capture for context analysis
let captureInterval: ReturnType<typeof setInterval> | null = null;
let screenshotCallbacks: ((screenshot: string) => void)[] = [];

export const startPeriodicCapture = (
    intervalMs: number = 5000
): void => {
    if (captureInterval) {
        clearInterval(captureInterval);
    }

    captureInterval = setInterval(async () => {
        if (isCapturing) {
            try {
                const screenshot = await captureScreenshot();
                screenshotCallbacks.forEach((cb) => cb(screenshot));
            } catch (error) {
                console.error('Periodic capture failed:', error);
            }
        }
    }, intervalMs);
};

export const stopPeriodicCapture = (): void => {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
};

export const onScreenshotCaptured = (
    callback: (screenshot: string) => void
): (() => void) => {
    screenshotCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
        screenshotCallbacks = screenshotCallbacks.filter((cb) => cb !== callback);
    };
};
