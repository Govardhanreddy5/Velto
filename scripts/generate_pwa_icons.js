const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. Standard App Icon SVG (with rounded squircle for display/apple touch, and transparent/glow)
const createStandardSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="50%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <linearGradient id="markGrad" x1="120" y1="120" x2="390" y2="390" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e0e7ff"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="260" y1="140" x2="400" y2="280" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Background Base with rounded squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Subtle inner border highlight -->
  <rect x="4" y="4" width="504" height="504" rx="108" fill="none" stroke="white" stroke-opacity="0.15" stroke-width="4"/>

  <!-- Subtle glow spot behind mark -->
  <circle cx="256" cy="256" r="140" fill="#60a5fa" fill-opacity="0.2" filter="blur(40px)"/>

  <!-- Velto Core Icon: Stylized V + Exchange Arrows -->
  <g filter="url(#shadow)">
    <!-- Primary Bold "V" Shape -->
    <!-- Left leg of V -->
    <path d="M 124 148 L 196 148 L 256 328 L 220 328 Z" fill="url(#markGrad)"/>

    <!-- Right leg of V that extends into an exchange dynamic beam -->
    <path d="M 388 148 L 316 148 L 256 328 L 292 328 Z" fill="url(#markGrad)"/>

    <!-- Center vertex cap -->
    <path d="M 216 324 L 296 324 L 256 396 Z" fill="url(#markGrad)"/>

    <!-- Dynamic Exchange Arrow 1 (Cash to UPI - Emerald/Cyan accent) -->
    <path d="M 230 216 L 350 216 M 326 192 L 352 216 L 326 240" stroke="url(#accentGrad)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Dynamic Exchange Arrow 2 (UPI to Cash) -->
    <path d="M 282 284 L 162 284 M 186 260 L 160 284 L 186 308" stroke="#ffffff" stroke-opacity="0.9" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

// 2. Maskable Icon SVG (full bleed rectangle, content inside 80% safe zone circle)
const createMaskableSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradMask" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="50%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <linearGradient id="markGradMask" x1="120" y1="120" x2="390" y2="390" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e0e7ff"/>
    </linearGradient>
    <linearGradient id="accentGradMask" x1="260" y1="140" x2="400" y2="280" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <filter id="shadowMask" x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Full-bleed background without border radius (OS will mask it to circle / squircle / teardrop) -->
  <rect width="512" height="512" fill="url(#bgGradMask)"/>

  <!-- Centered safe-zone scaled icon: scaled to 0.78 around center (256, 256) -->
  <g transform="translate(56, 56) scale(0.78)">
    <g filter="url(#shadowMask)">
      <path d="M 124 148 L 196 148 L 256 328 L 220 328 Z" fill="url(#markGradMask)"/>
      <path d="M 388 148 L 316 148 L 256 328 L 292 328 Z" fill="url(#markGradMask)"/>
      <path d="M 216 324 L 296 324 L 256 396 Z" fill="url(#markGradMask)"/>

      <path d="M 230 216 L 350 216 M 326 192 L 352 216 L 326 240" stroke="url(#accentGradMask)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 282 284 L 162 284 M 186 260 L 160 284 L 186 308" stroke="#ffffff" stroke-opacity="0.9" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>
`;

async function generate() {
  const stdSvg = Buffer.from(createStandardSvg(512));
  const maskSvg = Buffer.from(createMaskableSvg(512));

  // 1. icon-192x192.png
  await sharp(stdSvg).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192x192.png'));
  console.log('Generated icon-192x192.png');

  // 2. icon-512x512.png
  await sharp(stdSvg).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512x512.png'));
  console.log('Generated icon-512x512.png');

  // 3. icon-maskable-192x192.png
  await sharp(maskSvg).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-maskable-192x192.png'));
  console.log('Generated icon-maskable-192x192.png');

  // 4. icon-maskable-512x512.png
  await sharp(maskSvg).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-maskable-512x512.png'));
  console.log('Generated icon-maskable-512x512.png');

  // 5. apple-touch-icon.png (180x180)
  await sharp(stdSvg).resize(180, 180).png().toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  // Also place apple-touch-icon in public root for crawlers that check /apple-touch-icon.png
  await sharp(stdSvg).resize(180, 180).png().toFile(path.join(__dirname, '..', 'public', 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 6. favicon-32x32.png and favicon-16x16.png
  await sharp(stdSvg).resize(32, 32).png().toFile(path.join(iconsDir, 'favicon-32x32.png'));
  await sharp(stdSvg).resize(16, 16).png().toFile(path.join(iconsDir, 'favicon-16x16.png'));
  console.log('Generated favicons');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
