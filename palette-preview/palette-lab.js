const palettes = [
  { id:'lavender-voltage', name:'Lavender Voltage', meaning:'British · surreal · quietly radical', accent:'#A8B0FF', deep:'#555FC4', light:'#D9DCFF', rgb:'168,176,255', filter:'hue-rotate(152deg) saturate(1.36) brightness(1.12)' },
  { id:'burnished-lilac', name:'Burnished Lilac', meaning:'Vintage · perfumed · reimagined', accent:'#D3A4FF', deep:'#8554B4', light:'#EAD5FF', rgb:'211,164,255', filter:'hue-rotate(186deg) saturate(1.22) brightness(1.13)' },
  { id:'teaberry-chrome', name:'Teaberry Chrome', meaning:'Theatrical · dramatic · playful', accent:'#FF6C9F', deep:'#A92C58', light:'#FFC0D5', rgb:'255,108,159', filter:'hue-rotate(258deg) saturate(1.4) brightness(1.08)' },
  { id:'optical-coral', name:'Optical Coral', meaning:'Warm · editorial · hyperreal', accent:'#FF6F91', deep:'#A92D4C', light:'#FFC1D0', rgb:'255,111,145', filter:'hue-rotate(265deg) saturate(1.42) brightness(1.08)' },
  { id:'firoozeh-pulse', name:'Firoozeh Pulse', meaning:'Persian · protective · sky-bound', accent:'#2DE2D0', deep:'#087E79', light:'#A8F5EC', rgb:'45,226,208', filter:'hue-rotate(91deg) saturate(1.62) brightness(1.08)', family:'persian' },
  { id:'gol-e-mohammadi', name:'Gol-e Mohammadi', meaning:'Persian · poetic · sensorial', accent:'#FF4FA3', deep:'#A21C61', light:'#FFB5D6', rgb:'255,79,163', filter:'hue-rotate(253deg) saturate(1.52) brightness(1.07)', family:'persian' },
  { id:'minai-magenta', name:'Mina’i Magenta', meaning:'Persian · polychrome · intricate', accent:'#E860C5', deep:'#8C2875', light:'#F3B7E3', rgb:'232,96,197', filter:'hue-rotate(230deg) saturate(1.38) brightness(1.06)', family:'persian' }
];

const colourRoute = [
  { id:'selected', label:'Selected Palette', paletteIds:['lavender-voltage','burnished-lilac','teaberry-chrome','optical-coral','firoozeh-pulse','minai-magenta','gol-e-mohammadi'] }
];

const paletteById = new Map(palettes.map((palette) => [palette.id, palette]));
const routedPalettes = colourRoute.flatMap((route) => route.paletteIds.map((id) => ({ ...paletteById.get(id), route })));

const frame = document.querySelector('iframe');
const shell = document.querySelector('.preview-shell');
const switcher = document.querySelector('.palette-switcher');
const routeOutput = document.querySelector('.palette-route');
const nameOutput = document.querySelector('[data-palette-name]');
const meaningOutput = document.querySelector('[data-palette-meaning]');
const hexOutput = document.querySelector('[data-palette-hex]');
const renderMode = new URL(location.href).searchParams.get('render') === '1';
let activePalette = palettes[0];
let sourceCss = '';

if (renderMode) document.body.classList.add('render-mode');

colourRoute.forEach((route, index) => {
  const label = document.createElement('span');
  label.dataset.route = route.id;
  label.textContent = `${String(index + 1).padStart(2, '0')} ${route.label}`;
  routeOutput.appendChild(label);
});

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
  routeOutput.querySelectorAll('span').forEach((label) => {
    label.classList.toggle('is-active', label.dataset.route === palette.route.id);
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

routedPalettes.forEach((palette, index) => {
  const button = document.createElement('button');
  button.className = 'palette-button';
  button.type = 'button';
  button.dataset.palette = palette.id;
  button.dataset.route = palette.route.id;
  if (palette.family) button.dataset.family = palette.family;
  if (index === 0 || routedPalettes[index - 1].route.id !== palette.route.id) {
    button.classList.add('route-start');
    button.dataset.routeLabel = palette.route.label;
  }
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
    selectPalette(routedPalettes.find((palette) => palette.id === requested) || routedPalettes[0], false);
    applyPalette();
  })
  .catch(() => {
    document.querySelector('.preview-loading').textContent = 'Start a local web server to open the Palette Lab';
  });
