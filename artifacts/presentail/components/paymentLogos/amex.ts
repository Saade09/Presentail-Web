// Simplified Amex chip mark sized to render crisply at small chip dimensions.
// Original brand square SVG renders the wordmark too small to read inside a
// 44x26 chip, so we use a wordmark-only mark on a transparent background and
// let the surrounding chip provide the blue background color.
// i18n-ignore — SVG brand mark, not a UI string
export const amexXml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 26">
  <text x="22" y="11.2" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="6" letter-spacing="0.4" fill="#FFFFFF">AMERICAN</text>
  <text x="22" y="19.2" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="6.4" letter-spacing="0.4" fill="#FFFFFF">EXPRESS</text>
</svg>`;
