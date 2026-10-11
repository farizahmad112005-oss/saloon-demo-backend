import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'uploads', 'placeholders');
fs.mkdirSync(dir, { recursive: true });

const items = [
  { n: 'svc-facial', t: 'Signature Facial', c1: '#F3D9E0', c2: '#C97B84' },
  { n: 'svc-deep', t: 'Deep Cleanse', c1: '#E8D5B7', c2: '#6B2D3C' },
  { n: 'svc-hydrate', t: 'Hydrating Facial', c1: '#D4E8F0', c2: '#7BA3C9' },
  { n: 'svc-glow', t: 'Glow Facial', c1: '#F7E6C8', c2: '#C4A265' },
  { n: 'svc-style', t: 'Hair Styling', c1: '#F0E0D8', c2: '#8B5A6B' },
  { n: 'svc-treat', t: 'Hair Treatment', c1: '#E5D4C8', c2: '#A67C6D' },
  { n: 'svc-wash', t: 'Hair Wash', c1: '#E8E0F0', c2: '#8B7BA8' },
  { n: 'svc-hairspa', t: 'Hair Spa', c1: '#D8EDE4', c2: '#5E9E86' },
  { n: 'svc-party', t: 'Party Makeup', c1: '#F5D0DC', c2: '#C45B7A' },
  { n: 'svc-bridal-mu', t: 'Bridal Makeup', c1: '#F8E8D8', c2: '#B8866B' },
  { n: 'svc-event', t: 'Event Makeup', c1: '#E8D8F0', c2: '#8A6BA8' },
  { n: 'svc-cleanup', t: 'Cleanup', c1: '#E8F0E0', c2: '#7A9E6B' },
  { n: 'svc-skin', t: 'Skin Treatment', c1: '#F0E8D8', c2: '#A88B6B' },
  { n: 'svc-hydration', t: 'Hydration', c1: '#D8EAF5', c2: '#5B8FC4' },
  { n: 'svc-aroma', t: 'Aromatherapy', c1: '#E8F5E8', c2: '#6B9E7A' },
  { n: 'svc-polish', t: 'Body Polish', c1: '#F5E8D8', c2: '#C49A6B' },
  { n: 'svc-trial', t: 'Bridal Trial', c1: '#F8E0E8', c2: '#A86B84' },
  { n: 'svc-bridal-full', t: 'Bridal Complete', c1: '#F5E6D0', c2: '#8B6B4A' },
  { n: 'svc-mani', t: 'Classic Manicure', c1: '#F0D8E8', c2: '#C97B9E' },
  { n: 'svc-gel', t: 'Gel Nails', c1: '#E0D8F0', c2: '#7B6BC9' },
  { n: 'svc-night', t: 'Night Facial', c1: '#2A1C20', c2: '#C97B84', dark: true },
  { n: 'facial', t: 'Facial', c1: '#F3D9E0', c2: '#6B2D3C' },
  { n: 'hair', t: 'Hair', c1: '#E8D5B7', c2: '#8B5A6B' },
  { n: 'makeup', t: 'Makeup', c1: '#F5D0DC', c2: '#C45B7A' },
  { n: 'skin', t: 'Skin Care', c1: '#D8EAF5', c2: '#5B8FC4' },
  { n: 'spa', t: 'Spa', c1: '#D8EDE4', c2: '#5E9E86' },
  { n: 'bridal', t: 'Bridal', c1: '#F8E8D8', c2: '#B8866B' },
  { n: 'nails', t: 'Nails', c1: '#F0D8E8', c2: '#C97B9E' },
  { n: 'pkg-glow', t: 'Glow Package', c1: '#F7E6C8', c2: '#C4A265' },
  { n: 'pkg-bridal', t: 'Bridal Package', c1: '#F5E6D0', c2: '#8B6B4A' },
  { n: 'pkg-radiance', t: 'Radiance', c1: '#F3D9E0', c2: '#C97B84' },
  { n: 'pkg-evening', t: 'Evening', c1: '#E8D8F0', c2: '#8A6BA8' },
  { n: 'banner-1', t: 'Summer Glow', c1: '#C97B84', c2: '#6B2D3C', dark: true },
  { n: 'banner-2', t: 'Bridal Season', c1: '#B8866B', c2: '#2A1C20', dark: true },
  { n: 'banner-3', t: 'Spa Afternoons', c1: '#5E9E86', c2: '#2A1C20', dark: true },
];

for (const i of items) {
  const text = i.dark ? '#FBF7F4' : '#6B2D3C';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${i.c1}"/>
      <stop offset="100%" stop-color="${i.c2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="900" height="700" fill="url(#bg)"/>
  <rect width="900" height="700" fill="url(#glow)"/>
  <circle cx="720" cy="160" r="140" fill="#ffffff" fill-opacity="0.18"/>
  <circle cx="160" cy="560" r="180" fill="#2A1C20" fill-opacity="0.10"/>
  <ellipse cx="450" cy="320" rx="160" ry="210" fill="#ffffff" fill-opacity="0.12"/>
  <text x="60" y="620" font-family="Georgia, serif" font-size="42" fill="${text}" opacity="0.9">${i.t}</text>
  <text x="60" y="660" font-family="Arial, sans-serif" font-size="18" fill="${text}" opacity="0.55">Luxe Belle Salon</text>
</svg>`;
  fs.writeFileSync(path.join(dir, `${i.n}.svg`), svg, 'utf8');
}

console.log(`Generated ${items.length} placeholder images in ${dir}`);
