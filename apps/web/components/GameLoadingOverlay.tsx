'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Gamepad2 } from 'lucide-react'

export default function GameLoadingOverlay() {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        // Animate progress to 90% over ~3 seconds to match the "reload" feel
        const duration = 3000
        const interval = 50
        const steps = duration / interval
        const increment = 90 / steps

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) return 90
                return prev + increment
            })
        }, interval)

        return () => clearInterval(timer)
    }, [])

    return (
        <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center text-slate-900">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-6"
            >
                <div className="relative">
                    <div className="absolute inset-0 animate-ping rounded-full bg-emerald-100 opacity-75"></div>
                    <div className="relative rounded-full bg-emerald-50 p-6">
                        <Gamepad2 className="h-12 w-12 text-emerald-600" />
                    </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <h2 className="text-xl font-semibold text-slate-900">Učitavanje igre...</h2>
                    <p className="text-sm text-slate-500">Pripremamo tvoju avanturu</p>
                </div>

                <div className="h-2 w-64 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                        className="h-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.2 }}
                    />
                </div>
            </motion.div>
        </div>
    )
}
