const palettes = [
  {
    id: 'phosphor-pink',
    name: 'Phosphor Pink',
    meaning: 'Uncanny · expressive · digital',
    accent: '#FF29C3',
    deep: '#A90076',
    light: '#FFB7E9',
    rgb: '255,41,195',
    filter: 'hue-rotate(220deg) saturate(1.65) brightness(1.08)'
  },
  {
    id: 'acid-citron',
    name: 'Acid Citron',
    meaning: 'Spontaneous · disruptive · luminous',
    accent: '#E8FF00',
    deep: '#91A800',
    light: '#F6FFA0',
    rgb: '232,255,0',
    filter: 'hue-rotate(334deg) saturate(1.7) brightness(1.12)'
  },
  {
    id: 'electric-blue-lemonade',
    name: 'Electric Blue Lemonade',
    meaning: 'Crisp · kinetic · future-facing',
    accent: '#26C6FF',
    deep: '#006FA8',
    light: '#B4EBFF',
    rgb: '38,198,255',
    filter: 'hue-rotate(104deg) saturate(1.55) brightness(1.08)'
  },
  {
    id: 'amethyst-orchid',
    name: 'Amethyst Orchid',
    meaning: 'Visionary · magnetic · neo-luxe',
    accent: '#B95CFF',
    deep: '#6E18B4',
    light: '#DFC0FF',
    rgb: '185,92,255',
    filter: 'hue-rotate(184deg) saturate(1.52) brightness(1.06)'
  },
  {
    id: 'lavender-voltage',
    name: 'Lavender Voltage',
    meaning: 'British · surreal · quietly radical',
    accent: '#A8B0FF',
    deep: '#555FC4',
    light: '#D9DCFF',
    rgb: '168,176,255',
    filter: 'hue-rotate(144deg) saturate(1.36) brightness(1.12)'
  }
];

const frame = document.querySelector('iframe');
const shell = document.querySelector('.preview-shell');
const switcher = document.querySelector('.palette-switcher');
const nameOutput = document.querySelector('[data-palette-name]');
const meaningOutput = document.querySelector('[data-palette-meaning]');
const hexOutput = document.querySelector('[data-palette-hex]');
let activePalette = palettes[0];
let sourceCss = '';

function replaceAll(source, search, replacement) {
  return source.split(search).join(replacement);
}

function resolvePaletteCss(palette) {
  let css = sourceCss;
  css = replaceAll(css, '#b8eb52', palette.accent);
  css = replaceAll(css, '#5aaa10', palette.deep);
  css = replaceAll(css, '%23b8eb52', `%23${palette.accent.slice(1)}`);
  css = replaceAll(css, '%235aaa10', `%23${palette.deep.slice(1)}`);
  css = replaceAll(css, '184,235,82', palette.rgb);
  css = replaceAll(css, '216,248,151', `${parseInt(palette.light.slice(1,3),16)},${parseInt(palette.light.slice(3,5),16)},${parseInt(palette.light.slice(5,7),16)}`);
  return `${css}\n.brand img{filter:${palette.filter} drop-shadow(0 0 .6rem color-mix(in srgb,${palette.accent} 18%,transparent))}`;
}

function updateControls(palette) {
  document.documentElement.style.setProperty('--active', palette.accent);
  nameOutput.textContent = palette.name;
  meaningOutput.textContent = palette.meaning;
  hexOutput.textContent = palette.accent;
  switcher.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-current', String(button.dataset.palette === palette.id));
  });
}

function applyPalette() {
  const doc = frame.contentDocument;
  if (!doc || !sourceCss) return;
  doc.querySelector('#palette-lab-override')?.remove();
  const style = doc.createElement('style');
  style.id = 'palette-lab-override';
  style.textContent = resolvePaletteCss(activePalette);
  doc.head.appendChild(style);
  doc.querySelector('[data-invite-form]')?.addEventListener('submit', (event) => event.preventDefault(), true);
  shell.classList.add('is-ready');
}

function selectPalette(palette, shouldReload = true) {
  activePalette = palette;
  updateControls(palette);
  const url = new URL(location.href);
  url.searchParams.set('palette', palette.id);
  history.replaceState({}, '', url);
  if (shouldReload) {
    shell.classList.remove('is-ready');
    frame.src = `../index.html?palette-preview=${palette.id}`;
  }
}

palettes.forEach((palette) => {
  const button = document.createElement('button');
  button.className = 'palette-button';
  button.type = 'button';
  button.dataset.palette = palette.id;
  button.style.setProperty('--swatch', palette.accent);
  button.setAttribute('aria-label', `Preview ${palette.name}`);
  button.title = `${palette.name} · ${palette.accent}`;
  button.addEventListener('click', () => selectPalette(palette));
  switcher.appendChild(button);
});

frame.addEventListener('load', applyPalette);

fetch('../styles.css')
  .then((response) => {
    if (!response.ok) throw new Error('Could not load the source stylesheet.');
    return response.text();
  })
  .then((css) => {
    sourceCss = css;
    const requested = new URL(location.href).searchParams.get('palette');
    selectPalette(palettes.find((palette) => palette.id === requested) || palettes[0], false);
    applyPalette();
  })
  .catch(() => {
    document.querySelector('.preview-loading').textContent = 'Start a local web server to open the Palette Lab';
  });
