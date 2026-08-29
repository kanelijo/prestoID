export const Colors = {
  // Background layers (WhatsApp Pure Clean System)
  bg: {
    primary: '#FFFFFF',       // Pure white main app background
    secondary: '#FFFFFF',     // Pure white card background
    tertiary: '#F8F9FA',      // Subtle off-white section background
    input: '#F0F2F5',         // Crisp WhatsApp input surface
  },

  // Text (High Contrast Dark Charcoal)
  text: {
    primary: '#111827',       // Crisp main headers and labels
    secondary: '#4B5563',     // Clean readable secondary text
    tertiary: '#9CA3AF',      // Faint placeholder / border text
    inverse: '#FFFFFF',       // Text on primary buttons
  },

  // Brand accents (Replacing WhatsApp Green with Brand Color)
  accent: {
    primary: '#AF2800',       // Core brand color
    secondary: '#8E2000',     // Dark brand color
    container: '#FFF1ED',     // Subtle brand surface tint
    gradient: ['#AF2800', '#D34515'] as const,
    glow: 'rgba(175, 40, 0, 0.08)',
  },

  // Semantic status colors
  status: {
    success: '#10B981',       // Crisp emerald green
    danger: '#EF4444',        // Red
    warning: '#F59E0B',       // Amber
    info: '#3B82F6',          // Blue
  },

  // Card & Divider styling (Subtle 1px WhatsApp Dividers)
  card: {
    border: '#E5E7EB',        // Crisp 1px subtle divider
    divider: '#F1F5F9',       // Ultralight separator
    glass: 'rgba(255, 255, 255, 0.95)',
    highlight: '#FFF1ED',
  },

  // Stitch & Modern Tokens
  stitch: {
    primaryFixed: '#FFE2DB',
    primaryFixedDim: '#FFC4B5',
    surfaceContainerHigh: '#F8F9FA',
    surfaceContainerHighest: '#F0F2F5',
    tertiaryNeutral: '#64748B',
    tertiaryNeutralContainer: '#94A3B8',
  },

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export const Gradients = {
  primary: ['#AF2800', '#D34515'],
  card: ['#FFFFFF', '#FFFFFF'],
  success: ['#10B981', '#059669'],
  danger: ['#EF4444', '#DC2626'],
  dark: ['#FFFFFF', '#F8F9FA'],
  idCardFront: ['#FFFFFF', '#FFFFFF'],
  idCardBack: ['#FFFFFF', '#F8F9FA'],
};

export const Shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#AF2800',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 6,
  },
  glow: {
    shadowColor: '#AF2800',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
};
