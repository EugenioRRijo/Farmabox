/**
 * Utility functions for formatting
 */

/**
 * Format time string to HH:mm format
 * @param time - Time string in various formats
 * @returns Formatted time in HH:mm
 */
export function formatTime(time: string): string {
  // Placeholder implementation - will be enhanced when needed
  return time;
}

/**
 * Format date to locale string
 * @param date - Date object or string
 * @returns Formatted date string
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('es-VE');
}
