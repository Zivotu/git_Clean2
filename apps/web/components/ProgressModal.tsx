'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Package, AlertCircle } from 'lucide-react';
import { useT } from '@/lib/i18n-provider';
import ErrorBackground from './ErrorBackground';

export type BuildState = 'queued' | 'running' | 'success' | 'error';

const targets: Record<BuildState, number> = {
  queued: 20,
  running: 80,
  success: 100,
  error: 100,
};

export default function ProgressModal({
  state,
  error,
  errorAnalysis,
  errorFixPrompt,
  onClose,
}: {
  state: BuildState | null;
  error?: string;
  errorAnalysis?: string;
  errorFixPrompt?: string;
  onClose?: () => void;
  previewUrl?: string;
  step?: string;
}) {
  const t = useT('ProgressModal');
  const [progress, setProgress] = useState(0);
  const packages = useMemo(() => Array.from({ length: 5 }), []);

  useEffect(() => {
    if (!state) {
      setProgress(0);
      return;
    }
    setProgress((current) => {
      if (state === 'queued') {
        return current < 8 ? 8 : current;
      }
      if (state === 'running') {
        return current < 35 ? 35 : current;
      }
      return current;
    });
    const id = setInterval(() => {
      setProgress((current) => {
        const target = targets[state];
        const diff = target - current;
        if (Math.abs(diff) < 0.5) {
          if (state === 'success' || state === 'error') {
            clearInterval(id);
          }
          return target;
        }
        return current + diff * 0.3;
      });
    }, 220);
    return () => clearInterval(id);
  }, [state]);

  // Use AI-generated analysis if available, otherwise use generic error
  const errorMessage = errorAnalysis || error?.trim() || t('errorOccurred');
  const errorLines = errorMessage.split('\n').filter(line => line.trim());

  return (
    <div className={`fixed inset-0 z-[2000] flex flex-col items-center justify-center text-slate-700 p-6 ${state !== 'error' ? 'bg-gradient-to-b from-white to-sky-50' : ''}`}>
      {state === 'error' && <ErrorBackground />}
      {state === 'error' ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl w-full relative z-10"
        >
          {/* Error Card */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-red-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500 to-rose-600 p-6 text-white relative overflow-hidden">
              <div className="flex items-center justify-between">
                {/* Thesara Logo - Left */}
                <div className="w-12 h-12 flex-shrink-0">
                  <img
                    src="/Thesara_Logo.png"
                    alt="Thesara Logo"
                    className="w-full h-full object-contain opacity-90"
                  />
                </div>

                {/* Center - Alert Icon + Text */}
                <div className="flex items-center gap-3 flex-1 mx-4">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <AlertCircle size={32} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Build Failed</h2>
                    <p className="text-red-100 text-sm">An unexpected issue occurred</p>
                  </div>
                </div>

                {/* Robot Error Graphic - Right (bigger, fills header) */}
                <div className="relative h-24 w-24 flex-shrink-0">
                  <img
                    src="/Robo_error_1.png"
                    alt="Error Robot"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {errorLines.map((line, index) => {
                // Check if line starts with "---" for header styling
                const isHeader = line.startsWith('---') && line.endsWith('---');
                if (isHeader) {
                  return (
                    <div key={index} className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <h3 className="font-bold text-lg text-gray-800">
                        {line.replace(/---/g, '').trim()}
                      </h3>
                    </div>
                  );
                }

                // Footer signature styling
                if (line.includes('Thesara Team') || line.includes('Thesara tim')) {
                  return (
                    <p key={index} className="text-sm font-semibold text-emerald-600 italic pt-2">
                      {line}
                    </p>
                  );
                }

                // Regular content
                return (
                  <p key={index} className="text-gray-700 leading-relaxed">
                    {line}
                  </p>
                );
              })}

              {/* Suggested Fix Prompt */}
              {errorFixPrompt && (
                <div className="mt-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="bg-emerald-500 p-2 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-emerald-900 mb-1">💡 Suggested Quick Fix</h4>
                      <p className="text-sm text-emerald-700 mb-2">
                        Copy this prompt and paste it back into the AI tool where you created your app:
                      </p>
                      <div className="bg-white border border-emerald-200 rounded-lg p-3 text-sm text-gray-800 font-mono max-h-32 overflow-y-auto">
                        {errorFixPrompt}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(errorFixPrompt);
                          // TODO: Add toast notification
                        }}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Fix Prompt
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Close button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:shadow-xl hover:scale-105"
            >
              {t('close')}
            </button>
          </div>
        </motion.div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold mb-8 text-center">
            {t('uploading').split('Thesara')[0]}<span className="text-emerald-600 font-bold">Thesara</span>{t('uploading').split('Thesara')[1]}
          </h1>

          <div className="relative w-80 h-24 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-md flex items-center justify-between px-4">
            {packages.map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: -80, y: Math.random() * 30 - 15, opacity: 0 }}
                animate={{
                  x: [0, 180, 200],
                  opacity: [0, 1, 0],
                  scale: [1, 1.2, 0.8],
                }}
                transition={{
                  delay: i * 0.5,
                  duration: 3,
                  repeat: state === 'running' || state === 'queued' ? Infinity : 0,
                  repeatDelay: 1.5,
                }}
                className="absolute left-0"
              >
                <Package className="text-amber-500" size={28} />
              </motion.div>
            ))}
            <div className="absolute right-2 bottom-2">
              <Box className="text-emerald-500" size={42} />
            </div>
          </div>

          <div className="w-80 h-3 bg-slate-200 rounded-full mt-6 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-400 to-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.5 }}
            />
          </div>

          <p className="mt-2 text-sm text-slate-500">{t('percentComplete', { progress: Math.round(progress) })}</p>

          {state === 'success' && (
            <button
              onClick={onClose}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              {t('close')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
