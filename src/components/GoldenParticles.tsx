import { useMemo } from "react";

interface Particle {
  id: number;
  left: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number;
}

const GoldenParticles = () => {
  const particles = useMemo<Particle[]>(() => {
    const count = 30; // 20-40 range, using 30 for balance
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100, // % position
      size: 2 + Math.random() * 4, // 2-6px
      opacity: 0.15 + Math.random() * 0.35, // 0.15-0.5
      duration: 15 + Math.random() * 25, // 15-40s
      delay: Math.random() * -30, // stagger start
      drift: -20 + Math.random() * 40, // horizontal drift range
    }));
  }, []);

  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
      style={{ willChange: 'transform' }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            bottom: `-${p.size + 10}px`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            background: `radial-gradient(circle, #FDE68A 0%, #FACC15 50%, transparent 70%)`,
            boxShadow: `0 0 ${p.size * 2}px ${p.size / 2}px rgba(250, 204, 21, 0.3)`,
            animation: `goldenFloat ${p.duration}s linear ${p.delay}s infinite`,
            // CSS custom property for drift
            // @ts-ignore
            '--drift': `${p.drift}px`,
          }}
        />
      ))}
      
      <style>{`
        @keyframes goldenFloat {
          0% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          5% {
            opacity: var(--particle-opacity, 0.3);
          }
          95% {
            opacity: var(--particle-opacity, 0.3);
          }
          100% {
            transform: translateY(calc(-100vh - 20px)) translateX(var(--drift, 0px));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default GoldenParticles;
