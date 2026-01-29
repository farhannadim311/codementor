// Main Application Component
import { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  MessageSquare,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Zap,
  X,
  Loader,
  FolderOpen,
  Github,
  Trash2,
  Terminal as TerminalIcon,
  Brain,
  Code2,
} from 'lucide-react';
import { MonacoEditor, type FileItem } from './components/MonacoEditor';
import { FileManager } from './components/FileManager';
import { GitHubClone } from './components/GitHubClone';
import { VoiceInterface } from './components/VoiceInterface';
import { TeachingChat } from './components/TeachingChat';
import { ProgressDashboard } from './components/ProgressDashboard';
import { Terminal, type TerminalOutput, type CompilerInfo } from './components/Terminal';
import { ExplainItBack } from './components/ExplainItBack';
import { CodeReviewMode } from './components/CodeReviewMode';
import {
  checkBackendHealth,
  streamTeachingResponse,
  getCompilers,
  executeCode,
} from './services/gemini';
import {
  initializeDatabase,
  getProfile,
  saveProfile,
  createDefaultProfile,
  createSession,
  saveSession,
} from './services/learningProfile';
import {
  initializeFileDatabase,
  loadFiles,
  saveFile,
  deleteFile as deleteStoredFile,
  clearAllFiles,
} from './services/fileStorage';
import { initializeStuckDetector, getStuckDetector } from './agents/stuckDetector';
import { initializeWeaknessDetector } from './agents/weaknessDetector';
import { initializeCurriculumGenerator } from './agents/curriculumGenerator';
import NudgePopup from './components/NudgePopup';
import type { LearningProfile, CodingSession, Interaction, StuckMoment } from './types';
import './types/speech.d.ts';
import './styles/globals.css';
import './App.css';

type View = 'code' | 'chat' | 'progress';
type Mode = 'voice' | 'text';

