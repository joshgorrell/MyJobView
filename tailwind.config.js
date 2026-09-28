/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: { 750: '#313d4e', 850: '#182230' },
        workspace: 'rgb(var(--workspace) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        primary: 'rgb(var(--text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
        strong: 'rgb(var(--border-strong) / <alpha-value>)',
        brand: 'rgb(var(--brand-text) / <alpha-value>)',
        warning: 'rgb(var(--warning-text) / <alpha-value>)',
        warningSoft: 'rgb(var(--warning-surface) / <alpha-value>)',
        warningLine: 'rgb(var(--warning-border) / <alpha-value>)',
        info: 'rgb(var(--info-text) / <alpha-value>)',
        infoSoft: 'rgb(var(--info-surface) / <alpha-value>)',
        success: 'rgb(var(--success-text) / <alpha-value>)',
        successSoft: 'rgb(var(--success-surface) / <alpha-value>)',
        danger: 'rgb(var(--danger-text) / <alpha-value>)',
        dangerSoft: 'rgb(var(--danger-surface) / <alpha-value>)',
        attention: 'rgb(var(--attention-text) / <alpha-value>)',
        attentionSoft: 'rgb(var(--attention-surface) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
