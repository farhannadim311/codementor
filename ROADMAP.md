# CodeMentor Development Roadmap

**Hackathon Deadline:** February 9, 2026, 5 PM PT  
**Start Date:** January 4, 2026  
**Last Updated:** January 4, 2026

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

---

## 🚧 In Progress / Next Steps

### Priority 1: PDF Parsing + AI Context (High Impact) ✅
- [x] Parse PDF text using pdf.js
- [x] Extract assignment requirements from PDF
- [x] Pass PDF content to AI for context
- [x] AI understands full assignment details

### Priority 2: Smart Nudge System ✅
- [x] Track code changes in real-time (debounced)
- [x] Detect syntax errors via Monaco
- [x] Implement "stuck detection" (no progress + errors)
- [x] Proactive nudge: "I noticed you're stuck on line X..."
- [x] Let user dismiss or request progressive hints

### Priority 3: Code Execution
- [ ] JavaScript execution in browser sandbox
- [ ] Python execution via Pyodide/WebAssembly
- [ ] Display output/errors in terminal panel
- [ ] AI sees runtime errors and helps debug

---

## 📋 Feature Backlog

### Learning Profile System
- [ ] Test IndexedDB profile persistence
- [ ] Track time spent on topics
- [ ] Display profile stats in Progress Dashboard
- [ ] Export/import learning profiles

### Weakness Detection
- [ ] Analyze coding patterns with Gemini
- [ ] Identify weak areas automatically
- [ ] Suggest targeted practice
- [ ] Track improvement over time

### Curriculum Generation
- [ ] Generate personalized learning paths
- [ ] Adaptive difficulty based on performance
- [ ] Topic-specific exercises

---

## 🏗️ Architecture Overview

```
codementor/
├── server/           # Backend API
│   └── index.ts      # Express + Gemini endpoints
├── src/
│   ├── components/   # React components
│   │   ├── MonacoEditor.tsx    # VS Code-like editor
│   │   ├── FileManager.tsx     # File tree sidebar
│   │   ├── GitHubClone.tsx     # Clone repo modal
│   │   ├── TeachingChat.tsx    # Chat interface
│   │   └── PdfViewer.tsx       # PDF display
│   ├── services/     # API & storage
│   │   ├── gemini.ts           # Backend API calls
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
3. **Ask for help** → Socratic teaching, progressive hints
4. **File persistence** → Refresh browser, files remain
5. **Multi-file editing** → Tab switching, syntax highlighting
