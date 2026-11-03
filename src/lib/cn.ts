import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Une clases de Tailwind resolviendo conflictos.
 *
 * Sin esto, `cn('p-2', 'p-4')` deja las dos clases en el HTML y cuál gana
 * depende del orden del archivo, no de la intención. tailwind-merge resuelve
 * el conflicto y deja siempre la última.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}