/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1A73E8',
        'primary-dark': '#1557B0',
        'primary-light': '#E8F0FE',
        surface: '#FFFFFF',
        background: '#F8F9FA',
        'on-surface': '#202124',
        'subtle-text': '#5F6368',
        'sent-bubble': '#E8F0FE',
        'received-bubble': '#FFFFFF',
        'border-color': '#E0E0E0',
        'hover-bg': '#F1F3F4',
        'active-bg': '#E8F0FE',
        error: '#EA4335',
        success: '#34A853',
        warning: '#FBBC04',
      },
      borderRadius: {
        bubble: '18px',
        card: '12px',
        input: '8px',
        pill: '9999px',
      },
      boxShadow: {
        google: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
        'google-md': '0 4px 6px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.08)',
        'google-lg': '0 10px 25px rgba(0,0,0,0.10), 0 4px 10px rgba(0,0,0,0.06)',
      },
      fontFamily: {
        google: ['"Google Sans"', '"DM Sans"', 'Roboto', 'sans-serif'],
        ui: ['"DM Sans"', '"Google Sans"', 'Roboto', 'sans-serif'],
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
      },
      animation: {
        'slide-up': 'slideUp 150ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'bounce-dot': 'bounceDot 1.2s infinite ease-in-out',
        'pop-in': 'popIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-toast': 'slideToast 300ms ease-out',
        'ripple': 'ripple 600ms linear',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-6px)', opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.7)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideToast: {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        ripple: {
          '0%': { transform: 'scale(0)', opacity: '0.6' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
