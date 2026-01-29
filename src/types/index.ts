// CodeMentor Type Definitions

export interface LearningProfile {
  id: string;
  createdAt: Date;
  lastSessionAt: Date;
  totalSessions: number;
  totalCodingTime: number; // in minutes
  topics: TopicProgress[];
  weaknesses: Weakness[];
  strengths: string[];
}

export interface TopicProgress {
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  timeSpent: number; // in minutes
  successRate: number; // 0-100
  lastPracticed: Date;
  struggles: string[];
}

export interface Weakness {
  topic: string;
  description: string;
  occurrences: number;
  lastOccurred: Date;
  suggestedExercises: string[];
}

export interface CodingSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  files: FileContext[];
  interactions: Interaction[];
  stuckMoments: StuckMoment[];
}

export interface FileContext {
  filename: string;
  language: string;
  content: string;
  lastModified: Date;
}

export interface Interaction {
  id: string;
  timestamp: Date;
  type: 'voice' | 'text';
  userMessage?: string;
  aiResponse: string;
  highlightedLines?: number[];
  highlightedFile?: string;
  thinkingSummary?: string;
  isStreaming?: boolean;
}

export interface StuckMoment {
  timestamp: Date;
  file: string;
  line: number;
  duration: number; // seconds without meaningful change
  resolved: boolean;
  resolution?: string;
}

export interface ScreenContext {
  timestamp: Date;
  screenshot?: string; // base64
  detectedCode: string;
  detectedLanguage: string;
  detectedErrors: string[];
  assignmentContext?: string;
}

export interface Hint {
  level: 1 | 2 | 3 | 4 | 5; // 1 = vague, 5 = very specific
  content: string;
  pseudocode?: string;
  visualAid?: string;
}

export interface Curriculum {
  id: string;
  createdAt: Date;
  basedOnWeaknesses: string[];
  modules: CurriculumModule[];
  currentModuleIndex: number;
}

export interface CurriculumModule {
  id: string;
  topic: string;
  description: string;
  exercises: Exercise[];
  completed: boolean;
}

export interface Exercise {
  id: string;
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hints: Hint[];
  completed: boolean;
  attempts: number;
}

export interface TeachingMode {
  type: 'socratic' | 'guided' | 'hint-only';
  maxHintLevel: number;
  allowPseudocode: boolean;
  allowVisuals: boolean;
}
