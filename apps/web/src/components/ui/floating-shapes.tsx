'use client';

import { useEffect, useState } from 'react';
import { shouldReduceMotion } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface FloatingShapesProps {
  count?: number;
  className?: string;
  variant?: 'circles' | 'blobs' | 'mixed';
}

export function FloatingShapes({
  count = 6,
  className,
  variant = 'mixed',
}: FloatingShapesProps) {
  const [shapes, setShapes] = useState<Array<{
    id: number;
    size: number;
    x: number;
    y: number;
    duration: number;
    delay: number;
    color: string;
    type: 'circle' | 'blob';
  }>>([]);

  useEffect(() => {
    if (shouldReduceMotion()) return;

    const newShapes = Array.from({ length: count }, (_, i) => {
      const isCircle = variant === 'circles' || (variant === 'mixed' && i % 2 === 0);
      return {
        id: i,
        size: Math.random() * 100 + 50,
        x: Math.random() * 100,
        y: Math.random() * 100,
        duration: Math.random() * 20 + 15,
        delay: Math.random() * 5,
        color: i % 3 === 0 
          ? 'rgba(255, 112, 67, 0.1)' // accent
          : i % 3 === 1
          ? 'rgba(255, 193, 7, 0.1)' // secondary
          : 'rgba(158, 158, 158, 0.1)', // primary
        type: (isCircle ? 'circle' : 'blob') as 'circle' | 'blob',
      };
    });

    setShapes(newShapes);
  }, [count, variant]);

  if (shouldReduceMotion() || shapes.length === 0) return null;

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
      aria-hidden="true"
    >
      {shapes.map((shape) => (
        <div
          key={shape.id}
          className="absolute"
          style={{
            left: `${shape.x}%`,
            top: `${shape.y}%`,
            width: `${shape.size}px`,
            height: `${shape.size}px`,
            backgroundColor: shape.color,
            borderRadius: shape.type === 'circle' ? '50%' : '30% 70% 70% 30% / 30% 30% 70% 70%',
            animation: `float-slow ${shape.duration}s ease-in-out infinite`,
            animationDelay: `${shape.delay}s`,
            filter: 'blur(40px)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}



