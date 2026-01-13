// Curriculum Generator Agent - Creates personalized learning paths
import type { Curriculum, Exercise, Weakness, LearningProfile } from '../types';
import { generateCurriculum as geminiGenerateCurriculum } from '../services/gemini';
import { getProfile } from '../services/learningProfile';

interface CurriculumProgress {
    curriculum: Curriculum;
    completedModules: number;
    totalModules: number;
    currentExercise: Exercise | null;
    overallProgress: number; // 0-100
}

class CurriculumGeneratorAgent {
    private currentCurriculum: Curriculum | null = null;
    private onCurriculumGenerated: (curriculum: Curriculum) => void = () => { };
    private onExerciseReady: (exercise: Exercise) => void = () => { };

    constructor() { }

    setCurriculumCallback(callback: (curriculum: Curriculum) => void): void {
        this.onCurriculumGenerated = callback;
    }

    setExerciseCallback(callback: (exercise: Exercise) => void): void {
        this.onExerciseReady = callback;
    }

    // Generate a new curriculum based on weaknesses
    async generateFromWeaknesses(weaknesses: Weakness[]): Promise<Curriculum> {
        const profile = await getProfile();
        const currentLevel = this.determineLevel(profile);

        const weaknessTopics = weaknesses.map((w) => w.topic);

        // Use Gemini to generate curriculum
        const modules = await geminiGenerateCurriculum(weaknessTopics, currentLevel);

        const curriculum: Curriculum = {
            id: `curriculum_${Date.now()}`,
            createdAt: new Date(),
            basedOnWeaknesses: weaknessTopics,
            modules: modules.map((m, index) => ({
                id: `module_${index}`,
                topic: m.topic,
                description: m.description,
                exercises: m.exercises.map((e, eIndex) => ({
                    id: `exercise_${index}_${eIndex}`,
                    prompt: e.prompt,
                    difficulty: e.difficulty as 'easy' | 'medium' | 'hard',
                    hints: [],
                    completed: false,
                    attempts: 0,
                })),
                completed: false,
            })),
            currentModuleIndex: 0,
        };

        this.currentCurriculum = curriculum;
        this.onCurriculumGenerated(curriculum);

        return curriculum;
    }

    // Generate a quick exercise for immediate practice
    async generateQuickExercise(topic: string, difficulty: 'easy' | 'medium' | 'hard'): Promise<Exercise> {
        const exercise: Exercise = {
            id: `quick_${Date.now()}`,
            prompt: '', // Will be filled by Gemini
            difficulty,
            hints: [
                { level: 1, content: 'Think about the basic approach first.' },
                { level: 2, content: 'Consider what data structures might help.' },
                { level: 3, content: 'Break the problem into smaller steps.' },
            ],
            completed: false,
            attempts: 0,
        };

        // In real implementation, use Gemini to generate the prompt
        // For now, use a template
        const templates: Record<string, string[]> = {
            loops: [
                'Write a function that sums all numbers from 1 to n.',
                'Create a function that finds the largest number in an array.',
                'Implement a function that reverses a string.',
            ],
            arrays: [
                'Write a function that removes duplicates from an array.',
                'Create a function that merges two sorted arrays.',
                'Implement a function that rotates an array by k positions.',
            ],
            recursion: [
                'Write a recursive function to calculate factorial.',
                'Create a recursive function to find the nth Fibonacci number.',
                'Implement a recursive function to reverse a linked list.',
            ],
            functions: [
                'Write a higher-order function that applies a callback to each array element.',
                'Create a function that returns another function (closure).',
                'Implement a memoization wrapper function.',
            ],
        };

        const topicTemplates = templates[topic.toLowerCase()] || templates['loops'];
        const randomIndex = Math.floor(Math.random() * topicTemplates.length);
        exercise.prompt = topicTemplates[randomIndex];

        this.onExerciseReady(exercise);
        return exercise;
    }