function App() {
  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [currentView, setCurrentView] = useState<View>('code');
  const [interactionMode, setInteractionMode] = useState<Mode>('text');
  const [showFileManager, setShowFileManager] = useState(true);

  // File state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showGitHubClone, setShowGitHubClone] = useState(false);

  // UI state
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);

  // Chat state
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentHintLevel, setCurrentHintLevel] = useState(1);

  // Profile state
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [session, setSession] = useState<CodingSession | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  // Nudge popup state
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeInfo, setNudgeInfo] = useState<{ reason: string; file?: string; line?: number }>({ reason: '' });

  // Terminal state
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalOutput, setTerminalOutput] = useState<TerminalOutput[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastExitCode, setLastExitCode] = useState<number | undefined>(undefined);
  const [compilers, setCompilers] = useState<CompilerInfo[]>([]);

  // Explain It Back modal state
  const [showExplainItBack, setShowExplainItBack] = useState(false);

  // Code Review modal state
  const [showCodeReview, setShowCodeReview] = useState(false);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);

      // Check if backend is running
      const isHealthy = await checkBackendHealth();
      setBackendConnected(isHealthy);

      if (!isHealthy) {
        setIsLoading(false);
        return;
      }

      await initializeDatabase();
      await initializeFileDatabase();

      // Load saved files
      const savedFiles = await loadFiles();
      if (savedFiles.length > 0) {
        setFiles(savedFiles);
        setActiveFileId(savedFiles[0].id);
      }

      const existingProfile = await getProfile();

      if (existingProfile) {
        setProfile(existingProfile);
      } else {
        const newProfile = createDefaultProfile();
        await saveProfile(newProfile);
        setProfile(newProfile);
      }

      // Initialize agents
      const detector = initializeStuckDetector({
        onStuckDetected: handleStuckDetected,
        onIdleDetected: handleIdleDetected,
      });
      detector.start(); // Start the detection loop!
      const weaknessAgent = initializeWeaknessDetector();
      weaknessAgent.setWeaknessCallback(async (weakness) => {
        showNotification('info', `New area to improve detected: ${weakness.topic}`);
        // Reload profile to get updates
        const updated = await getProfile();
        if (updated) setProfile(updated);
      });
      weaknessAgent.setStrengthCallback(async (strength) => {
        showNotification('success', `New strength detected: ${strength}! Keep it up!`);
        const updated = await getProfile();
        if (updated) setProfile(updated);
      });
      weaknessAgent.setResolvedCallback(async (topic) => {
        showNotification('success', `Awesome! You've improved on: ${topic}. It has been removed from your focus areas.`);
        const updated = await getProfile();
        if (updated) setProfile(updated);
      });
      // Run analysis every 5 minutes (for demo purposes)
      weaknessAgent.startPeriodicAnalysis(5 * 60 * 1000);

      initializeCurriculumGenerator();

      // Start a new session
      const newSession = createSession();
      setSession(newSession);

      // Load available compilers
      const compilersData = await getCompilers();
      setCompilers(compilersData.available);

      setIsLoading(false);
    };

    init();
  }, []);

  // Save session periodically
  useEffect(() => {
    if (session) {
      const interval = setInterval(async () => {
        // Only track if not idle (check stuck detector state)
        const detector = getStuckDetector();
        const stats = detector?.getStats();
        // If modified within last minute, count as active
        const isActive = stats && stats.timeSinceLastChange < 60000;

        if (isActive) {
          saveSession(session);

          if (profile) {
            const updatedProfile = { ...profile };
            updatedProfile.totalCodingTime += 0.5; // (0.5 mins)
            updatedProfile.lastSessionAt = new Date();

            // Simple topic tracking based on active file
            const activeFile = files.find(f => f.id === activeFileId);
            if (activeFile) {
              const lang = activeFile.language;
              const existingTopic = updatedProfile.topics.find(t => t.topic === lang);

              if (existingTopic) {
                existingTopic.timeSpent += 0.5;
                existingTopic.lastPracticed = new Date();
              } else {
                updatedProfile.topics.push({
                  topic: lang,
                  level: 'beginner',
                  timeSpent: 0.5,
                  successRate: 0,
                  lastPracticed: new Date(),
                  struggles: []
                });
              }
            }

            setProfile(updatedProfile);
            await saveProfile(updatedProfile);
          }
        }
      }, 30000); // Every 30 seconds

      return () => clearInterval(interval);
    }
  }, [session, profile, files, activeFileId]);

  const handleStuckDetected = useCallback((moment: StuckMoment, reason: string) => {
    // Show nudge popup instead of just a notification
    setNudgeInfo({ reason, file: moment.file, line: moment.line });
    setShowNudge(true);

    // Add stuck moment to session
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stuckMoments: [...prev.stuckMoments, moment],
      };
    });
  }, []);

  const handleIdleDetected = useCallback(() => {
    showNotification('info', `Taking a break? Remember, consistent practice is key! 🎯`);
  }, []);

  // Handle code activity for stuck detection
  const handleCodeActivity = useCallback((code: string, file: string, line: number) => {
    const detector = getStuckDetector();
    if (detector) {
      const ext = file.split('.').pop() || '';
      detector.updateContext({
        timestamp: new Date(),
        detectedCode: code,
        detectedLanguage: ext,
        detectedErrors: []
      });
      detector.updateCursor(file, line);
    }
  }, []);

  // Handle syntax errors for stuck detection
  const handleSyntaxErrors = useCallback((errors: string[]) => {
    const detector = getStuckDetector();
    if (detector) {
      detector.updateContext({
        timestamp: new Date(),
        detectedCode: '',
        detectedLanguage: '',
        detectedErrors: errors
      });
    }
  }, []);

  // Handle nudge dismiss
  const handleNudgeDismiss = useCallback(() => {
    setShowNudge(false);
    getStuckDetector()?.acknowledgeHelp();
  }, []);

  // Run code in terminal
  const handleRunCode = useCallback(async () => {
    const activeFile = files.find((f) => f.id === activeFileId);
    if (!activeFile || activeFile.type !== 'code') return;

    setIsExecuting(true);
    setLastExitCode(undefined);

    // Add command line to output
    setTerminalOutput((prev) => [
      ...prev,
      {
        type: 'command',
        content: `Running ${activeFile.name}...`,
        timestamp: new Date(),
      },
    ]);

    try {
      // Collect additional files (data files in the same directory or all text files)
      // These are files referenced by the code (like words.txt, input.txt, etc.)
      const additionalFiles = files
        .filter(f =>
          f.id !== activeFileId && // Not the main file
          f.type !== 'image' &&     // Not images
          f.type !== 'pdf' &&       // Not PDFs  
          f.content                  // Has content
        )
        .map(f => ({ name: f.name, content: f.content }));

      const result = await executeCode(activeFile.content, activeFile.name, additionalFiles);

      // Add output
      const newOutput: TerminalOutput[] = [];

      if (result.stdout) {
        newOutput.push({
          type: 'stdout',
          content: result.stdout,
          timestamp: new Date(),
        });
      }

      if (result.stderr) {
        newOutput.push({
          type: 'stderr',
          content: result.stderr,
          timestamp: new Date(),
        });
      }

      // Add execution summary
      newOutput.push({
        type: 'system',
        content: `\n[${result.language}] Process exited with code ${result.exitCode} (${result.executionTime}ms)`,
        timestamp: new Date(),
      });

      setTerminalOutput((prev) => [...prev, ...newOutput]);
      setLastExitCode(result.exitCode);

      // If there were errors, offer to send to AI
      if (result.stderr && result.exitCode !== 0) {
        showNotification('info', 'Runtime error detected. Ask the AI tutor for help!');
      }
    } catch (error) {
      setTerminalOutput((prev) => [
        ...prev,
        {
          type: 'stderr',
          content: error instanceof Error ? error.message : 'Execution failed',
          timestamp: new Date(),
        },
      ]);
      setLastExitCode(1);
    } finally {
      setIsExecuting(false);
    }
  }, [activeFileId, files]);

  // Clear terminal output
  const handleClearTerminal = useCallback(() => {
    setTerminalOutput([]);
    setLastExitCode(undefined);
  }, []);

  const showNotification = (
    type: 'success' | 'error' | 'warning' | 'info',
    message: string
  ) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // File handlers
  const handleFileChange = async (fileId: string, content: string) => {
    const updatedFile = files.find(f => f.id === fileId);
    if (updatedFile) {
      const newFile = { ...updatedFile, content, lastModified: new Date() };
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? newFile : f))
      );
      // Save to IndexedDB
      await saveFile(newFile);
    }
  };

  const handleFileSelect = (fileId: string) => {
    setActiveFileId(fileId);
  };

  const handleFileClose = async (fileId: string) => {
    const fileToDelete = files.find((f) => f.id === fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));

    if (fileToDelete) {
      await deleteStoredFile(fileToDelete.name);
    }

    if (activeFileId === fileId) {
      const remaining = files.filter((f) => f.id !== fileId);
      setActiveFileId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleFileDelete = async (fileId: string) => {
    await handleFileClose(fileId);
    showNotification('info', 'File removed');
  };

  const handleFilesUpload = async (newFiles: FileItem[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    if (newFiles.length > 0 && !activeFileId) {
      setActiveFileId(newFiles[0].id);
    }
    // Save all to IndexedDB
    for (const file of newFiles) {
      await saveFile(file);
    }
    showNotification('success', `${newFiles.length} file(s) uploaded`);
  };

  // Replace all files (used for GitHub clone - clears existing files first)
  const handleReplaceFiles = async (newFiles: FileItem[]) => {
    // Clear existing files from IndexedDB
    await clearAllFiles();
    // Replace state with new files
    setFiles(newFiles);
    if (newFiles.length > 0) {
      setActiveFileId(newFiles[0].id);
    } else {
      setActiveFileId(null);
    }
    // Save all new files to IndexedDB
    for (const file of newFiles) {
      await saveFile(file);
    }
    showNotification('success', `Cloned ${newFiles.length} file(s)`);
  };

  // Clear all files and start fresh
  const handleClearAll = async () => {
    await clearAllFiles();
    setFiles([]);
    setActiveFileId(null);
    setInteractions([]);
    showNotification('info', 'Workspace cleared. Ready to start fresh!');
  };

  // Create a new blank file
  const handleFileCreate = async (newFile: FileItem) => {
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    await saveFile(newFile);
    showNotification('success', `Created ${newFile.name}`);
  };

  // Get all files content for AI context (skip PDFs and images)
  const getAllFilesContext = (): string => {
    const codeFiles = files.filter(f => !f.type || f.type === 'code');
    if (codeFiles.length === 0) return '';

    return codeFiles
      .map((f) => `=== ${f.name} (${f.language}) ===\n${f.content}`)
      .join('\n\n');
  };

  // Get active file content
  const getActiveFileContent = (): string => {
    const activeFile = files.find((f) => f.id === activeFileId);
    return activeFile?.content || '';
  };

  const handleSendMessage = async (message: string) => {
    if (!backendConnected) {
      showNotification('error', 'Backend not connected. Start the server first.');
      return;
    }

    setIsProcessing(true);

    // Build context from all files
    const allFilesContext = getAllFilesContext();
    const activeFileContent = getActiveFileContent();
    const activeFile = files.find((f) => f.id === activeFileId);

    // Build learning history
    const learningHistory = session
      ? `Previous interactions: ${session.interactions.length}. Topics discussed: ${[...new Set(interactions.map((i) => i.aiResponse).join(' ').match(/\b(loop|array|function|variable|recursion|object|class)\b/gi) || [])].join(', ') || 'general coding'
      }`
      : '';

    // Include file context in the message
    // Get PDF content for AI context (use extracted text if available)
    const pdfFiles = files.filter(f => f.type === 'pdf');
    const pdfContext = pdfFiles.map(f => {
      if (f.extractedText) {
        return `[Assignment PDF - ${f.name}]\n${f.extractedText}`;
      }
      return `[Assignment PDF: ${f.name} (text not extracted)]`;
    }).join('\n\n');

    const contextualMessage = `
${allFilesContext ? `[Files in workspace:\n${allFilesContext}]` : ''}
${activeFile ? `[Currently viewing: ${activeFile.name}]` : ''}
${pdfContext ? `\n${pdfContext}` : ''}

Student's question: ${message}`;

    try {
      // 1. Create placeholder interaction
      const interactionId = `int_${Date.now()}`;
      const newInteraction: Interaction = {
        id: interactionId,
        timestamp: new Date(),
        type: interactionMode,
        userMessage: message,
        aiResponse: '',
        thinkingSummary: '',
        isStreaming: true,
      };

      setInteractions((prev) => [...prev, newInteraction]);

      // 2. Get adaptive hint level and struggle context from stuck detector
      const detector = getStuckDetector();
      const adaptiveHintLevel = detector?.getAdaptiveHintLevel() || currentHintLevel;
      const struggleContext = detector?.getStruggleContext() || '';

      // Use the higher of: current hint level or adaptive level
      const effectiveHintLevel = Math.max(currentHintLevel, adaptiveHintLevel);

      // 3. Start stream with adaptive context
      const stream = streamTeachingResponse(
        contextualMessage,
        activeFileContent,
        learningHistory,
        effectiveHintLevel,
        undefined, // pdfContent already in contextualMessage
        struggleContext
      );

      let fullResponse = '';
      let fullThought = '';

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullResponse += chunk.content;
        } else if (chunk.type === 'thought') {
          fullThought += chunk.content;
        }

        setInteractions((prev) =>
          prev.map((i) =>
            i.id === interactionId
              ? { ...i, aiResponse: fullResponse, thinkingSummary: fullThought }
              : i
          )
        );
      }

      // 4. Finalize
      setInteractions((prev) =>
        prev.map((i) =>
          i.id === interactionId
            ? { ...i, isStreaming: false }
            : i
        )
      );

      // Extract line numbers from final response (simple regex check)
      const lineMatches = fullResponse.match(/lines?\s+(\d+)(?:\s*-\s*(\d+))?/gi);
      const highlightLines: number[] = [];
      if (lineMatches) {
        lineMatches.forEach((match) => {
          const nums = match.match(/\d+/g);
          if (nums) {
            const start = parseInt(nums[0]);
            const end = nums[1] ? parseInt(nums[1]) : start;
            for (let i = start; i <= end; i++) {
              highlightLines.push(i);
            }
          }
        });
      }

      setHighlightedLines([...new Set(highlightLines)]);

      // Update session
      setSession((prev) => {
        if (!prev) return prev;
        const completeInteraction = {
          ...newInteraction,
          aiResponse: fullResponse,
          thinkingSummary: fullThought,
          highlightedLines: [...new Set(highlightLines)],
          isStreaming: false
        };
        return {
          ...prev,
          interactions: [...prev.interactions, completeInteraction],
        };
      });

      // Acknowledge help in stuck detector
      getStuckDetector()?.acknowledgeHelp();
    } catch (error) {
      showNotification('error', 'Failed to get response. Please try again.');
      // Remove the failed interaction
      setInteractions(prev => prev.filter(i => i.aiResponse || i.thinkingSummary));
      console.error('Teaching response error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestHint = () => {
    // Record hint request with the stuck detector for adaptive difficulty
    const detector = getStuckDetector();
    const activeFile = files.find((f) => f.id === activeFileId);
    detector?.recordHintRequest(activeFile?.name);

    // Increase manual hint level (user explicitly asking for more help)
    setCurrentHintLevel((prev) => Math.min(prev + 1, 5));

    handleSendMessage("I'm stuck. Can you give me a hint without giving away the answer?");
  };

  const handleVoiceTranscript = (text: string) => {
    handleSendMessage(text);
  };

  const handleSpeaking = (_speaking: boolean) => {
    // Could trigger highlighting animation
  };

  const handleStartPractice = (topic: string, prompt?: string) => {
    showNotification('info', `Starting practice for: ${topic}`);

    // Create a new exercise file with starter code template
    const sanitizedTopic = topic.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const timestamp = Date.now();
    const exerciseFileName = `exercise_${sanitizedTopic}_${timestamp}.js`;

    // Generate starter code template based on the topic
    const starterCode = `/**
 * 🎯 Exercise: ${topic}
 * ${prompt ? `\n * Challenge: ${prompt}` : ''}
 * 
 * Instructions:
 * 1. Read the problem carefully
 * 2. Write your solution below
 * 3. Ask CodeMentor for hints if you get stuck!
 * 
 * Good luck! 💪
 */

// TODO: Write your solution here
function solution() {
  // Your code goes here
  
}

// Test your solution
// solution();
`;

    // Create the new file
    const newFile: FileItem = {
      id: `exercise-${timestamp}`,
      name: exerciseFileName,
      content: starterCode,
      type: 'code',
      language: 'javascript',
      lastModified: new Date(),
    };

    setFiles(prevFiles => [...prevFiles, newFile]);
    setActiveFileId(newFile.id);

    // Switch to editor view and then to chat
    setCurrentView('chat');

    // Send message to CodeMentor to start the exercise
    if (prompt) {
      handleSendMessage(`I've created a new file "${exerciseFileName}" for this exercise. The challenge is: "${prompt}". Please guide me step by step on how to approach this problem on ${topic}.`);
    } else {
      handleSendMessage(`I've created a new file "${exerciseFileName}" to practice ${topic}. Can you give me a problem to solve and guide me through it?`);
    }
  };

  const handleRetryConnection = async () => {
    setIsLoading(true);
    const isHealthy = await checkBackendHealth();
    setBackendConnected(isHealthy);
    if (isHealthy) {
      window.location.reload();
    } else {
      setIsLoading(false);
    }
  };

  // Loading screen
  if (isLoading) {
    return (
      <div className="config-screen">
        <div className="config-card">
          <div className="config-header">
            <div className="logo">
              <Loader className="spinning" size={32} />
              <h1>CodeMentor</h1>
            </div>
            <p>Connecting to server...</p>
          </div>
        </div>
      </div>
    );
  }

  // Backend not connected
  if (!backendConnected) {
    return (
      <div className="config-screen">
        <div className="config-card">
          <div className="config-header">
            <div className="logo">
              <AlertCircle size={32} style={{ color: 'var(--accent-error)' }} />
              <h1>CodeMentor</h1>
            </div>
            <p>Cannot connect to the backend server.</p>
          </div>

          <div className="features">
            <div className="feature">
              <span>1. Create a <code>.env</code> file with your Gemini API key:</span>
            </div>
            <div className="feature" style={{ paddingLeft: '20px' }}>
              <code>GEMINI_API_KEY=your_key_here</code>
            </div>
            <div className="feature">
              <span>2. Start the backend server:</span>
            </div>
            <div className="feature" style={{ paddingLeft: '20px' }}>
              <code>npm run server</code>
            </div>
          </div>

          <button
            className="btn btn-primary btn-lg w-full"
            onClick={handleRetryConnection}
            style={{ marginTop: '24px' }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.type === 'success' && <CheckCircle size={18} />}
          {notification.type === 'error' && <AlertCircle size={18} />}
          {notification.type === 'warning' && <AlertCircle size={18} />}
          {notification.type === 'info' && <Zap size={18} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <Zap size={24} />
          <h1>CodeMentor</h1>
        </div>

        <div className="header-actions">
          {/* File manager toggle */}
          <button
            className={`capture-btn ${showFileManager ? 'active' : ''}`}
            onClick={() => setShowFileManager(!showFileManager)}
          >
            <FolderOpen size={18} />
            <span>Files</span>
          </button>

          {/* GitHub clone button */}
          <button
            className="capture-btn"
            onClick={() => setShowGitHubClone(true)}
          >
            <Github size={18} />
            <span>Clone</span>
          </button>

          {/* Start Fresh button */}
          <button
            className="capture-btn"
            onClick={handleClearAll}
            title="Clear all files and start fresh"
          >
            <Trash2 size={18} />
            <span>Start Fresh</span>
          </button>

          {/* Terminal toggle */}
          <button
            className={`capture-btn ${showTerminal ? 'active' : ''}`}
            onClick={() => setShowTerminal(!showTerminal)}
            title="Toggle terminal"
          >
            <TerminalIcon size={18} />
            <span>Terminal</span>
          </button>

          {/* Explain It Back - Feynman Technique */}
          <button
            className="capture-btn"
            onClick={() => setShowExplainItBack(true)}
            title="Explain your code to validate understanding"
            disabled={!activeFileId || files.find(f => f.id === activeFileId)?.type !== 'code'}
          >
            <Brain size={18} />
            <span>Explain</span>
          </button>

          {/* Code Review Mode */}
          <button
            className="capture-btn"
            onClick={() => setShowCodeReview(true)}
            title="Get AI-powered code review with probing questions"
            disabled={!activeFileId || files.find(f => f.id === activeFileId)?.type !== 'code'}
          >
            <Code2 size={18} />
            <span>Review</span>
          </button>

          {/* Mode toggle */}
          <div className="mode-toggle">
            <button
              className={interactionMode === 'text' ? 'active' : ''}
              onClick={() => setInteractionMode('text')}
            >
              Text
            </button>
            <button
              className={interactionMode === 'voice' ? 'active' : ''}
              onClick={() => setInteractionMode('voice')}
            >
              Voice
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="app-nav">
        <button
          className={currentView === 'code' ? 'active' : ''}
          onClick={() => setCurrentView('code')}
        >
          <Monitor size={18} />
          <span>Code</span>
        </button>
        <button
          className={currentView === 'chat' ? 'active' : ''}
          onClick={() => setCurrentView('chat')}
        >
          <MessageSquare size={18} />
          <span>Chat</span>
        </button>
        <button
          className={currentView === 'progress' ? 'active' : ''}
          onClick={() => setCurrentView('progress')}
        >
          <BarChart3 size={18} />
          <span>Progress</span>
        </button>
      </nav>

      {/* Main content */}
      <main className="app-main">
        <div className="main-content">
          {currentView === 'code' && (
            <div className="code-view-layout">
              {/* File Manager Sidebar */}
              {showFileManager && (
                <div className="file-manager-sidebar">
                  <FileManager
                    files={files}
                    activeFileId={activeFileId}
                    onFileSelect={handleFileSelect}
                    onFileDelete={handleFileDelete}
                    onFilesUpload={handleFilesUpload}
                    onFileCreate={handleFileCreate}
                  />
                </div>
              )}

              {/* Editor Area */}
              <div className="editor-area">
                <div className="editor-main">
                  <MonacoEditor
                    files={files}
                    activeFileId={activeFileId}
                    onFileChange={handleFileChange}
                    onFileSelect={handleFileSelect}
                    onFileClose={handleFileClose}
                    onFilesUpload={handleFilesUpload}
                    highlightedLines={highlightedLines}
                    onCodeActivity={handleCodeActivity}
                    onSyntaxErrors={handleSyntaxErrors}
                  />
                </div>
                {showTerminal && (
                  <div className="terminal-panel">
                    <Terminal
                      onRun={handleRunCode}
                      isRunning={isExecuting}
                      output={terminalOutput}
                      compilers={compilers}
                      activeFilename={files.find((f) => f.id === activeFileId)?.name}
                      lastExitCode={lastExitCode}
                      onClear={handleClearTerminal}
                    />
                  </div>
                )}
              </div>

              {/* Chat Panel */}
              <div className="chat-panel">
                {interactionMode === 'voice' ? (
                  <VoiceInterface
                    onTranscript={handleVoiceTranscript}
                    onSpeaking={handleSpeaking}
                    isProcessing={isProcessing}
                    aiResponse={interactions[interactions.length - 1]?.aiResponse}
                  />
                ) : (
                  <TeachingChat
                    interactions={interactions}
                    onSendMessage={handleSendMessage}
                    onRequestHint={handleRequestHint}
                    isLoading={isProcessing}
                    currentHintLevel={currentHintLevel}
                  />
                )}
              </div>
            </div>
          )}

          {currentView === 'chat' && (
            <div className="chat-view">
              <TeachingChat
                interactions={interactions}
                onSendMessage={handleSendMessage}
                onRequestHint={handleRequestHint}
                isLoading={isProcessing}
                currentHintLevel={currentHintLevel}
              />
            </div>
          )}

          {currentView === 'progress' && (
            <div className="progress-view">
              <ProgressDashboard
                profile={profile}
                onStartPractice={handleStartPractice}
                onProfileUpdate={async () => {
                  const updated = await getProfile();
                  if (updated) setProfile(updated);
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* GitHub Clone Modal */}
      <GitHubClone
        isOpen={showGitHubClone}
        onClose={() => setShowGitHubClone(false)}
        onFilesCloned={handleReplaceFiles}
      />

      {/* Nudge Popup */}
      <NudgePopup
        isVisible={showNudge}
        reason={nudgeInfo.reason}
        file={nudgeInfo.file}
        line={nudgeInfo.line}
        onRequestHint={() => {
          setShowNudge(false);
          handleRequestHint();
        }}
        onDismiss={handleNudgeDismiss}
      />

      {/* Explain It Back Modal */}
      <ExplainItBack
        isOpen={showExplainItBack}
        onClose={() => setShowExplainItBack(false)}
        code={files.find(f => f.id === activeFileId)?.content || ''}
        language={files.find(f => f.id === activeFileId)?.language || 'javascript'}
        onValidationComplete={(passed, _feedback) => {
          if (passed) {
            showNotification('success', '🎉 Great understanding demonstrated!');
            // Reset adaptive state when student proves understanding
            getStuckDetector()?.resetAdaptiveState();
          } else {
            showNotification('info', 'Keep practicing! Review the feedback for improvement areas.');
          }
        }}
      />

      {/* Code Review Modal */}
      <CodeReviewMode
        isOpen={showCodeReview}
        onClose={() => setShowCodeReview(false)}
        code={files.find(f => f.id === activeFileId)?.content || ''}
        language={files.find(f => f.id === activeFileId)?.language || 'javascript'}
        fileName={files.find(f => f.id === activeFileId)?.name || 'code'}
        onHighlightLines={(lines) => setHighlightedLines(lines)}
      />
    </div>
  );
}

export default App;
