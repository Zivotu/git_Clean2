import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import AdminPanel from './components/AdminPanel';
import HUD from './components/HUD';
import { GameState, PlayerStats, HighScore } from './types';
import { assetManager } from './services/assetManager';
import { scoreService } from './services/scoreService';
import { INITIAL_LIVES, INITIAL_BOMBS, MEDAL_VALUES } from './constants';

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [isLoading, setIsLoading] = useState(true);
  
  // Scoreboard State
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  // HUD State lifted up
  const [stats, setStats] = useState<PlayerStats>({
    score: 0,
    highScore: 50000,
    lives: INITIAL_LIVES,
    bombs: INITIAL_BOMBS,
    medalValue: MEDAL_VALUES[0],
    rank: 0,
    weaponLevel: 1
  });

  useEffect(() => {
    const init = async () => {
      await assetManager.loadAll();
      setHighScores(scoreService.getHighScores());
      // Set initial high score from storage
      const top = scoreService.getTopScore();
      setStats(prev => ({ ...prev, highScore: top }));
      setIsLoading(false);
    };
    init();

    // Pause Listener
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === 'p') {
            setGameState(prev => {
                if (prev === GameState.PLAYING) return GameState.PAUSED;
                if (prev === GameState.PAUSED) return GameState.PLAYING;
                return prev;
            });
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Refresh scores whenever we enter menu
  useEffect(() => {
    if (gameState === GameState.MENU) {
       setHighScores(scoreService.getHighScores());
    }
  }, [gameState]);

  const startGame = () => {
    setGameState(GameState.PLAYING);
    setIsNewHighScore(false);
    setPlayerName('');
  };

  // Fixed: Accepts finalStats directly from engine to avoid stale state issues
  const handleGameOver = (finalStats: PlayerStats) => {
    // Update the HUD one last time
    setStats(finalStats);
    
    // Check using the FINAL score, not the state score
    const qualifies = scoreService.isHighScore(finalStats.score);
    setIsNewHighScore(qualifies);
    setGameState(GameState.GAME_OVER);
  };

  const submitScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    
    scoreService.saveHighScore(playerName, stats.score);
    
    // Update global high score if needed
    const top = scoreService.getTopScore();
    setStats(prev => ({ ...prev, highScore: top }));

    setGameState(GameState.MENU);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white font-mono">
        <div className="text-center">
            <h1 className="text-2xl mb-4 animate-pulse">INITIALIZING SYSTEMS...</h1>
            <div className="w-64 h-2 bg-gray-800 rounded">
                <div className="h-full bg-blue-500 w-1/2 animate-bounce"></div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-zinc-950 flex justify-center overflow-hidden relative font-sans select-none">
      
      {/* Game Layer */}
      {(gameState === GameState.PLAYING || gameState === GameState.PAUSED || gameState === GameState.GAME_OVER) && (
        <>
            <GameCanvas 
                gameState={gameState} 
                onStatsUpdate={setStats}
                onGameOver={handleGameOver}
            />
            <HUD stats={stats} />
        </>
      )}

      {/* Main Menu Layer */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 flex flex-col md:flex-row items-center justify-center bg-black/90 z-40 gap-8 md:gap-16 p-4">
          
          {/* Left Side: Title & Buttons */}
          <div className="flex flex-col items-center md:items-start z-10 w-full max-w-sm">
            <h1 className="text-5xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-900 mb-8 tracking-tighter drop-shadow-[0_4px_4px_rgba(0,0,0,1)] text-center md:text-left">
              SKY<br/>SENTINEL
            </h1>
            <div className="flex flex-col gap-4 w-full">
              <button onClick={startGame} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded border-b-4 border-blue-800 active:border-b-0 active:mt-1 transition-all">
                START MISSION
              </button>
              <button onClick={() => setGameState(GameState.ADMIN)} className="text-xs mt-4 text-zinc-600 hover:text-zinc-400 tracking-widest text-center">
                // ADMIN PANEL
              </button>
            </div>
            
            {/* CONTROLS DISPLAY */}
            <div className="mt-8 border border-zinc-800 bg-zinc-900/50 p-4 rounded w-full">
                <h3 className="text-zinc-500 font-bold text-xs tracking-widest mb-3 border-b border-zinc-800 pb-1">CONTROLS</h3>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono text-gray-300">
                    <div className="flex flex-col gap-1">
                        <span className="text-blue-400 font-bold">MOVE</span>
                        <span>WASD / ARROWS</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-red-400 font-bold">SHOOT</span>
                        <span>AUTO / SPACE</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-green-400 font-bold">BOMB</span>
                        <span>SHIFT / X</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-yellow-400 font-bold">PAUSE</span>
                        <span>P</span>
                    </div>
                </div>
            </div>

          </div>

          {/* Right Side: High Scores */}
          <div className="bg-zinc-900/80 border border-zinc-700 p-6 rounded-lg w-full max-w-md shadow-2xl h-[400px] md:h-[500px] flex flex-col">
            <h2 className="text-yellow-500 font-bold text-center mb-4 tracking-widest text-xl border-b border-zinc-700 pb-2">TOP 20 ACES</h2>
            <div className="overflow-y-auto flex-grow pr-2 custom-scrollbar">
               {highScores.length === 0 ? (
                 <div className="text-gray-500 text-center mt-10 font-mono text-sm">NO RECORDS FOUND</div>
               ) : (
                 <table className="w-full text-sm font-mono">
                   <thead>
                     <tr className="text-gray-500 text-xs">
                       <th className="text-left pb-2">#</th>
                       <th className="text-left pb-2">NAME</th>
                       <th className="text-right pb-2">SCORE</th>
                     </tr>
                   </thead>
                   <tbody>
                     {highScores.map((entry, i) => (
                       <tr key={i} className={`border-b border-zinc-800/50 ${i < 3 ? 'text-yellow-200' : 'text-gray-400'}`}>
                         <td className="py-2 pl-1">{i + 1}.</td>
                         <td className="py-2">{entry.name}</td>
                         <td className="py-2 text-right">{entry.score.toLocaleString()}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               )}
            </div>
          </div>
          
          <div className="absolute bottom-4 right-4 text-zinc-500 text-[10px] pointer-events-none hidden md:block">
            VER 1.2.0 // READY
          </div>
        </div>
      )}

      {/* Pause Menu */}
      {gameState === GameState.PAUSED && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 p-8 rounded shadow-2xl text-center">
                <h2 className="text-3xl font-bold text-yellow-500 mb-6">PAUSED</h2>
                <div className="flex flex-col gap-3">
                    <button onClick={() => setGameState(GameState.PLAYING)} className="text-white hover:text-blue-400 font-bold">RESUME</button>
                    <button onClick={() => setGameState(GameState.MENU)} className="text-red-400 hover:text-red-300 font-bold">ABORT MISSION</button>
                </div>
            </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 backdrop-blur-sm">
             <div className="text-center bg-zinc-900 p-10 rounded-lg border border-zinc-800 shadow-2xl max-w-md w-full">
                <h2 className="text-6xl font-black text-red-600 mb-4 tracking-tighter">MISSION FAILED</h2>
                <p className="text-2xl text-white mb-8 font-mono">SCORE: {stats.score.toLocaleString()}</p>
                
                {isNewHighScore ? (
                  <div className="mb-8 animate-pulse-slow">
                    <p className="text-yellow-400 font-bold text-xl mb-4">NEW HIGH SCORE!</p>
                    <form onSubmit={submitScore} className="flex flex-col gap-4">
                      <input 
                        type="text" 
                        maxLength={10}
                        placeholder="ENTER NAME" 
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                        className="bg-black border-2 border-yellow-500 text-center text-2xl p-2 text-white font-mono focus:outline-none uppercase"
                        autoFocus
                      />
                      <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-8 rounded">
                        SAVE RECORD
                      </button>
                    </form>
                  </div>
                ) : (
                  <button onClick={() => setGameState(GameState.MENU)} className="bg-white text-black font-bold py-3 px-8 rounded hover:bg-gray-200 w-full">
                      RETURN TO BASE
                  </button>
                )}
             </div>
        </div>
      )}

      {/* Admin Panel */}
      {gameState === GameState.ADMIN && (
        <AdminPanel onExit={() => setGameState(GameState.MENU)} />
      )}
    </div>
  );
}

export default App;