// State
let PALETTE = null;
let GRADIENTS = [];
let hexToName = {};
let selectedHex = null;

// Bootstrap
async function loadData() {
    const manifest = await fetch('json/manifest.json').then(r => r.json());

    const palRes = await fetch(`json/palette/${manifest.palettes[0]}.json`);
    PALETTE = await palRes.json();

    for (const [name, hex] of Object.entries(PALETTE.colors)) {
        hexToName[hex.toLowerCase()] = name;
    }

    const rampFetches = manifest.gradients.map(n =>
        fetch(`json/gradient/${n}.json`).then(r => r.json())
    );
    GRADIENTS = await Promise.all(rampFetches);
}

async function init() {
    await loadData();
    buildAllColors(document.getElementById('allColors'));
    buildFamilies(document.getElementById('families'));
    buildGradients(document.getElementById('gradients'));
    document.getElementById('infoCopy').addEventListener('click', copySelected);
    document.addEventListener('click', onDocumentClick);
}

document.addEventListener('DOMContentLoaded', init);

// Color math
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16)
    ];
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l * 100];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = (max === r ? (g - b) / d + (g < b ? 6 : 0)
        : max === g ? (b - r) / d + 2
            : (r - g) / d + 4) / 6;
    return [h * 360, s * 100, l * 100];
}

function hue2rgb(p, q, t) {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

function hslToHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    if (s === 0) {
        const v = Math.round(l * 255).toString(16).padStart(2, '0');
        return `#${v}${v}${v}`;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

// Dynamic theme
const DEFAULT_DYN = {
    '--dyn-text': '#86e0ce',
    '--dyn-text-dim': '#446374',
    '--dyn-accent': '#9f3c91',
    '--dyn-border': '#32495f',
    '--dyn-link': '#3fa0a4',
};

function buildDynPalette(h, s, l) {
    const textL = Math.max(45, Math.min(80, l < 20 ? l + 55 : l > 85 ? l - 15 : l));
    const dimL = Math.max(25, Math.min(55, textL - 22));
    const borderL = Math.max(18, Math.min(45, textL - 35));
    const accentS = Math.max(40, Math.min(80, s));
    return {
        '--dyn-text': hslToHex(h, Math.max(30, s), textL),
        '--dyn-text-dim': hslToHex(h, Math.max(20, s * 0.7), dimL),
        '--dyn-border': hslToHex(h, Math.max(20, s * 0.6), borderL),
        '--dyn-accent': hslToHex((h + 150) % 360, accentS, Math.max(50, Math.min(75, textL))),
        '--dyn-link': hslToHex((h + 60) % 360, accentS, Math.max(50, Math.min(72, textL))),
    };
}

function applyDynColors(hex) {
    const root = document.documentElement;
    const props = hex
        ? buildDynPalette(...rgbToHsl(...hexToRgb(hex)))
        : DEFAULT_DYN;
    for (const [prop, value] of Object.entries(props)) {
        root.style.setProperty(prop, value);
    }
}

// DOM helpers
function makeEl(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}

function makeSwatch(hex, name) {
    const el = makeEl('div', 'swatch');
    el.style.background = hex;
    el.dataset.hex = hex;
    el.addEventListener('mouseenter', e => showTooltip(e, hex, name));
    el.addEventListener('mousemove', moveTooltip);
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('click', e => { e.stopPropagation(); selectColor(hex, name); });
    return el;
}

function makeSwatchRow(hexes, cssClass) {
    const wrap = makeEl('div', cssClass);
    for (const hex of hexes) {
        wrap.appendChild(makeSwatch(hex, hexToName[hex.toLowerCase()] || hex));
    }
    return wrap;
}

function makeCopyArrayBtn(hexes, row) {
    const btn = makeEl('div', 'gradient-copy');
    btn.textContent = 'copy array';
    btn.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(hexes));
        btn.textContent = 'copied!';
        row.classList.add('copied');
        setTimeout(() => { btn.textContent = 'copy array'; row.classList.remove('copied'); }, 1500);
    });
    return btn;
}

// Section builders
function buildAllColors(container) {
    for (const [name, hex] of Object.entries(PALETTE.colors)) {
        container.appendChild(makeSwatch(hex, name));
    }
}

function buildFamilies(container) {
    for (const [family, hexes] of Object.entries(PALETTE.families)) {
        const row = makeEl('div', 'family-row');
        const label = makeEl('div', 'family-label');
        label.textContent = family;
        row.appendChild(label);
        row.appendChild(makeSwatchRow(hexes, 'family-swatches'));
        container.appendChild(row);
    }
}

function buildGradients(container) {
    for (const { name, colors } of GRADIENTS) {
        const row = makeEl('div', 'gradient-row');
        const label = makeEl('div', 'gradient-label');
        label.textContent = name.replace(/_/g, ' ');
        row.appendChild(label);
        row.appendChild(makeSwatchRow(colors, 'gradient-bar'));
        row.appendChild(makeCopyArrayBtn(colors, row));

        const midHex = colors[Math.floor(colors.length / 2)];
        const midName = hexToName[midHex.toLowerCase()] || midHex;
        row.addEventListener('click', () => selectColor(midHex, midName));
        container.appendChild(row);
    }
}

//Selection
function selectColor(hex, name) {
    selectedHex = hex;
    document.querySelectorAll('.swatch.selected').forEach(s => s.classList.remove('selected'));
    document.querySelectorAll(`.swatch[data-hex="${hex}"]`).forEach(s => s.classList.add('selected'));
    document.getElementById('infoSwatch').style.background = hex;
    document.getElementById('infoHex').textContent = hex.toUpperCase();
    document.getElementById('infoName').textContent = (name || '').replace(/_/g, ' ');
    applyDynColors(hex);
}

function clearSelection() {
    selectedHex = null;
    document.querySelectorAll('.swatch.selected').forEach(s => s.classList.remove('selected'));
    document.getElementById('infoSwatch').style.background = '';
    document.getElementById('infoHex').textContent = '';
    document.getElementById('infoName').textContent = 'select a color';
    applyDynColors(null);
}

function copySelected() {
    if (!selectedHex) return;
    navigator.clipboard.writeText(selectedHex.toUpperCase());
    const btn = document.getElementById('infoCopy');
    btn.textContent = 'copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'copy hex'; btn.classList.remove('copied'); }, 1500);
}

function onDocumentClick(e) {
    const PROTECTED = 'a, img, .swatch, .gradient-copy, .info-copy, .info-bar, .info-bar *';
    if (!e.target.closest(PROTECTED)) clearSelection();
}

//Tooltip
const tooltip = document.getElementById('tooltip');

function showTooltip(e, hex, name) {
    tooltip.textContent = `${hex.toUpperCase()}  ${(name || '').replace(/_/g, ' ')}`;
    tooltip.style.display = 'block';
    moveTooltip(e);
}

function moveTooltip(e) {
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY - 28) + 'px';
}

function hideTooltip() {
    tooltip.style.display = 'none';

}
