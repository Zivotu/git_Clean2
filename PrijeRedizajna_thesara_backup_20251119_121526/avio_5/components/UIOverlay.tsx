

import React, { useState, useEffect } from 'react';
import { GameState, ScoreEntry } from '../types';
import { PIN_CODE, ASSET_PATHS, UI_THEME } from '../constants';
import { assetManager } from '../services/AssetManager';

interface UIOverlayProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  score: number;
  health: number;
  level: number;
  onReset: () => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, setGameState, score, health, level, onReset }) => {
  const [highScores, setHighScores] = useState<ScoreEntry[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    try {
        const stored = localStorage.getItem('galaxy_scores');
        if (stored) setHighScores(JSON.parse(stored));
    } catch (e) {
        console.error("Error loading scores", e);
    }
  }, []);

  const saveScore = () => {
    if (!playerName.trim()) return;
    
    const newScores = [...highScores, { name: playerName, score, date: new Date().toLocaleDateString() }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    setHighScores(newScores);
    localStorage.setItem('galaxy_scores', JSON.stringify(newScores));
    
    setPlayerName('');
    // Order is important: Reset game internals, then switch to menu
    onReset();
    setGameState(GameState.MENU);
  };

  const startGame = () => {
    assetManager.initAudio();
    onReset();
    setGameState(GameState.PLAYING);
  };

  const checkPin = () => {
    if (pinInput === PIN_CODE) {
      setGameState(GameState.ADMIN);
      setPinInput('');
    } else {
      alert("Netočan PIN!");
      setPinInput('');
    }
  };

  if (gameState === GameState.PLAYING) {
    return (
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-4 flex flex-col justify-between">
        <div className="flex justify-between items-start text-white font-bold text-xl drop-shadow-md select-none">
          <div className="flex flex-col gap-2">
            <span className="text-yellow-400 font-mono" style={{textShadow: '0 0 5px rgba(250, 204, 21, 0.7)'}}>SCORE: {score}</span>
            <span className="text-cyan-400 font-mono" style={{textShadow: '0 0 5px rgba(34, 211, 238, 0.7)'}}>LEVEL: {level}</span>
          </div>
          <div className="w-48 bg-gray-900 bg-opacity-80 h-8 border border-cyan-500 relative skew-x-[-10deg]">
             <div 
               className={`h-full transition-all duration-300 ${health > 30 ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-red-600 to-red-500'}`} 
               style={{ width: `${health}%` }}
             ></div>
             <div className="absolute inset-0 grid grid-cols-10 gap-1">
                 {[...Array(10)].map((_,i) => <div key={i} className="border-r border-black opacity-20 h-full"></div>)}
             </div>
             <span className="absolute inset-0 text-center text-xs pt-1.5 font-mono tracking-wider z-10 skew-x-[10deg]" style={{textShadow: '1px 1px 0 #000'}}>SHIELD</span>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === GameState.PAUSED) {
     return (
       <div className="absolute inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center flex-col text-white z-50">
         <h1 className="text-6xl mb-8 text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 font-bold tracking-widest" style={{filter: 'drop-shadow(0 0 10px rgba(234, 179, 8, 0.5))'}}>PAUSED</h1>
         <p className="mb-8 text-cyan-300 font-mono animate-pulse text-sm">PRESS [ENTER] TO RESUME</p>
         <button 
            onClick={() => setGameState(GameState.MENU)} 
            className="px-8 py-3 border border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black transition font-mono uppercase tracking-wider"
         >
           Abort Mission
         </button>
       </div>
     );
  }

  if (gameState === GameState.GAME_OVER) {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center flex-col text-white z-50">
        <h1 className="text-red-500 text-6xl mb-2 font-bold tracking-widest" style={{textShadow: '0 0 20px red'}}>GAME OVER</h1>
        <div className="w-64 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent mb-8"></div>
        
        <p className="text-xl mb-8 font-mono text-gray-300">FINAL SCORE: <span className="text-yellow-400 text-3xl">{score}</span></p>
        
        <div className="flex flex-col gap-4 items-center w-full max-w-xs">
          <input 
            type="text" 
            placeholder="ENTER PILOT NAME" 
            maxLength={10}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-center uppercase text-xl text-cyan-400 focus:outline-none focus:border-cyan-400 font-mono"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button 
            onClick={saveScore} 
            className="w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 py-3 border border-green-400 font-bold cursor-pointer transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(34,197,94,0.4)]"
          >
            SAVE RECORD
          </button>
        </div>
      </div>
    );
  }

  if (gameState === GameState.ADMIN) {
      return (
        <div className="absolute inset-0 bg-slate-900 text-white flex flex-col p-8 overflow-y-auto z-50 font-mono">
           <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
               <h2 className="text-2xl text-yellow-400 tracking-wider">SYSTEM ADMIN // ASSETS</h2>
               <button onClick={() => setGameState(GameState.MENU)} className="text-red-400 hover:text-white cursor-pointer">[CLOSE_TERMINAL]</button>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(ASSET_PATHS.IMAGES).map(([key, path]) => (
                  <div key={key} className="border border-gray-700 p-3 flex items-center gap-4 bg-gray-800/50 hover:bg-gray-800 transition">
                      <div className="w-16 h-16 bg-black flex items-center justify-center border border-gray-600">
                        <img src={assetManager.getImage(key).src} alt={key} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div>
                          <p className="font-bold text-green-400 text-sm">{key}</p>
                          <p className="text-xs text-gray-500 break-all">{path}</p>
                      </div>
                  </div>
              ))}
              {Object.entries(ASSET_PATHS.SOUNDS).map(([key, path]) => (
                  <div key={key} className="border border-gray-700 p-3 flex items-center gap-4 bg-gray-800/50 hover:bg-gray-800 transition">
                      <div className="w-16 h-16 flex items-center justify-center bg-black text-xl border border-gray-600 text-gray-500">♪</div>
                      <div>
                          <p className="font-bold text-blue-400 text-sm">{key}</p>
                          <p className="text-xs text-gray-500 break-all">{path}</p>
                          <button 
                            onClick={() => assetManager.playSound(key)}
                            className="mt-2 px-3 py-1 text-[10px] bg-cyan-900 hover:bg-cyan-800 text-cyan-200 rounded cursor-pointer border border-cyan-700"
                          >
                              PLAY TEST
                          </button>
                      </div>
                  </div>
              ))}
           </div>
        </div>
      );
  }

  // --- MODERN MAIN MENU ---
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 overflow-hidden">
      {/* Generated Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center" 
        style={{ backgroundImage: `url(${UI_THEME.MENU_BG_URL})` }}
      ></div>
      
      {/* Overlay Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 z-0 pointer-events-none"></div>

      <div className="z-10 flex flex-col items-center w-full max-w-4xl px-4">
        
        {/* Animated Logo */}
        <div className="mb-12 animate-bounce-slow w-full max-w-2xl">
            <img src={UI_THEME.LOGO_URL} alt="Retro Galaxy Defender" className="w-full h-auto drop-shadow-[0_0_15px_rgba(255,0,204,0.5)]" />
        </div>

        {/* Main Action Button */}
        <div className="flex flex-col gap-6 w-64 mb-12 relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <button 
                onClick={startGame} 
                className="relative py-4 bg-black border border-cyan-500 text-cyan-400 hover:text-white hover:bg-cyan-900/50 transition-all font-bold text-xl tracking-[0.2em] uppercase clip-path-polygon"
                style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 90%, 90% 100%, 0 100%, 0 10%)' }}
            >
                Initiate Launch
            </button>
        </div>

        {/* Scoreboard Panel */}
        <div className="bg-black/60 backdrop-blur-md p-6 border-l-4 border-yellow-500 w-full max-w-md mb-8 shadow-[0_0_20px_rgba(0,0,0,0.5)] relative">
            <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-yellow-500"></div>
            <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-yellow-500"></div>
            
            <h3 className="text-center border-b border-gray-700 pb-2 mb-4 text-yellow-500 font-mono tracking-widest text-sm">TOP PILOTS</h3>
            {highScores.length === 0 ? (
                <p className="text-center text-gray-500 text-xs font-mono">NO DATA AVAILABLE</p>
            ) : (
                <ul className="text-sm space-y-3 font-mono">
                    {highScores.map((s, i) => (
                        <li key={i} className="flex justify-between items-center border-b border-gray-800 pb-1 last:border-0">
                            <span className="text-gray-300"><span className="text-cyan-600 mr-2">0{i+1}.</span>{s.name}</span>
                            <span className="text-yellow-400">{s.score.toLocaleString()}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {/* Footer / Admin Access */}
        <div className="flex justify-between items-end w-full max-w-md mt-4">
             <div className="text-[10px] text-gray-500 font-mono text-left">
                <p>SYSTEM: ONLINE</p>
                <p>VER: 1.0.4</p>
             </div>

            <div className="flex gap-2 items-center">
                <input 
                type="password" 
                placeholder="PIN" 
                className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 text-white text-center text-xs focus:border-cyan-500 outline-none"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                />
                <button onClick={checkPin} className="bg-gray-800 text-gray-400 px-3 py-1 text-xs hover:bg-gray-700 hover:text-white cursor-pointer border border-gray-700">AUTH</button>
            </div>
        </div>
        
        <div className="mt-8 text-[10px] text-cyan-900/50 font-mono uppercase tracking-widest">
            ARROWS to Move | SPACE to Fire | ENTER to Pause
        </div>
      </div>
    </div>
  );
};