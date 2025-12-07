'use client';

import { useEffect, useState } from 'react';
import { shouldReduceMotion } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  velocityX: number;
  velocityY: number;
}

interface ConfettiProps {
  trigger?: boolean;
  count?: number;
  colors?: string[];
  duration?: number;
  className?: string;
}

const DEFAULT_COLORS = [
  '#ff7043', // accent-400
  '#ff5722', // accent-500
  '#ffc107', // secondary-500
  '#ff8f00', // secondary-800
];

export function Confetti({
  trigger = false,
  count = 80,
  colors = DEFAULT_COLORS,
  duration = 1200,
  className,
}: ConfettiProps) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!trigger || shouldReduceMotion()) return;

    setIsAnimating(true);
    const newParticles: ConfettiParticle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10,
      rotation: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      velocityX: (Math.random() - 0.5) * 4,
      velocityY: Math.random() * 3 + 2,
    }));

    setParticles(newParticles);

    const timeout = setTimeout(() => {
      setIsAnimating(false);
      setParticles([]);
    }, duration);

    return () => clearTimeout(timeout);
  }, [trigger, count, colors, duration]);

  if (!isAnimating || particles.length === 0) return null;

  return (
    <div
      className={cn('fixed inset-0 pointer-events-none z-50 overflow-hidden', className)}
      aria-hidden="true"
    >
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-sm"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            transform: `rotate(${particle.rotation}deg)`,
            animation: `confetti-fall ${duration}ms ease-out forwards`,
            animationDelay: `${particle.id * 5}ms`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          to {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}



