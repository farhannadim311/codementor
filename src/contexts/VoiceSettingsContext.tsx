// Voice Settings Context - Global voice preferences
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { VoiceStyle } from '../services/voiceService';

interface VoiceSettings {
    enabled: boolean;
    style: VoiceStyle;
}

interface VoiceSettingsContextType {
    voiceEnabled: boolean;
    voiceStyle: VoiceStyle;
    toggleVoice: () => void;
    setVoiceStyle: (style: VoiceStyle) => void;
    setVoiceEnabled: (enabled: boolean) => void;
}

const VoiceSettingsContext = createContext<VoiceSettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'codementor_voice_settings';

// Load settings from localStorage
function loadSettings(): VoiceSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error('Failed to load voice settings:', error);
    }
    return { enabled: false, style: 'tutor' };
}

// Save settings to localStorage
function saveSettings(settings: VoiceSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save voice settings:', error);
    }
}

interface VoiceSettingsProviderProps {
    children: ReactNode;
}

export function VoiceSettingsProvider({ children }: VoiceSettingsProviderProps) {
    const [settings, setSettings] = useState<VoiceSettings>(loadSettings);

    // Persist settings when they change
    useEffect(() => {
        saveSettings(settings);
    }, [settings]);

    const toggleVoice = () => {
        setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
    };

    const setVoiceStyle = (style: VoiceStyle) => {
        setSettings(prev => ({ ...prev, style }));
    };

    const setVoiceEnabled = (enabled: boolean) => {
        setSettings(prev => ({ ...prev, enabled }));
    };

    return (
        <VoiceSettingsContext.Provider
            value={{
                voiceEnabled: settings.enabled,
                voiceStyle: settings.style,
                toggleVoice,
                setVoiceStyle,
                setVoiceEnabled,
            }}
        >
            {children}
        </VoiceSettingsContext.Provider>
    );
}

export function useVoiceSettings(): VoiceSettingsContextType {
    const context = useContext(VoiceSettingsContext);
    if (context === undefined) {
        throw new Error('useVoiceSettings must be used within a VoiceSettingsProvider');
    }
    return context;
}

export default VoiceSettingsContext;
