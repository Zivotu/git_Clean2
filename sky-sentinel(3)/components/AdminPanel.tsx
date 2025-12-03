import React, { useState, useEffect } from 'react';
import { assetManager } from '../services/assetManager';
import { AssetStatus, AssetType } from '../types';
import { ADMIN_PIN } from '../constants';

interface AdminPanelProps {
  onExit: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onExit }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [assets, setAssets] = useState<AssetStatus[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      setAssets(assetManager.getStatusList());
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true);
    } else {
      alert('ACCESS DENIED');
      setPin('');
    }
  };

  const filteredAssets = assets.filter(a => {
    const matchesFilter = filter === 'ALL' || a.def.type === filter;
    const matchesSearch = a.key.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (!isAuthenticated) {
    return (
      <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center text-green-500 font-mono">
        <h1 className="text-4xl mb-8 border-b-2 border-green-500 pb-2">SECURITY CHECK</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input 
            type="password" 
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="bg-zinc-900 border border-green-700 p-4 text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-green-400"
            placeholder="ENTER PIN"
            maxLength={4}
            autoFocus
          />
          <button type="submit" className="bg-green-900 hover:bg-green-700 text-green-100 py-3 px-6">
            AUTHENTICATE
          </button>
        </form>
        <button onClick={onExit} className="mt-8 text-gray-500 hover:text-white">
          &lt; RETURN TO MENU
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-gray-900 z-50 text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold text-yellow-500">ADMIN // ASSET INSPECTOR</h1>
        <button onClick={onExit} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded text-sm font-bold">
          EXIT ADMIN
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-gray-800 border-t border-gray-700 flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          {['ALL', AssetType.SPRITE, AssetType.BACKGROUND, AssetType.UI, AssetType.FX].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded text-xs font-bold ${filter === t ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <input 
          type="text" 
          placeholder="Search assets..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-600 px-3 py-1 rounded text-sm focus:outline-none focus:border-blue-500 flex-grow"
        />
        <div className="text-xs text-gray-400">
          Total: {assets.length} | Showing: {filteredAssets.length}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-grow overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredAssets.map((asset) => (
            <div key={asset.key} className="bg-gray-800 rounded border border-gray-700 p-3 flex flex-col items-center hover:border-blue-500 transition-colors">
              <div className="w-24 h-24 bg-gray-900 mb-3 flex items-center justify-center border border-gray-700 rounded relative pattern-bg">
                <img src={asset.src} alt={asset.key} className="max-w-full max-h-full object-contain pixelated" />
                <div className={`absolute top-0 right-0 px-1 text-[10px] font-bold text-white ${asset.isFallback ? 'bg-orange-600' : 'bg-green-600'}`}>
                  {asset.isFallback ? 'FALLBACK' : 'LOCAL'}
                </div>
              </div>
              <div className="w-full text-center">
                <div className="font-bold text-sm truncate text-blue-300" title={asset.key}>{asset.key}</div>
                <div className="text-[10px] text-gray-500 truncate" title={asset.def.path}>{asset.def.path}</div>
                <div className="mt-2 flex justify-between text-[10px] text-gray-400">
                  <span>{asset.def.type}</span>
                  <span>{asset.def.fallbackShape}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;