/**
 * Animation utilities and helpers
 * Provides consistent animation durations, easings, and reduced motion support
 */

/**
 * Check if user prefers reduced motion
 */
export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animation duration tokens (in milliseconds)
 */
export const animationDurations = {
  fast: 120,
  base: 200,
  slow: 300,
  celebrate: 700,
} as const;

/**
 * Animation easing functions
 */
export const easings = {
  easeOutCirc: 'cubic-bezier(0.075, 0.82, 0.165, 1)',
  easeInOutCubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  easeOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easeIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
} as const;

/**
 * Get animation duration respecting reduced motion preference
 */
export function getAnimationDuration(
  duration: keyof typeof animationDurations | number
): number {
  if (shouldReduceMotion()) {
    return 0;
  }
  return typeof duration === 'number' ? duration : animationDurations[duration];
}

/**
 * Get transition style object
 */
export function getTransition(
  properties: string[],
  duration: keyof typeof animationDurations | number = 'base',
  easing: keyof typeof easings = 'easeOut'
): string {
  const dur = getAnimationDuration(duration);
  if (dur === 0) return 'none';
  
  return properties
    .map((prop) => `${prop} ${dur}ms ${easings[easing]}`)
    .join(', ');
}



