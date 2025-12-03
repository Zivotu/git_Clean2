import React from 'react';
import { PlayerStats } from '../types';

interface HUDProps {
  stats: PlayerStats;
}

const HUD: React.FC<HUDProps> = ({ stats }) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2 md:p-4 max-w-[540px] mx-auto w-full">
      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-red-500 text-xs font-bold tracking-widest">1UP</span>
          <span className="text-white text-xl md:text-2xl font-mono leading-none drop-shadow-md">
            {stats.score.toString().padStart(8, '0')}
          </span>
        </div>
        
        <div className="flex flex-col items-center">
           <span className="text-yellow-500 text-xs font-bold tracking-widest">HI-SCORE</span>
           <span className="text-yellow-200 text-xl font-mono leading-none drop-shadow-md">
            {stats.highScore.toString().padStart(8, '0')}
           </span>
        </div>
      </div>

      {/* Rank Indicator (Debug/Gameplay info) */}
      <div className="absolute top-16 left-4 text-xs text-gray-500 font-mono">
         RANK: {(stats.rank * 100).toFixed(1)}%
      </div>

      {/* Bottom Bar */}
      <div className="flex justify-between items-end mb-16 md:mb-0">
         {/* Lives & Bombs */}
         <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className="text-blue-400 text-xs font-bold">LIVES</span>
                <div className="flex gap-1">
                    {Array.from({length: Math.max(0, stats.lives)}).map((_, i) => (
                        <div key={i} className="w-3 h-3 bg-blue-500 rounded-full shadow-inner border border-blue-300"></div>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-green-400 text-xs font-bold">BOMB</span>
                <div className="flex gap-1">
                    {Array.from({length: Math.max(0, stats.bombs)}).map((_, i) => (
                        <div key={i} className="w-3 h-3 bg-green-500 rounded-sm shadow-inner border border-green-300"></div>
                    ))}
                </div>
            </div>
         </div>

         {/* Medal Info */}
         <div className="flex flex-col items-end">
            <span className="text-yellow-600 text-[10px] font-bold tracking-widest">NEXT MEDAL</span>
            <span className="text-yellow-400 text-xl font-mono drop-shadow-sm animate-pulse">
                {stats.medalValue}
            </span>
         </div>
      </div>
    </div>
  );
};

export default HUD;