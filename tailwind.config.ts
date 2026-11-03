import type { Config } from 'tailwindcss'

/**
 * Brutalist / Editorial.
 *
 * El público abre el perfil buscando a alguien para hoy, con datos móviles.
 * Necesita jerarquía brutal y carga inmediata: nada de gradientes que compitan
 * con el botón de WhatsApp. El verde queda reservado a ese botón.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Negro casi puro: menos brillo en pantalla a la intenci\u00f3n de leer
        // al sol o en un interior.
        ink: '#0A0A0A',
        paper: '#FFFFFF',
        // ÚNICO color de acento de la plataforma. Reservado para el botón de
        // contacto. Usarlo en otro elemento hace que el usuario no sepa
        // dónde tocar.
        whatsapp: {
          DEFAULT: '#25D366',
          dark: '#1EB455',
          contrast: '#FFFFFF',
        },
        // Grises de apoyo para bordes y texto secundario.
        line: '#0A0A0A',
        muted: '#6B6B6B',
      },
      fontFamily: {
        // Serif condensada para titulares: da el carácter editorial y es
        // distinguible de la tipografía de sistema que usa todo el mundo.
        display: ['var(--font-display)', 'Impact', 'Haettenschweiler', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Escala tipográfica que rompe el grid: el titular de la home tiene
        // que dominar la pantalla.
        display: ['clamp(2.5rem, 9vw, 6rem)', { lineHeight: '0.92', letterSpacing: '-0.03em' }],
        title: ['clamp(1.75rem, 5vw, 3rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        card: ['1.125rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      spacing: {
        // Bordes gruesos como recurso de diseño, no solo como separador.
        border: '3px',
        'border-thick': '4px',
      },
      maxWidth: {
        // Contenido de 640px en pantallas grandes: leer texto largo en un
        // renglón de 1600px cansa.
        prose: '42rem',
      },
    },
  },
  plugins: [],
}

export default config