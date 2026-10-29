import defaultTheme from 'tailwindcss/defaultTheme';

const neutral = {
  50: '#f1f2f4', 100: '#e3e5e8', 200: '#cdd0d6', 300: '#b2b6be', 400: '#8d929c',
  500: '#6f747e', 600: '#4b4f58', 700: '#34373e', 800: '#24262b', 900: '#18191d', 950: '#0b0b0d',
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: {
          DEFAULT: '#1E7FF0',
          hover: '#1768C8',
          soft: '#6AAAF5',
        },
        accent: {
          DEFAULT: '#1E7FF0',
          hover: '#1768C8',
          soft: '#6AAAF5',
        },
        semantic: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          error: 'var(--error)',
        },
        // Neutral deep-gray scale (replaces the warm stone/slate/gray defaults).
        stone: neutral,
        slate: neutral,
        gray: neutral,
      },
      boxShadow: {
        soft: '0 8px 24px -16px rgba(0, 0, 0, 0.42)',
        lift: '0 10px 28px -18px rgba(0, 0, 0, 0.38)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'page-enter': {
          '0%': { opacity: '0', transform: 'translateY(3px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'feed-enter': {
          '0%': { opacity: '0', transform: 'translateY(3px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'avatar-reveal': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'nav-pop': {
          '0%': { transform: 'scale(0.94)' },
          '100%': { transform: 'scale(1)' },
        },
        'modal-enter': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pop': {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'heart-burst': {
          '0%': { transform: 'scale(0)', opacity: '0.8' },
          '100%': { transform: 'scale(2.1)', opacity: '0' },
        },
        'message-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'story-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-3px)', opacity: '1' },
        },
        'bar-grow': {
          from: { width: '0%' },
        },
        'like-particle': {
          '0%': { transform: 'rotate(var(--angle)) translateY(-6px) scale(1)', opacity: '1' },
          '100%': { transform: 'rotate(var(--angle)) translateY(-26px) scale(0)', opacity: '0' },
        },
        'ring-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'modal-exit': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(8px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'page-enter': 'page-enter 0.16s ease-out',
        'feed-enter': 'feed-enter 0.2s ease-out both',
        'avatar-reveal': 'avatar-reveal 0.16s ease-out',
        'nav-pop': 'nav-pop 0.16s ease-out',
        'modal-enter': 'modal-enter 0.18s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        pop: 'pop 0.28s ease-out',
        'toast-in': 'toast-in 0.2s ease-out',
        'heart-burst': 'heart-burst 0.45s ease-out forwards',
        'message-in': 'message-in 0.16s ease-out both',
        'story-in': 'story-in 0.18s ease-out both',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
        'bar-grow': 'bar-grow 0.55s ease-out both',
        'like-particle': 'like-particle 0.5s ease-out forwards',
        'ring-spin': 'ring-spin 5s linear infinite',
        'fade-out': 'fade-out 0.14s ease-in forwards',
        'modal-exit': 'modal-exit 0.14s ease-in forwards',
      },
    },
  },
  plugins: [],
};
