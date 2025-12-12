'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Package, AlertCircle, Mail } from 'lucide-react';
import { useT } from '@/lib/i18n-provider';

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
  onClose,
}: {
  state: BuildState | null;
  error?: string;
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

  const errorMessage = error?.trim() || t('errorOccurred');
  const errorLines = errorMessage.split('\n').filter(line => line.trim());

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-gradient-to-b from-white to-sky-50 text-slate-700 p-6">
      {state === 'error' ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl w-full"
        >
          {/* Error Card */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-red-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500 to-rose-600 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                  <AlertCircle size={32} className="text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Build Failed</h2>
                  <p className="text-red-100 text-sm">An unexpected issue occurred</p>
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

              {/* Email notification hint */}
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Mail className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Check your email</span> for detailed information about this issue.
                </p>
              </div>
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
