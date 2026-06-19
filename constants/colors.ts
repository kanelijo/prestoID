export const Colors = {
  // Background layers (Stitch Warm White / Kinetic Ethereal)
  bg: {
    primary: '#FFF8F6',       // Main background (warm off-white)
    secondary: '#FFFFFF',     // Card background (pure white)
    tertiary: '#FFF1ED',      // Section background / low surface
    input: '#FFF1ED',         // Input background
  },

  // Text (Deep warm browns)
  text: {
    primary: '#281713',       // Main headers and labels
    secondary: '#5C4039',     // Muted description text
    tertiary: '#916F67',      // Faint placeholder / border text
    inverse: '#FFFFFF',       // Text on primary buttons
  },

  // Brand accents (Warm coral-red)
  accent: {
    primary: '#AF2800',       // Core brand color (Stitch primary)
    secondary: '#A43C22',     // Secondary brand color
    container: '#DC3400',     // Elevated primary color
    gradient: ['#AF2800', '#FD7E5E'] as const,
    glow: 'rgba(175, 40, 0, 0.1)',
  },

  // Semantic status colors
  status: {
    success: '#34C759',       // Green (paid, present)
    danger: '#FF3B30',        // Red (absent, overdue)
    warning: '#FF9500',       // Amber (late, upcoming)
    info: '#007AFF',          // Blue
  },

  // Card styling
  card: {
    border: '#E6BEB4',        // Outline variant
    glass: 'rgba(255, 255, 255, 0.85)',
    highlight: '#FFE9E4',
  },

  // Custom Stitch Specific Color Tokens
  stitch: {
    primaryFixed: '#FFDAD2',
    primaryFixedDim: '#FFB4A2',
    surfaceContainerHigh: '#FFE2DB',
    surfaceContainerHighest: '#FBDCD4',
    tertiaryNeutral: '#5B5C5C',
    tertiaryNeutralContainer: '#737575',
  },

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export const Gradients = {
  primary: ['#AF2800', '#FD7E5E'],
  card: ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.7)'],
  success: ['#34C759', '#28A745'],
  danger: ['#FF3B30', '#DC3545'],
  dark: ['#FFF8F6', '#FFF1ED'],
  idCardFront: ['#FFFFFF', '#FFF8F6'],
  idCardBack: ['#FFFFFF', '#FFF1ED'],
};

export const Shadows = {
  sm: {
    shadowColor: '#281713',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#281713',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
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
