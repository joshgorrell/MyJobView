const plugin = require('tailwindcss/plugin');
const colors = require('tailwindcss/colors');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const usedClasses = new Set();
function scan(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(tsx?|jsx?|mjs)$/.test(file)) {
      for (const token of readFileSync(file, 'utf8').match(/[A-Za-z0-9_:\/.[\]%-]+/g) || []) usedClasses.add(token);
    }
  }
}
scan(join(__dirname, '../src'));
scan(join(__dirname, '../tests/themes'));


// Legacy utilities are adapted only in the signed-in workspace. Branding and
// customer-facing artwork can opt out with data-theme-fixed.
module.exports = plugin(({ addBase, e }) => {
  const rules = {'.theme-workspace': {color:'rgb(var(--text-primary))',fontFamily:'var(--font-family)',fontSize:'var(--font-body)',lineHeight:'1.5'}};
  const foregroundVariables = ['text-primary','text-secondary','text-muted','brand-text','info-text','warning-text','success-text','danger-text','attention-text','accent-text'];
  // Snapshot at each theme root/chrome boundary so a nested neutral surface can
  // recover the workspace palette after a colored button or badge.
  rules[':root, [data-theme]'] = Object.fromEntries(foregroundVariables.map(x=>['--workspace-'+x, 'var(--'+x+')']));
  const resetForeground = Object.fromEntries(foregroundVariables.map(x=>['--'+x, 'var(--workspace-'+x+')']));
  const excluded = ':not(:where([data-theme-fixed], [data-theme-fixed] *))';
  const selector = (name, state = '') =>
    `:is(.theme-workspace, .theme-workspace *)${excluded}.${e(name)}${state}`;
  // Uniform semantic heading sizes; figures and branded artwork retain their own scale.
  for (const [tag, role] of [['h1','page-title'],['h2','section-title'],['h3','card-title']]) {
    rules[`.theme-workspace ${tag}${excluded}:not(:where([data-type-scale="display"], [data-type-scale="display"] *))`] = {fontSize:`var(--font-${role})`,fontWeight:'600',lineHeight:'1.4'};
  }
  const states = [['', ''], ['hover:', ':hover'], ['focus:', ':focus'], ['focus-visible:', ':focus-visible'], ['active:', ':active'], ['disabled:', ':disabled'], ['placeholder:', '::placeholder']];
  const add = (name, declarations) => {
    for (const [prefix, state] of states) {
      if (usedClasses.has(prefix+name)) {
        const key=selector(prefix+name,state);
        if (name.startsWith('bg-') && declarations['--text-primary']===resetForeground['--text-primary']) rules[`:where(${key})`] = {color:'rgb(var(--text-primary))'};
        rules[key] = declarations;
      }
      for (const [screen, width] of Object.entries({sm:640,md:768,lg:1024,xl:1280,'2xl':1536})) {
        const candidate = screen+':'+prefix+name;
        if (usedClasses.has(candidate)) (rules[`@media (min-width: ${width}px)`] ||= {})[selector(candidate,state)] = declarations;
      }
    }
    if (usedClasses.has('group-hover:'+name)) rules[`.theme-workspace .group:hover .${e('group-hover:' + name)}${excluded}`] = declarations;
  };
  const neutral = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
  for (const family of neutral) {
    for (const shade of [50,100,200,300,400,500,600,700,750,800,850,900,950]) {
      add(`text-${family}-${shade}`, { color: `rgb(var(--text-${shade >= 800 ? 'primary' : shade >= 600 ? 'secondary' : 'muted'}))` });
      add(`bg-${family}-${shade}`, { ...resetForeground, backgroundColor: `rgb(var(--${shade >= 800 ? 'canvas' : shade >= 200 && shade <= 700 ? 'elevated' : 'surface'}) / var(--tw-bg-opacity, 1))` });
      for (const opacity of [10,15,20,25,30,40,50,60,70,75,80,90,95]) {
        add(`text-${family}-${shade}/${opacity}`, {color:`rgb(var(--text-muted))`});
        add(`bg-${family}-${shade}/${opacity}`, {...resetForeground,backgroundColor:`rgb(var(--${shade >= 800 ? 'canvas' : shade >= 200 && shade <= 700 ? 'elevated' : 'surface'}))`});
      }
      if (usedClasses.has(`divide-${family}-${shade}`)) rules[selector(`divide-${family}-${shade}`)+' > :not([hidden]) ~ :not([hidden])'] = {borderColor:'rgb(var(--border-subtle))'};
      add(`border-${family}-${shade}`, { borderColor: `rgb(var(--border-${shade >= 400 ? 'strong' : 'subtle'}))` });
    }
  }
  for (const name of ['canvas','surface','elevated','infoSoft','warningSoft','successSoft','dangerSoft','attentionSoft','accentSoft']) add('bg-'+name, resetForeground);
  add('bg-white', { ...resetForeground, backgroundColor: 'rgb(var(--canvas) / var(--tw-bg-opacity, 1))' });
  for (const opacity of [10,15,20,25,30,40,50,60,70,75,80,90,95]) add(`bg-white/${opacity}`, {...resetForeground,backgroundColor:'rgb(var(--canvas))'});
  for (const name of ['text-white', 'text-black']) add(name, { color: 'rgb(var(--text-primary))' });
  for (const opacity of [10,15,20,25,30,40,50,60,70,75,80,90,95]) add(`text-white/${opacity}`, {color:'rgb(var(--text-primary))'});
  // Photo captions and dark overlays retain a white foreground in light themes.
  const overlayForeground = Object.fromEntries(foregroundVariables.map(name=>['--'+name,'255 255 255']));
  add('bg-black', {...overlayForeground,color:'rgb(255 255 255)'});
  for (const opacity of [50,60,70,75,80,90,95]) add(`bg-black/${opacity}`, {...overlayForeground,color:'rgb(255 255 255)'});
  const roles = {blue:'info',sky:'info',cyan:'info',teal:'success',emerald:'success',green:'success',lime:'success',yellow:'warning',amber:'warning',orange:'attention',red:'danger',rose:'danger',pink:'accent',fuchsia:'accent',purple:'accent',violet:'accent',indigo:'accent'};
  const luminance = hex => hex.slice(1).match(/../g).map(x => parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  for (const [family, role] of Object.entries(roles)) {
    for (const shade of [50,100,200,300,400,500,600,700,800,900,950]) {
      add(`text-${family}-${shade}`, {color:`rgb(var(--${role}-text))`});
      // Colored badges/buttons keep their hue. Their own surface determines
      // foreground, independently of the surrounding light/dark theme.
      const l = luminance(colors[family][shade]);
      const foreground = (l+.05)/.05 >= 1.05/(l+.05) ? '0 0 0' : '255 255 255';
      const palette = Object.fromEntries(['text-primary','text-secondary','text-muted','brand-text',...new Set(Object.values(roles).map(x=>x+'-text'))].map(x=>['--'+x,foreground]));
      add(`bg-${family}-${shade}`, {...palette, color:`rgb(${foreground})`});
      if (usedClasses.has(`bg-${family}-${shade}`)) rules[selector(`bg-${family}-${shade}`)+'[class*="bg-opacity-"]'] = {...resetForeground,backgroundColor:`rgb(var(--${role}-surface))`};
      for (const opacity of [10,15,20,25,30,40,50,60,70,75,80,90,95]) add(`bg-${family}-${shade}/${opacity}`, {...resetForeground,backgroundColor:`rgb(var(--${role}-surface))`});

    }
  }
  // Theme-aware gradient stops prevent fixed pale panels in dark mode and
  // white labels over bright gradients in light mode. Branded artwork opts out.
  for (const direction of ['r','l','t','b','tr','tl','br','bl']) add('bg-gradient-to-'+direction, resetForeground);
  for (const [family, role] of [...Object.entries(roles), ...neutral.map(x=>[x,null])]) {
    for (const shade of [50,100,200,300,400,500,600,700,800,900,950]) {
      const color = `rgb(var(--${role ? role+'-surface' : 'surface'}))`;
      add(`from-${family}-${shade}`, {'--tw-gradient-from':`${color} var(--tw-gradient-from-position)`, '--tw-gradient-stops':'var(--tw-gradient-from), var(--tw-gradient-to)'});
      add(`via-${family}-${shade}`, {'--tw-gradient-stops':`var(--tw-gradient-from), ${color} var(--tw-gradient-via-position), var(--tw-gradient-to)`});
      add(`to-${family}-${shade}`, {'--tw-gradient-to':`${color} var(--tw-gradient-to-position)`});
    }
  }
  // Legacy separate opacity utilities expose the workspace through the tint;
  // they must use workspace text rather than opaque-button foregrounds.
  const translucent = `:is(.theme-workspace, .theme-workspace *)${excluded}[class*="bg-opacity-"]`;
  rules[translucent] = resetForeground;
  rules[`:where(${translucent})`] = {color:'rgb(var(--text-primary))'};
  const control = `.theme-workspace :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]),textarea,select)${excluded}`;
  rules[control] = {...resetForeground, backgroundColor:'rgb(var(--canvas))',color:'rgb(var(--text-primary))',colorScheme:'inherit'};
  rules[control+'::placeholder'] = {color:'rgb(var(--text-muted))',opacity:'1'};
  // Native autofill and options must follow the field palette too.
  rules[control+' option'] = {backgroundColor:'rgb(var(--canvas))',color:'rgb(var(--text-primary))'};
  rules[control+':-webkit-autofill'] = {WebkitTextFillColor:'rgb(var(--text-primary))',WebkitBoxShadow:'0 0 0 1000px rgb(var(--canvas)) inset'};
  rules['@media (max-width: 639px)'] = {[control]: {fontSize:'16px'}};
  addBase(rules);
});
