// Voice Interface Component - Real-time voice interaction with Gemini
import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader } from 'lucide-react';
import '../types/speech.d.ts';
import './VoiceInterface.css';

interface VoiceInterfaceProps {
    onTranscript: (text: string) => void;
    onSpeaking: (isSpeaking: boolean) => void;
    isProcessing?: boolean;
    aiResponse?: string;
}

export const VoiceInterface: React.FC<VoiceInterfaceProps> = ({
    onTranscript,
    onSpeaking,
    isProcessing = false,
    aiResponse,
}) => {
    const [isListening, setIsListening] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [audioLevel, setAudioLevel] = useState(0);

    const recognitionRef = useRef<any>(null);
    const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationRef = useRef<number | null>(null);

    useEffect(() => {
        // Initialize speech recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognitionClass =
                (window as any).webkitSpeechRecognition ||
                (window as any).SpeechRecognition;

            recognitionRef.current = new SpeechRecognitionClass();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event: any) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalTranscript += result[0].transcript;
                    } else {
                        interimTranscript += result[0].transcript;
                    }
                }

                setTranscript(interimTranscript || finalTranscript);

                if (finalTranscript) {
                    onTranscript(finalTranscript);
                    setTranscript('');
                }
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                if (isListening) {
                    // Restart if still supposed to be listening
                    recognitionRef.current?.start();
                }
            };
        }

        return () => {
            stopListening();
            stopSpeaking();
        };
    }, []);

    // Speak AI response
    useEffect(() => {
        if (aiResponse && !isMuted) {
            speakResponse(aiResponse);
        }
    }, [aiResponse, isMuted]);

    const startListening = async () => {
        if (!recognitionRef.current) {
            alert('Speech recognition not supported in this browser');
            return;
        }

        // Request microphone permission and set up audio analysis
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            // Start visualizing audio level
            const updateLevel = () => {
                if (!analyserRef.current) return;

                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);

                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setAudioLevel(average / 255);

                animationRef.current = requestAnimationFrame(updateLevel);
            };
            updateLevel();

            recognitionRef.current.start();
            setIsListening(true);
        } catch (error) {
            console.error('Failed to start microphone:', error);
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        setIsListening(false);
        setAudioLevel(0);
    };

    const speakResponse = (text: string) => {
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

        utterance.onstart = () => onSpeaking(true);
        utterance.onend = () => onSpeaking(false);
        utterance.onerror = () => onSpeaking(false);

        synthRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    };

    const stopSpeaking = () => {
        window.speechSynthesis.cancel();
        onSpeaking(false);
    };

    const toggleMute = () => {
        if (!isMuted) {
            stopSpeaking();
        }
        setIsMuted(!isMuted);
    };

    return (
        <div className="voice-interface">
            <div className="voice-controls">
                <button
                    className={`voice-btn ${isListening ? 'active' : ''}`}
                    onClick={isListening ? stopListening : startListening}
                    disabled={isProcessing}
                >
                    <div
                        className="voice-indicator"
                        style={{
                            transform: `scale(${1 + audioLevel * 0.5})`,
                            opacity: isListening ? 0.5 + audioLevel * 0.5 : 0,
                        }}
                    />
                    {isProcessing ? (
                        <Loader className="icon spinning" size={24} />
                    ) : isListening ? (
                        <Mic className="icon" size={24} />
                    ) : (
                        <MicOff className="icon" size={24} />
                    )}
                </button>

                <button
                    className={`mute-btn ${isMuted ? 'muted' : ''}`}
                    onClick={toggleMute}
                >
                    {isMuted ? (
                        <VolumeX className="icon" size={20} />
                    ) : (
                        <Volume2 className="icon" size={20} />
                    )}
                </button>
            </div>

            {transcript && (
                <div className="transcript-preview">
                    <span className="listening-dot" />
                    <span>{transcript}</span>
                </div>
            )}

            <div className="voice-status">
                {isProcessing && <span>Thinking...</span>}
                {isListening && !isProcessing && <span>Listening...</span>}
                {!isListening && !isProcessing && <span>Click mic to speak</span>}
            </div>
        </div>
    );
};

export default VoiceInterface;
