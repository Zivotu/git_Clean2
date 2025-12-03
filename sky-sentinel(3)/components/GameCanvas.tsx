import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/engine';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { PlayerStats, GameState } from '../types';

interface GameCanvasProps {
  onGameOver: (stats: PlayerStats) => void;
  gameState: GameState;
  onStatsUpdate: (stats: PlayerStats) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onGameOver, gameState, onStatsUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const requestRef = useRef<number>(0);

  // Input State
  const keys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Engine
    const engine = new GameEngine(canvasRef.current, onStatsUpdate, onGameOver);
    engineRef.current = engine;
    engine.startGame();

    // Loop
    const loop = (time: number) => {
      // Basic delta time calc could go here, for now fixed step
      if (engineRef.current && engineRef.current.state === GameState.PLAYING) {
          engineRef.current.handleInput(keys.current);
          engineRef.current.update(16.6); // ~60fps
          engineRef.current.draw();
      }
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    // Input Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
        // Prevent default scrolling for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }

        keys.current.add(e.key);
        if (e.key.toLowerCase() === 'x' && engineRef.current) {
            engineRef.current.triggerBomb();
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // Run once on mount

  // Pause handling
  useEffect(() => {
    if (engineRef.current) {
        engineRef.current.state = gameState;
    }
  }, [gameState]);

  // Touch Handling for Mobile
  const handleTouchMove = (e: React.TouchEvent) => {
      if (!engineRef.current) return;
      const touch = e.touches[0];
      const rect = canvasRef.current!.getBoundingClientRect();
      // Simple logic placeholder
  };

  return (
    <div className="relative w-full h-full flex justify-center items-center bg-zinc-900">
      <canvas
        ref={canvasRef}
        width={GAME_WIDTH}
        height={GAME_HEIGHT}
        className="h-full w-auto object-contain bg-black shadow-2xl focus:outline-none"
        onTouchMove={handleTouchMove}
      />
      {/* Mobile Controls Overlay (Visible only on touch devices ideally) */}
      <div className="absolute bottom-10 left-0 w-full flex justify-between px-8 md:hidden pointer-events-none">
          <div className="text-white opacity-50 text-sm">Drag to Move</div>
          <button 
            className="pointer-events-auto bg-red-600 rounded-full w-16 h-16 text-white font-bold border-2 border-white shadow-lg active:bg-red-800"
            onClick={() => engineRef.current?.triggerBomb()}
          >
              BOMB
          </button>
      </div>
    </div>
  );
};

export default GameCanvas;