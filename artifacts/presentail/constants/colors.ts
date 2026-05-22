const palette = {
  teal900: "#00414E",
  teal800: "#0a5663",
  teal600: "#177889",
  mint: "#5EEAD4",
  cream: "#FAF6EE",
  ivory: "#FFFBF4",
  gold: "#C9A94B",
  goldSoft: "#E6CB7B",
  blush: "#F5DDD2",
  charcoal: "#1A2226",
  slate: "#69727D",
};

const colors = {
  light: {
    text: palette.charcoal,
    tint: palette.teal900,

    background: "#ffffff",
    foreground: palette.teal900,

    card: "#ffffff",
    cardForeground: palette.teal900,

    primary: palette.teal900,
    primaryForeground: "#ffffff",

    secondary: palette.cream,
    secondaryForeground: palette.teal900,

    muted: "#F1ECE2",
    mutedForeground: palette.slate,

    accent: palette.mint,
    accentForeground: palette.teal900,

    gold: palette.gold,
    goldSoft: palette.goldSoft,
    blush: palette.blush,
    teal800: palette.teal800,
    teal600: palette.teal600,

    destructive: "#b3261e",
    destructiveForeground: "#ffffff",

    border: "#E8E1D2",
    input: "#E8E1D2",
  },
  radius: 18,
};

export default colors;
