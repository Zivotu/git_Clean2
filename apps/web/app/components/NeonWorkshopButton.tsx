'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

type NeonWorkshopButtonProps = {
    label: string;
    href: string;
};

export default function NeonWorkshopButton({ label, href }: NeonWorkshopButtonProps) {
    const [glowIntensity, setGlowIntensity] = useState(1);

    useEffect(() => {
        const interval = setInterval(() => {
            setGlowIntensity(prev => (prev === 1 ? 1.5 : 1));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <Link
            href={href}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border-2 px-6 py-3 text-sm font-bold transition-all hover:scale-105"
            style={{
                borderColor: `rgba(34, 197, 94, ${glowIntensity})`,
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(168, 85, 247, 0.1))',
                boxShadow: `0 0 ${20 * glowIntensity}px rgba(34, 197, 94, 0.6), 0 0 ${40 * glowIntensity}px rgba(168, 85, 247, 0.4)`,
            }}
        >
            {/* Animated gradient background */}
            <div
                className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(168, 85, 247, 0.2))',
                }}
            />

            {/* Sparkle icon */}
            <Sparkles
                className="relative z-10 h-5 w-5 animate-pulse"
                style={{
                    color: '#22C55E',
                    filter: `drop-shadow(0 0 ${8 * glowIntensity}px rgba(34, 197, 94, 0.8))`
                }}
            />

            {/* Button text */}
            <span
                className="relative z-10 uppercase tracking-wide"
                style={{
                    color: '#FFF',
                    textShadow: `0 0 ${10 * glowIntensity}px rgba(34, 197, 94, 0.8), 0 0 ${20 * glowIntensity}px rgba(168, 85, 247, 0.6)`
                }}
            >
                {label}
            </span>

            {/* Animated border pulse */}
            <div
                className="absolute inset-0 rounded-full opacity-75 transition-opacity group-hover:opacity-100"
                style={{
                    background: 'transparent',
                    border: '1px solid rgba(34, 197, 94, 0.5)',
                    animation: 'neon-pulse 2s infinite',
                }}
            />

            <style jsx>{`
                @keyframes neon-pulse {
                    0%, 100% {
                        box-shadow: 0 0 5px rgba(34, 197, 94, 0.5), 
                                    0 0 10px rgba(34, 197, 94, 0.3);
                    }
                    50% {
                        box-shadow: 0 0 15px rgba(34, 197, 94, 0.8), 
                                    0 0 30px rgba(34, 197, 94, 0.5),
                                    0 0 40px rgba(168, 85, 247, 0.3);
                    }
                }
            `}</style>
        </Link>
    );
}
