const palettes = [
  { id:'phosphor-pink', name:'Phosphor Pink', meaning:'Uncanny · expressive · digital', accent:'#FF29C3', deep:'#A90076', light:'#FFB7E9', rgb:'255,41,195', filter:'hue-rotate(231deg) saturate(1.65) brightness(1.08)' },
  { id:'acid-citron', name:'Acid Citron', meaning:'Spontaneous · disruptive · luminous', accent:'#E8FF00', deep:'#91A800', light:'#F6FFA0', rgb:'232,255,0', filter:'hue-rotate(342deg) saturate(1.7) brightness(1.12)' },
  { id:'electric-blue-lemonade', name:'Electric Blue Lemonade', meaning:'Crisp · kinetic · future-facing', accent:'#26C6FF', deep:'#006FA8', light:'#B4EBFF', rgb:'38,198,255', filter:'hue-rotate(112deg) saturate(1.55) brightness(1.08)' },
  { id:'amethyst-orchid', name:'Amethyst Orchid', meaning:'Visionary · magnetic · neo-luxe', accent:'#B95CFF', deep:'#6E18B4', light:'#DFC0FF', rgb:'185,92,255', filter:'hue-rotate(191deg) saturate(1.52) brightness(1.06)' },
  { id:'lavender-voltage', name:'Lavender Voltage', meaning:'British · surreal · quietly radical', accent:'#A8B0FF', deep:'#555FC4', light:'#D9DCFF', rgb:'168,176,255', filter:'hue-rotate(152deg) saturate(1.36) brightness(1.12)' },
  { id:'fig-electric', name:'Fig Electric', meaning:'Exotic · nocturnal · cultured', accent:'#D85BDE', deep:'#84248A', light:'#EDB7F0', rgb:'216,91,222', filter:'hue-rotate(215deg) saturate(1.42) brightness(1.05)' },
  { id:'crocus-static', name:'Crocus Static', meaning:'Floral · strange · high-frequency', accent:'#9C6CFF', deep:'#5932B5', light:'#CEB9FF', rgb:'156,108,255', filter:'hue-rotate(175deg) saturate(1.5) brightness(1.05)' },
  { id:'burnished-lilac', name:'Burnished Lilac', meaning:'Vintage · perfumed · reimagined', accent:'#D3A4FF', deep:'#8554B4', light:'#EAD5FF', rgb:'211,164,255', filter:'hue-rotate(186deg) saturate(1.22) brightness(1.13)' },
  { id:'crown-cobalt', name:'Crown Cobalt', meaning:'Authoritative · electric · enduring', accent:'#5B7CFF', deep:'#243CA8', light:'#B8C4FF', rgb:'91,124,255', filter:'hue-rotate(144deg) saturate(1.68) brightness(1.08)' },
  { id:'ether-cyan', name:'Ether Cyan', meaning:'Ethereal · lucid · weightless', accent:'#69E1FF', deep:'#1685A7', light:'#C3F2FF', rgb:'105,225,255', filter:'hue-rotate(110deg) saturate(1.35) brightness(1.15)' },
  { id:'dutch-canal-neon', name:'Dutch Canal Neon', meaning:'Airy · urban · precise', accent:'#40B9E8', deep:'#076C95', light:'#ACE4F7', rgb:'64,185,232', filter:'hue-rotate(112deg) saturate(1.35) brightness(1.05)' },
  { id:'radio-mint', name:'Radio Mint', meaning:'Synthetic · alive · optimistic', accent:'#00F0B5', deep:'#00856A', light:'#9DFFE5', rgb:'0,240,181', filter:'hue-rotate(82deg) saturate(1.75) brightness(1.08)' },
  { id:'petrol-fanfare', name:'Petrol Fanfare', meaning:'Composed · industrial · unexpected', accent:'#00C7B7', deep:'#006E68', light:'#91ECE4', rgb:'0,199,183', filter:'hue-rotate(92deg) saturate(1.6) brightness(1.02)' },
  { id:'shale-laser', name:'Shale Laser', meaning:'Mineral · tactile · speculative', accent:'#A8D86D', deep:'#587A2D', light:'#D6EDB9', rgb:'168,216,109', filter:'hue-rotate(8deg) saturate(1.1) brightness(1.04)' },
  { id:'sulfur-bloom', name:'Sulfur Bloom', meaning:'Sharp · alchemical · immediate', accent:'#F4E600', deep:'#9C8D00', light:'#FFF59B', rgb:'244,230,0', filter:'hue-rotate(333deg) saturate(1.65) brightness(1.1)' },
  { id:'banana-pulse', name:'Banana Pulse', meaning:'Human · playful · softly electric', accent:'#FFE67A', deep:'#A88620', light:'#FFF4C2', rgb:'255,230,122', filter:'hue-rotate(326deg) saturate(1.22) brightness(1.16)' },
  { id:'amaranth-signal', name:'Amaranth Signal', meaning:'Cosmopolitan · mysterious · resonant', accent:'#EE4B9B', deep:'#941957', light:'#F7AFD1', rgb:'238,75,155', filter:'hue-rotate(243deg) saturate(1.5) brightness(1.04)' },
  { id:'teaberry-chrome', name:'Teaberry Chrome', meaning:'Theatrical · dramatic · playful', accent:'#FF6C9F', deep:'#A92C58', light:'#FFC0D5', rgb:'255,108,159', filter:'hue-rotate(258deg) saturate(1.4) brightness(1.08)' },
  { id:'optical-coral', name:'Optical Coral', meaning:'Warm · editorial · hyperreal', accent:'#FF6F91', deep:'#A92D4C', light:'#FFC1D0', rgb:'255,111,145', filter:'hue-rotate(265deg) saturate(1.42) brightness(1.08)' },
  { id:'infra-violet', name:'Infra Violet', meaning:'Dark · technical · subcultural', accent:'#7868FF', deep:'#392DB0', light:'#BDB5FF', rgb:'120,104,255', filter:'hue-rotate(164deg) saturate(1.72) brightness(1.03)' },
  { id:'firoozeh-pulse', name:'Firoozeh Pulse', meaning:'Persian · protective · sky-bound', accent:'#2DE2D0', deep:'#087E79', light:'#A8F5EC', rgb:'45,226,208', filter:'hue-rotate(91deg) saturate(1.62) brightness(1.08)', family:'persian' },
  { id:'lajvard-electric', name:'Lajvard Electric', meaning:'Persian · precious · infinite', accent:'#4B73FF', deep:'#2136A2', light:'#B4C1FF', rgb:'75,115,255', filter:'hue-rotate(144deg) saturate(1.72) brightness(1.07)', family:'persian' },
  { id:'zaffran-gold', name:'Zaffran Gold', meaning:'Persian · luminous · ceremonial', accent:'#F4C430', deep:'#987100', light:'#FFE99A', rgb:'244,196,48', filter:'hue-rotate(323deg) saturate(1.48) brightness(1.1)', family:'persian' },
  { id:'gol-e-mohammadi', name:'Gol-e Mohammadi', meaning:'Persian · poetic · sensorial', accent:'#FF4FA3', deep:'#A21C61', light:'#FFB5D6', rgb:'255,79,163', filter:'hue-rotate(253deg) saturate(1.52) brightness(1.07)', family:'persian' },
  { id:'minai-magenta', name:'Mina’i Magenta', meaning:'Persian · polychrome · intricate', accent:'#E860C5', deep:'#8C2875', light:'#F3B7E3', rgb:'232,96,197', filter:'hue-rotate(230deg) saturate(1.38) brightness(1.06)', family:'persian' }
];

const colourRoute = [
  { id:'pink', label:'Pink / Rose', paletteIds:['phosphor-pink','amaranth-signal','teaberry-chrome','optical-coral','gol-e-mohammadi','minai-magenta'] },
  { id:'purple', label:'Purple / Lilac', paletteIds:['amethyst-orchid','lavender-voltage','fig-electric','crocus-static','burnished-lilac','infra-violet'] },
  { id:'blue', label:'Blue / Cobalt', paletteIds:['electric-blue-lemonade','crown-cobalt','ether-cyan','dutch-canal-neon','lajvard-electric'] },
  { id:'green', label:'Turquoise / Green', paletteIds:['radio-mint','petrol-fanfare','shale-laser','firoozeh-pulse'] },
  { id:'yellow', label:'Yellow / Gold', paletteIds:['acid-citron','sulfur-bloom','banana-pulse','zaffran-gold'] }
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
