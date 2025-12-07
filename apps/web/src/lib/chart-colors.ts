/**
 * Chart color constants for data visualization
 * Uses warm palette: no blue, green, cyan, teal, or turquoise
 */

export const chartColors = {
  primary: '#9e9e9e',      // warm gray (primary-500)
  secondary: '#ffc107',     // amber (secondary-500)
  accent: '#ff5722',        // deep orange (accent-500)
  success: '#9e9e9e',       // warm gray (not green) for recovery states
  warning: '#ffc107',       // amber (warning-500)
  danger: '#f44336',        // red (danger-500)
  
  // Extended palette for multi-series charts
  series: [
    '#9e9e9e',   // primary-500 (warm gray)
    '#ffc107',    // secondary-500 (amber)
    '#ff5722',    // accent-500 (deep orange)
    '#757575',    // primary-600 (darker gray)
    '#ffb300',    // secondary-600 (darker amber)
    '#f4511e',    // accent-600 (darker orange)
    '#616161',    // primary-700
    '#ffa000',    // secondary-700
    '#e64a19',    // accent-700
  ],
  
  // Gradient stops for area charts
  gradients: {
    primary: ['#fafafa', '#9e9e9e'],
    secondary: ['#fff8e1', '#ffc107'],
    accent: ['#fbe9e7', '#ff5722'],
    success: ['#fafafa', '#9e9e9e'],
    warning: ['#fff8e1', '#ffc107'],
    danger: ['#ffebee', '#f44336'],
  },
};

/**
 * Get color for a specific data series index
 * Cycles through the series palette
 */
export function getSeriesColor(index: number): string {
  return chartColors.series[index % chartColors.series.length];
}

/**
 * Get gradient colors for area charts
 */
export function getGradientColors(type: keyof typeof chartColors.gradients): string[] {
  return chartColors.gradients[type];
}



