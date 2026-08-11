const palettes = [
  {
    id: 'hyper-pink',
    name: 'Hyper Pink',
    meaning: 'Imaginative · cultural · expressive',
    accent: '#FF3EA5',
    deep: '#B6005B',
    light: '#FFC0DF',
    rgb: '255,62,165',
    filter: 'hue-rotate(240deg) saturate(1.48) brightness(1.08)'
  },
  {
    id: 'signal-red',
    name: 'Signal Red',
    meaning: 'Bold · decisive · high-energy',
    accent: '#FF4A3D',
    deep: '#B81710',
    light: '#FFB5AF',
    rgb: '255,74,61',
    filter: 'hue-rotate(274deg) saturate(1.65) brightness(1.05)'
  },
  {
    id: 'solar-yellow',
    name: 'Solar Yellow',
    meaning: 'Inventive · optimistic · visible',
    accent: '#FFD60A',
    deep: '#B88700',
    light: '#FFF0A3',
    rgb: '255,214,10',
    filter: 'hue-rotate(320deg) saturate(1.5) brightness(1.08)'
  },
  {
    id: 'flare-orange',
    name: 'Flare Orange',
    meaning: 'Human · energetic · progressive',
    accent: '#FF7A00',
    deep: '#C43D00',
    light: '#FFC27A',
    rgb: '255,122,0',
    filter: 'hue-rotate(299deg) saturate(1.7) brightness(1.04)'
  },
  {
    id: 'electric-blue',
    name: 'Electric Blue',
    meaning: 'Trusted · intelligent · future-facing',
    accent: '#4D8DFF',
    deep: '#1748C9',
    light: '#B9D1FF',
    rgb: '77,141,255',
    filter: 'hue-rotate(127deg) saturate(1.52) brightness(1.08)'
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
