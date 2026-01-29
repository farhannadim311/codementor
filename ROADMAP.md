# CodeMentor Development Roadmap

**Hackathon Deadline:** February 9, 2026, 5 PM PT  
**Start Date:** January 4, 2026  
**Last Updated:** January 27, 2026

---

## ✅ Completed Features

### Phase 1: Core Foundation
- ✅ React + Vite project structure
- ✅ Backend API server with Express + Gemini integration
- ✅ Secure API key storage (environment variables)
- ✅ Teaching chat with Socratic method tutoring
- ✅ Voice interface (speech-to-text)
- ✅ Progress dashboard structure

### Phase 2: Monaco Editor + File System
- ✅ Monaco Editor integration (VS Code-like experience)
- ✅ Multi-file tabs with syntax highlighting
- ✅ Drag & drop file uploads
- ✅ File persistence with IndexedDB (survives refresh)
- ✅ PDF viewer embedded in editor (tabs for PDFs)
- ✅ Image viewer support
- ✅ File manager with tree structure (collapsible directories)

### Phase 3: GitHub Integration
- ✅ GitHub repo cloning via API
- ✅ Clone modal with progress indicator
- ✅ Preserves directory structure
- ✅ Auto-skips node_modules + binary files

### Phase 4: PDF Parsing + AI Context
- ✅ Parse PDF text using pdf.js
- ✅ Extract assignment requirements from PDF
- ✅ Pass PDF content to AI for context
- ✅ AI understands full assignment details

### Phase 5: Smart Nudge System
- ✅ Track code changes in real-time (debounced)
- ✅ Detect syntax errors via Monaco
- ✅ Implement "stuck detection" (no progress + errors)
- ✅ Proactive nudge: "I noticed you're stuck on line X..."
- ✅ Let user dismiss or request progressive hints

### Phase 6: Gemini 3 Upgrade 🚀 NEW
- ✅ **Interactions API** - Stateful multi-turn conversations
- ✅ **Thinking Levels** - Dynamic reasoning (high for complex, low for chat)
- ✅ **Streaming Responses** - Real-time SSE streaming + Thinking Summaries
- ✅ **Media Resolution** - Optimal settings for screenshots/PDFs
- ✅ **Google Search Tool** - Built-in documentation lookup
- ✅ **Session Management** - Conversation continuity with IDs

### Phase 7: Interactive Terminal & File System 🖥️ NEW
- ✅ **VS Code-style integrated terminal**
- ✅ **Real shell sessions** (bash/zsh)
- ✅ **Local File System Sync** (Edits save to ~/CodeMentorProjects)
- ✅ **File Manager** (Real-time file browsing)
- ✅ **Command input with history** (↑/↓ arrows)
- ✅ **ANSI color code support** (colored output)

### Phase 8: Learning Profile & Analytics 📊 NEW
- ✅ **Automated Time Tracking** (Tracks coding time per language)
- ✅ **Progress Dashboard** (Visualizes streaks, total time, topics)
- ✅ **Data Persistence** (Saves profile to IndexedDB)
- ✅ **Export/Import** (JSON backup/restore of learning data)
- ✅ **Smart Nudge Verification** (Stuck detector triggers help popup)

---

## 🚧 In Progress / Next Steps

### Phase 9: Weakness Detection & Skill Analysis 🧠 NEW
- ✅ **Automated Detection** (Connects `weaknessDetector.ts` to backend)
- ✅ **Recurring Error Analysis** (Identifies patterns from session history)
- ✅ **Skill Visualization** (Radar/Bar charts for skill balance)
- ✅ **Strengths Recognition** (Identifies and highlights mastered concepts)
- ✅ **Smart Resolution** (Auto-removes weaknesses when improved)
- ✅ **Manual Control** (Sleek "Are you sure?" modal for removing items)

---

## 🚧 In Progress / Next Steps

### Priority 1: Curriculum Generation
- [ ] Generate personalized learning paths
- [ ] Adaptive difficulty based on performance
- [ ] Topic-specific exercises

---

## 📋 Feature Backlog

### Curriculum Generation
- [ ] Generate personalized learning paths
- [ ] Adaptive difficulty based on performance
- [ ] Topic-specific exercises

---

## 🏗️ Architecture Overview

```
codementor/seems 
├── server/           # Backend API
│   └── index.ts      # Express + Gemini 3 Interactions API
├── src/
│   ├── components/   # React components
│   │   ├── MonacoEditor.tsx    # VS Code-like editor
│   │   ├── Terminal.tsx        # Interactive shell terminal
│   │   ├── FileManager.tsx     # File tree sidebar
│   │   ├── GitHubClone.tsx     # Clone repo modal
│   │   ├── TeachingChat.tsx    # Chat interface
│   │   └── PdfViewer.tsx       # PDF display
│   ├── services/     # API & storage
│   │   ├── gemini.ts           # Interactions API + Shell client
│   │   ├── fileStorage.ts      # IndexedDB persistence
│   │   └── github.ts           # GitHub API
│   └── agents/       # AI agents
│       ├── stuckDetector.ts
│       ├── weaknessDetector.ts
│       └── curriculumGenerator.ts
└── .env              # API keys (not committed)
```

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create .env file with your API key
echo "GEMINI_API_KEY=your-key-here" > .env

# Start both frontend and backend
npm run dev:all

# Or start separately:
npm run dev      # Frontend (Vite)
npm run server   # Backend (Express)
```

---

## 📱 Demo Features to Showcase

1. **Clone a GitHub repo** → Shows VS Code-like file explorer
2. **Upload assignment PDF** → Opens in tab, AI has context
3. **Ask for help** → Socratic teaching with streaming responses
4. **Interactive Terminal** → Run `npm install`, `git`, etc like VS Code
5. **File persistence** → Refresh browser, files remain
6. **Multi-file editing** → Tab switching, syntax highlighting

---

## 🔧 Gemini 3 API Features Used

| Feature | Usage |
|---------|-------|
| **Interactions API** | Stateful conversations with `previousInteractionId` |
| **Thinking Levels** | `high` for debugging, `low` for chat |
| **Streaming** | Real-time responses via SSE |
| **Media Resolution** | `high` for screenshots, `medium` for PDFs |
| **Google Search** | Built-in documentation lookup |
| **Session Management** | Conversation continuity across turns |
