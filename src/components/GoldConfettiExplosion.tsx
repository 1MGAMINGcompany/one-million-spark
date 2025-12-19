import { useEffect, useState, useMemo } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
  color: string;
  shape: 'circle' | 'square' | 'star';
}

interface GoldConfettiExplosionProps {
  active: boolean;
  originX?: number;
  originY?: number;
}

const GOLD_COLORS = [
  '#FFD700', // Gold
  '#FFC107', // Amber
  '#FFEB3B', // Yellow
  '#F9A825', // Dark gold
  '#FFE082', // Light gold
  '#E6BE8A', // Pale gold
];

const GoldConfettiExplosion = ({ active, originX = 50, originY = 50 }: GoldConfettiExplosionProps) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  const initialParticles = useMemo(() => {
    if (!active) return [];
    
    const count = 80;
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const velocity = 8 + Math.random() * 12;
      const shapes: ('circle' | 'square' | 'star')[] = ['circle', 'square', 'star'];
      
      return {
        id: i,
        x: originX,
        y: originY,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 5,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 20,
        size: 4 + Math.random() * 8,
        opacity: 1,
        color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      };
    });
  }, [active, originX, originY]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    setParticles(initialParticles);

    let animationId: number;
    let startTime = Date.now();
    const duration = 3000;
    const gravity = 0.3;
    const friction = 0.98;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > duration) {
        setParticles([]);
        return;
      }

      setParticles(prev => 
        prev.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vx: p.vx * friction,
          vy: p.vy * friction + gravity,
          rotation: p.rotation + p.rotationSpeed,
          opacity: Math.max(0, 1 - elapsed / duration),
        })).filter(p => p.opacity > 0)
      );

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [active, initialParticles]);

  if (!active || particles.length === 0) return null;

  const renderShape = (particle: Particle) => {
    const baseStyle = {
      position: 'absolute' as const,
      left: `${particle.x}%`,
      top: `${particle.y}%`,
      width: `${particle.size}px`,
      height: `${particle.size}px`,
      opacity: particle.opacity,
      transform: `translate(-50%, -50%) rotate(${particle.rotation}deg)`,
      pointerEvents: 'none' as const,
    };

    if (particle.shape === 'circle') {
      return (
        <div
          key={particle.id}
          style={{
            ...baseStyle,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${particle.color} 0%, ${particle.color}88 100%)`,
            boxShadow: `0 0 ${particle.size}px ${particle.color}66`,
          }}
        />
      );
    }

    if (particle.shape === 'square') {
      return (
        <div
          key={particle.id}
          style={{
            ...baseStyle,
            background: particle.color,
            boxShadow: `0 0 ${particle.size / 2}px ${particle.color}88`,
          }}
        />
      );
    }

    // Star shape
    return (
      <svg
        key={particle.id}
        style={{
          ...baseStyle,
          width: `${particle.size * 1.5}px`,
          height: `${particle.size * 1.5}px`,
        }}
        viewBox="0 0 24 24"
        fill={particle.color}
      >
        <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
      </svg>
    );
  };

  return (
    <div 
      className="absolute inset-0 overflow-hidden pointer-events-none z-50"
      aria-hidden="true"
    >
      {particles.map(renderShape)}
      
      {/* Central glow burst */}
      <div
        className="absolute"
        style={{
          left: `${originX}%`,
          top: `${originY}%`,
          transform: 'translate(-50%, -50%)',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, rgba(255,215,0,0) 70%)',
          animation: 'confettiBurst 0.5s ease-out forwards',
        }}
      />
      
      <style>{`
        @keyframes confettiBurst {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default GoldConfettiExplosion;
