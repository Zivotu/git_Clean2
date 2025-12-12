'use client';

export default function ErrorBackground() {
    return (
        <>
            <div className="fixed inset-0 z-0 overflow-hidden" style={{
                background: 'radial-gradient(1200px 800px at 18% 12%, rgba(255,45,109,.15) 0%, rgba(255,45,109,0) 58%), radial-gradient(900px 600px at 88% 32%, rgba(108,92,255,.12) 0%, rgba(108,92,255,0) 60%), linear-gradient(180deg, #F8FAFF, #EEF3FF)'
            }}>
                {/* Moving mesh */}
                <div className="absolute" style={{
                    inset: '-25vmax',
                    filter: 'blur(70px)',
                    opacity: 0.6,
                    animation: 'errorMeshMove 34s ease-in-out infinite alternate',
                    background: 'radial-gradient(closest-side at 22% 28%, rgba(255,45,109,.25), rgba(255,45,109,0) 62%), radial-gradient(closest-side at 72% 34%, rgba(108,92,255,.18), rgba(108,92,255,0) 64%)'
                }} />

                {/* Scanlines */}
                <div className="absolute inset-0 opacity-20 mix-blend-multiply" style={{
                    background: 'repeating-linear-gradient(to bottom, rgba(12,18,32,.05) 0px, rgba(12,18,32,.05) 1px, rgba(255,255,255,0) 3px, rgba(255,255,255,0) 7px)'
                }} />

                {/* Noise */}
                <div className="absolute opacity-[0.075] mix-blend-multiply" style={{
                    inset: '-10%',
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
                    animation: 'errorNoiseShift 18s ease-in-out infinite'
                }} />

                {/* Glitch bars */}
                <div className="absolute inset-0 opacity-10 mix-blend-multiply" style={{
                    background: 'linear-gradient(90deg, rgba(255,45,109,0), rgba(255,45,109,.18), rgba(255,45,109,0)), linear-gradient(90deg, rgba(108,92,255,0), rgba(108,92,255,.22), rgba(108,92,255,0))',
                    backgroundSize: '220px 100%, 280px 100%',
                    backgroundPosition: '22% 0, 60% 0',
                    animation: 'errorGlitchDrift 28s ease-in-out infinite'
                }} />
            </div>

            <style jsx global>{`
        @keyframes errorMeshMove {
          0% { transform: translate3d(-2%, -1%, 0) scale(1); }
          50% { transform: translate3d(2%, 1%, 0) scale(1.05); }
          100% { transform: translate3d(-1%, 2%, 0) scale(1.03); }
        }
        @keyframes errorNoiseShift {
          0% { transform: translate3d(0,0,0); }
          25% { transform: translate3d(-0.4%,0.4%,0); }
          50% { transform: translate3d(0.4%,-0.4%,0); }
          75% { transform: translate3d(-0.4%,-0.4%,0); }
          100% { transform: translate3d(0,0,0); }
        }
        @keyframes errorGlitchDrift {
          0% { transform: translate3d(0,0,0); background-position: 22% 0, 60% 0; }
          50% { transform: translate3d(0,-1px,0); background-position: 30% 0, 52% 0; }
          100% { transform: translate3d(0,0,0); background-position: 22% 0, 60% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="errorMeshMove"], div[style*="errorNoiseShift"], div[style*="errorGlitchDrift"] {
            animation: none !important;
          }
        }
      `}</style>
        </>
    );
}
