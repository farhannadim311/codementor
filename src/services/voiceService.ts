// Voice Service - Centralized TTS using Gemini 3 API with browser fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type VoiceStyle = 'tutor' | 'helper' | 'neutral' | 'excited';

interface TTSResponse {
    audio: string | null;
    mimeType?: string;
    fallback: boolean;
    error?: string;
}

// Audio context for playing PCM audio
let audioContext: AudioContext | null = null;

// Queue for sequential playback
const audioQueue: Array<() => Promise<void>> = [];
let isPlaying = false;

// Get or create audio context
function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Create WAV header for PCM audio (24kHz, 16-bit, mono)
function createWavHeader(dataLength: number, sampleRate = 24000): ArrayBuffer {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataLength, true); // File size - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Chunk size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, 1, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataLength, true); // Data size

    return header;
}

// Play audio using HTML5 Audio element with Blob URL (more reliable)
async function playAudioData(audioData: string, mimeType?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // Convert base64 to Blob for better compatibility
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const mime = mimeType || 'audio/mpeg';
            const blob = new Blob([bytes], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            // Create audio element with blob URL
            const audio = new Audio(blobUrl);

            audio.onended = () => {
                URL.revokeObjectURL(blobUrl);
                resolve();
            };

            audio.onerror = (e) => {
                URL.revokeObjectURL(blobUrl);
                console.error('Audio playback error:', e);
                reject(new Error('Failed to play audio'));
            };

            // Play when ready
            audio.play().catch((err) => {
                URL.revokeObjectURL(blobUrl);
                reject(err);
            });
        } catch (error) {
            console.error('Error setting up audio:', error);
            reject(error);
        }
    });
}

// Browser TTS fallback
function speakWithBrowserTTS(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) {
            reject(new Error('Speech synthesis not supported'));
            return;
        }

        // Stop any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Find a good voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
            (v) => v.lang.startsWith('en') && v.name.includes('Google')
        ) || voices.find((v) => v.lang.startsWith('en'));

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.onend = () => resolve();
        utterance.onerror = (e) => reject(e);

        window.speechSynthesis.speak(utterance);
    });
}

// Process audio queue
async function processQueue() {
    if (isPlaying || audioQueue.length === 0) return;

    isPlaying = true;

    while (audioQueue.length > 0) {
        const playFn = audioQueue.shift();
        if (playFn) {
            try {
                await playFn();
            } catch (error) {
                console.error('Queue playback error:', error);
            }
        }
    }

    isPlaying = false;
}

/**
 * Speak text using Gemini TTS with browser fallback
 * @param text Text to speak
 * @param style Voice style preset
 * @param immediate If true, clears queue and plays immediately
 */
export async function speak(
    text: string,
    style: VoiceStyle = 'tutor',
    immediate = false
): Promise<void> {
    if (!text || text.trim().length === 0) return;

    // Clear queue if immediate
    if (immediate) {
        stop();
    }

    const playFn = async () => {
        try {
            // Try Gemini TTS first
            const response = await fetch(`${API_BASE_URL}/api/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim(), style }),
            });

            const result: TTSResponse = await response.json();

            if (!result.fallback && result.audio) {
                // Play Gemini-generated audio
                await playAudioData(result.audio, result.mimeType);
            } else {
                // Use browser TTS fallback
                console.log('Using browser TTS fallback:', result.error || 'No audio returned');
                await speakWithBrowserTTS(text);
            }
        } catch (error) {
            // Network error - use browser TTS
            console.error('TTS API error, using browser fallback:', error);
            await speakWithBrowserTTS(text);
        }
    };

    audioQueue.push(playFn);
    processQueue();
}

/**
 * Stop all audio playback
 */
export function stop(): void {
    // Clear queue
    audioQueue.length = 0;

    // Stop browser TTS
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    // Note: Web Audio API sources can't be stopped after starting,
    // they'll finish naturally
}

/**
 * Check if TTS is currently playing
 */
export function isSpeaking(): boolean {
    return isPlaying || (window.speechSynthesis?.speaking ?? false);
}

export default { speak, stop, isSpeaking };
