import { HighScore } from '../types';

const STORAGE_KEY = 'sky_sentinel_highscores';
const MAX_SCORES = 20;

export const scoreService = {
  getHighScores: (): HighScore[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to load scores', e);
      return [];
    }
  },

  isHighScore: (score: number): boolean => {
    if (score === 0) return false;
    const scores = scoreService.getHighScores();
    if (scores.length < MAX_SCORES) return true;
    // Check if score is higher than the lowest score in the list
    return score > scores[scores.length - 1].score;
  },

  saveHighScore: (name: string, score: number) => {
    const scores = scoreService.getHighScores();
    const newEntry: HighScore = {
      name: name.substring(0, 10).toUpperCase(), // Limit name length
      score,
      date: Date.now()
    };

    scores.push(newEntry);
    
    // Sort descending
    scores.sort((a, b) => b.score - a.score);
    
    // Keep top 20
    const topScores = scores.slice(0, MAX_SCORES);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(topScores));
    return topScores;
  },

  getTopScore: (): number => {
    const scores = scoreService.getHighScores();
    return scores.length > 0 ? scores[0].score : 50000; // Default high score
  }
};