// Nightline — Mizzou Gold × Night Theme
export const colors = {
  // Brand
  primary: '#FDB719',       // Mizzou Gold
  primaryDim: '#C9921A',    // Muted gold for pressed/disabled states
  primaryGlow: 'rgba(253, 183, 25, 0.15)', // Gold glow for highlights/halos

  // Backgrounds — dark layered system
  background: '#0A0A0F',    // Near-black, deepest layer (screen bg)
  surface: '#12121A',       // Cards, modals
  surfaceRaised: '#1C1C28', // Elevated cards, popovers
  surfaceBorder: '#2A2A3A', // Subtle borders between surfaces

  // Text
  text: '#F0F0F0',          // Primary text — off-white (easier on eyes at night)
  textSecondary: '#A0A0B8', // Secondary/label text
  textMuted: '#5A5A72',     // Placeholder, disabled text

  // Semantic
  success: '#22C55E',
  successDim: 'rgba(34, 197, 94, 0.15)',
  error: '#EF4444',
  errorDim: 'rgba(239, 68, 68, 0.15)',
  warning: '#F97316',
  warningDim: 'rgba(249, 115, 22, 0.15)',
  info: '#3B82F6',
  infoDim: 'rgba(59, 130, 246, 0.15)',

  // Utility
  border: '#2A2A3A',
  divider: '#1E1E2C',
  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.6)',
  shadowGold: 'rgba(253, 183, 25, 0.25)',

  // Legacy aliases (keeps existing imports working)
  secondary: '#0A0A0F',     // was black, now deep bg
  card: '#12121A',
  placeholder: '#5A5A72',
  textLight: '#A0A0B8',
  blacktint3: '#1C1C28',
  darker: '#C9921A',
};

export default colors;