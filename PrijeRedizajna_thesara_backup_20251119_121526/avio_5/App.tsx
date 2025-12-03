
import React, { useState, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import { GameState } from './types';
import { assetManager } from './services/AssetManager';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [level, setLevel] = useState(1);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Preload assets on mount
  useEffect(() => {
    assetManager.loadAll().then(() => {
      setAssetsLoaded(true);
    });
  }, []);

  // Handler to reset game state logic in the engine
  // The Engine listens to state changes, but we need a signal to reset vars
  // Passing a key to remount component is an easy way to "Reset" everything
  const [gameSessionId, setGameSessionId] = useState(0);

  const handleReset = () => {
     setScore(0);
     setHealth(100);
     setLevel(1);
     setGameSessionId(prev => prev + 1);
  };

  if (!assetsLoaded) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">
        <div className="text-center">
           <h2 className="text-2xl mb-2">UČITAVANJE RESURSA...</h2>
           <div className="w-64 h-4 border-2 border-white p-1">
              <div className="h-full bg-white animate-pulse w-full"></div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-zinc-950 flex items-center justify-center overflow-hidden">
      <div className="relative w-full h-full max-w-none max-h-none flex items-center justify-center bg-black">
        {/* Aspect Ratio Container Logic handled by Canvas CSS object-fit */}
        <GameCanvas 
          key={gameSessionId}
          gameState={gameState} 
          setGameState={setGameState}
          setScore={setScore}
          setHealth={setHealth}
          setLevel={setLevel}
          score={score}
        />
        <UIOverlay 
          gameState={gameState} 
          setGameState={setGameState}
          score={score}
          health={health}
          level={level}
          onReset={handleReset}
        />
      </div>
    </div>
  );
};

export default App;