    // Get the current exercise to work on
    getCurrentExercise(): Exercise | null {
        if (!this.currentCurriculum) return null;

        const currentModule = this.currentCurriculum.modules[
            this.currentCurriculum.currentModuleIndex
        ];

        if (!currentModule) return null;

        return currentModule.exercises.find((e) => !e.completed) || null;
    }

    // Mark current exercise as completed
    async completeCurrentExercise(success: boolean): Promise<void> {
        if (!this.currentCurriculum) return;

        const currentModule = this.currentCurriculum.modules[
            this.currentCurriculum.currentModuleIndex
        ];

        if (!currentModule) return;

        const exercise = currentModule.exercises.find((e) => !e.completed);
        if (exercise) {
            exercise.completed = success;
            exercise.attempts++;
        }

        // Check if module is complete
        const allComplete = currentModule.exercises.every((e) => e.completed);
        if (allComplete) {
            currentModule.completed = true;
            this.currentCurriculum.currentModuleIndex++;
        }

        // Save progress
        await this.saveCurriculumProgress();
    }

    // Get progress summary
    getProgress(): CurriculumProgress | null {
        if (!this.currentCurriculum) return null;

        const completedModules = this.currentCurriculum.modules.filter(
            (m) => m.completed
        ).length;
        const totalModules = this.currentCurriculum.modules.length;

        const totalExercises = this.currentCurriculum.modules.reduce(
            (acc, m) => acc + m.exercises.length,
            0
        );
        const completedExercises = this.currentCurriculum.modules.reduce(
            (acc, m) => acc + m.exercises.filter((e) => e.completed).length,
            0
        );

        return {
            curriculum: this.currentCurriculum,
            completedModules,
            totalModules,
            currentExercise: this.getCurrentExercise(),
            overallProgress: Math.round((completedExercises / totalExercises) * 100),
        };
    }

    // Suggest next steps based on current progress
    suggestNextStep(): string {
        const progress = this.getProgress();

        if (!progress) {
            return "Let's start by identifying areas where you'd like to improve!";
        }

        if (progress.overallProgress === 100) {
            return "🎉 Congratulations! You've completed your current curriculum. Ready for new challenges?";
        }

        const currentExercise = progress.currentExercise;
        if (currentExercise) {
            return `Ready to practice? Try this: "${currentExercise.prompt}"`;
        }

        const currentModule = progress.curriculum.modules[
            progress.curriculum.currentModuleIndex
        ];
        if (currentModule) {
            return `Let's continue with: ${currentModule.topic} - ${currentModule.description}`;
        }

        return 'Keep practicing! Consistency is key to mastering programming.';
    }

    private determineLevel(profile: LearningProfile | null): string {
        if (!profile) return 'beginner';

        const avgSuccessRate =
            profile.topics.reduce((acc, t) => acc + t.successRate, 0) /
            (profile.topics.length || 1);

        if (avgSuccessRate >= 80) return 'advanced';
        if (avgSuccessRate >= 50) return 'intermediate';
        return 'beginner';
    }

    private async saveCurriculumProgress(): Promise<void> {
        // In a full implementation, save to IndexedDB
        // For now, just log
        console.log('Curriculum progress saved:', this.getProgress());
    }

    // Load existing curriculum
    loadCurriculum(curriculum: Curriculum): void {
        this.currentCurriculum = curriculum;
    }

    getCurriculum(): Curriculum | null {
        return this.currentCurriculum;
    }
}

// Singleton
let curriculumGenerator: CurriculumGeneratorAgent | null = null;

export const initializeCurriculumGenerator = (): CurriculumGeneratorAgent => {
    curriculumGenerator = new CurriculumGeneratorAgent();
    return curriculumGenerator;
};

export const getCurriculumGenerator = (): CurriculumGeneratorAgent | null =>
    curriculumGenerator;

export { CurriculumGeneratorAgent };
