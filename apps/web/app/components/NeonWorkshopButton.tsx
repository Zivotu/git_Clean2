'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

type NeonWorkshopButtonProps = {
    label: string;
    href: string;
    isDark?: boolean;
};

export default function NeonWorkshopButton({ label, href, isDark = true }: NeonWorkshopButtonProps) {
    const [glowIntensity, setGlowIntensity] = useState(1);

    // Colors
    // Green: 34, 197, 94 (#22C55E)
    // Purple: 168, 85, 247 (#A855F7)

    // Dark Mode: Green Primary, Purple Secondary
    // Light Mode: Purple Primary, Green Secondary (or maybe keep purple/purple?)
    // User asked for "Purple with white letters" in light mode.

    const mainRgb = isDark ? '34, 197, 94' : '168, 85, 247';
    const secondaryRgb = isDark ? '168, 85, 247' : '34, 197, 94';

    useEffect(() => {
        const interval = setInterval(() => {
            setGlowIntensity(prev => (prev === 1 ? 1.5 : 1));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    // For light mode, we want a solid purple background (0.9 opacity) to contrast with the light page.
    // For dark mode, we keep the original transparent neon look (0.1 opacity).
    const bgOpacity = isDark ? 0.1 : 0.9;
    const hoverBgOpacity = isDark ? 0.2 : 1.0;

    // In light mode with solid purple bg, the text needs less shadow or a different shadow.
    // Actually white text on purple is good. 
    // But the icon color needs to be white if background is solid purple.
    const iconColor = isDark ? `rgb(${mainRgb})` : '#FFF';

    return (
        <Link
            href={href}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border-2 px-6 py-3 text-sm font-bold transition-all hover:scale-105"
            style={{
                borderColor: `rgba(${mainRgb}, ${glowIntensity})`,
                background: `linear-gradient(135deg, rgba(${mainRgb}, ${bgOpacity}), rgba(${secondaryRgb}, ${bgOpacity}))`,
                boxShadow: `0 0 ${20 * glowIntensity}px rgba(${mainRgb}, 0.6), 0 0 ${40 * glowIntensity}px rgba(${secondaryRgb}, 0.4)`,
            }}
        >
            {/* Animated gradient background */}
            <div
                className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                    background: `linear-gradient(135deg, rgba(${mainRgb}, ${hoverBgOpacity}), rgba(${secondaryRgb}, ${hoverBgOpacity}))`,
                }}
            />

            {/* Sparkle icon */}
            <Sparkles
                className="relative z-10 h-5 w-5 animate-pulse"
                style={{
                    color: iconColor,
                    filter: `drop-shadow(0 0 ${8 * glowIntensity}px rgba(${isDark ? mainRgb : '255,255,255'}, 0.8))`
                }}
            />

            {/* Button text */}
            <span
                className="relative z-10 uppercase tracking-wide"
                style={{
                    color: '#FFF',
                    textShadow: `0 0 ${10 * glowIntensity}px rgba(${mainRgb}, 0.8), 0 0 ${20 * glowIntensity}px rgba(${secondaryRgb}, 0.6)`
                }}
            >
                {label}
            </span>

            {/* Animated border pulse */}
            <div
                className="absolute inset-0 rounded-full opacity-75 transition-opacity group-hover:opacity-100"
                style={{
                    background: 'transparent',
                    border: `1px solid rgba(${mainRgb}, 0.5)`,
                    animation: 'neon-pulse 2s infinite',
                }}
            />

            <style jsx>{`
                @keyframes neon-pulse {
                    0%, 100% {
                        box-shadow: 0 0 5px rgba(${mainRgb}, 0.5), 
                                    0 0 10px rgba(${mainRgb}, 0.3);
                    }
                    50% {
                        box-shadow: 0 0 15px rgba(${mainRgb}, 0.8), 
                                    0 0 30px rgba(${mainRgb}, 0.5),
                                    0 0 40px rgba(${secondaryRgb}, 0.3);
                    }
                }
            `}</style>
        </Link>
    );
}
