# CodeMentor - AI-Powered Coding Tutor

**CodeMentor** is a specific AI-teaching assistant designed to guide you through coding assignments without giving away the answers. It uses **Google's Gemini 3** model with socratic teaching methods, thinking levels, and stateful interactions to provide a personalized learning experience.

![CodeMentor Dashboard](./screenshot.png)

## 🚀 Key Features

### 🧠 Intelligent Teaching AI
- **Socratic Method**: Asks guiding questions instead of solving problems for you.
- **Thinking Levels**: Adapts reasoning depth (High for complex debugging, Low for quick chats).
- **Streaming Responses**: Real-time feedback with visible "Thinking" process summaries.
- **Context Aware**: Understands your open files, terminal output, and assignment PDFs.

### 💻 Integrated Development Environment
- **VS Code-Like Editor**: Built with Monaco Editor for a familiar coding experience.
- **Interactive Terminal**: Real bash/zsh shell integrated directly into the browser.
- **Local File System**: Edits are saved directly to your local `~/CodeMentorProjects` directory.
- **Multi-Language Support**: Python, JavaScript, TypeScript, C++, Java, and more.

### 📊 Learning Analytics
- **Progress Dashboard**: Track your study streaks, total coding time, and topics mastered.
- **Weakness Detection**: Automatically identifies areas where you struggle (e.g., "Recursion").
- **Smart Nudges**: Detects when you are stuck (idle or repeated errors) and proactively offers help.

## 🛠️ Architecture

- **Frontend**: React, Vite, Monaco Editor, XTerm.js
- **Backend**: Express.js server, Node.js child_process (for shell/execution)
- **AI**: Google Gemini 3 Interactions API (Multimodal, Long Context)
- **Storage**: IndexedDB (for profile/stats), Local File System (for code)

## 🚀 Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Setup**:
    Create a `.env` file in the root directory:
    ```
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

3.  **Run the Application**:
    Start both the frontend and backend servers:
    ```bash
    npm run dev:all
    ```
    Or run them separately:
    ```bash
    npm run server   # Starts backend on port 3001
    npm run dev      # Starts frontend on port 5173
    ```

4.  **Open in Browser**:
    Visit `http://localhost:5173` to start coding!

## 🤝 Contributing

This project was built for the **Google DeepMind Gemini 3 Hackathon**.

## 📄 License

MIT
