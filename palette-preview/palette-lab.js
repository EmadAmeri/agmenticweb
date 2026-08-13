const palettes = [
  { id:'acid-chartreuse', name:'Acid Chartreuse', meaning:'Possibility · activation · experimentation', accent:'#C7FF00', deep:'#769900', light:'#EBFF9E', rgb:'199,255,0', filter:'hue-rotate(350deg) saturate(1.9) brightness(1.12)', family:'strategic' },
  { id:'electric-cobalt', name:'Electric Cobalt', meaning:'Intellectual · authoritative · future-facing', accent:'#5B63FF', deep:'#2930A8', light:'#B9BCFF', rgb:'91,99,255', filter:'hue-rotate(157deg) saturate(1.75) brightness(1.06)', family:'strategic' },
  { id:'gol-e-mohammadi', name:'Gol-e Mohammadi', meaning:'Persian · poetic · sensorial', accent:'#FF4FA3', deep:'#A21C61', light:'#FFB5D6', rgb:'255,79,163', filter:'hue-rotate(253deg) saturate(1.52) brightness(1.07)', family:'persian' },
  { id:'firoozeh-pulse', name:'Firoozeh Pulse', meaning:'Persian · protective · sky-bound', accent:'#2DE2D0', deep:'#087E79', light:'#A8F5EC', rgb:'45,226,208', filter:'hue-rotate(91deg) saturate(1.62) brightness(1.08)', family:'persian' },
  { id:'optical-coral', name:'Optical Coral', meaning:'Warm · editorial · hyperreal', accent:'#FF6F91', deep:'#A92D4C', light:'#FFC1D0', rgb:'255,111,145', filter:'hue-rotate(265deg) saturate(1.42) brightness(1.08)' },
  { id:'lavender-voltage', name:'Lavender Voltage', meaning:'British · surreal · quietly radical', accent:'#A8B0FF', deep:'#555FC4', light:'#D9DCFF', rgb:'168,176,255', filter:'hue-rotate(152deg) saturate(1.36) brightness(1.12)' },
  { id:'burnished-lilac', name:'Burnished Lilac', meaning:'Vintage · perfumed · reimagined', accent:'#D3A4FF', deep:'#8554B4', light:'#EAD5FF', rgb:'211,164,255', filter:'hue-rotate(186deg) saturate(1.22) brightness(1.13)' },
  { id:'mini-blazing-blue', name:'MINI Blazing Blue', meaning:'Electric · assured · urban', accent:'#2763D8', deep:'#12337C', light:'#9AB9F4', rgb:'39,99,216', filter:'hue-rotate(139deg) saturate(1.62) brightness(.98)', family:'mini' },
  { id:'mini-smokey-green', name:'MINI Smokey Green', meaning:'Tactile · grounded · quietly progressive', accent:'#66735A', deep:'#384032', light:'#BAC3B2', rgb:'102,115,90', filter:'hue-rotate(28deg) saturate(.72) brightness(.78)', family:'mini' }
];

const colourRoute = [
  { id:'selected', label:'Final Shortlist', paletteIds:['acid-chartreuse','electric-cobalt','gol-e-mohammadi','firoozeh-pulse','optical-coral','lavender-voltage','burnished-lilac'] },
  { id:'mini', label:'MINI Black Pairings', paletteIds:['mini-blazing-blue','mini-smokey-green'] }
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
