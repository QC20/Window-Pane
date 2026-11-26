// Everything you can pick in the Studio panel, plus the named presets.
// Index values match the int uniforms in shaders.js.

export const TEXTURES = [
  { v: 0, name: 'Hammered' },
  { v: 1, name: 'Reeded' },
  { v: 2, name: 'Flemish' },
  { v: 3, name: 'Rain' },
  { v: 4, name: 'Pebble' },
  { v: 5, name: 'Roundel' },
  { v: 6, name: 'Satin' },
];

export const MESHES = [
  { v: 0, name: 'None' },
  { v: 1, name: 'Square wire' },
  { v: 2, name: 'Wavy wire' },
  { v: 3, name: 'Diamond wire' },
  { v: 4, name: 'Hex wire' },
  { v: 5, name: 'Lead mosaic' },
  { v: 6, name: 'Sunburst' },
];

export const TINTS = [
  { v: 0, name: 'Clear' },
  { v: 1, name: 'Cathedral' },
  { v: 2, name: 'Opal' },
  { v: 3, name: 'Amber' },
  { v: 4, name: 'Bottle' },
  { v: 5, name: 'Smoke' },
];

export const SCENES = [
  { v: 0, name: 'Garden' },
  { v: 1, name: 'Forest' },
  { v: 2, name: 'City night' },
  { v: 3, name: 'Sunset' },
  { v: 4, name: 'Vases' },
  { v: 5, name: 'White sky' },
  { v: 6, name: 'Your image', hidden: true },
];

// sunPos is where the light rests when you are not steering it (screen uv, y up)
export const LIGHTS = {
  noon:     { name: 'Noon',        sunCol: [1, .99, .95], sunPow: 1,    glintCol: [1, 1, .96],   glint: 1,   wireLit: .75, envCol: [1, .98, .95], envWin: .5,  envLamp: 0,   grade: [1, 1, 1],         expo: 1,    sunPos: [-0.04, 0.58] },
  golden:   { name: 'Golden hour', sunCol: [1, .78, .5],  sunPow: 1.05, glintCol: [1, .85, .6],  glint: 1.1, wireLit: .65, envCol: [1, .85, .7],  envWin: .4,  envLamp: .2,  grade: [1.08, .95, .8],   expo: 1,    sunPos: [1.02, 0.42] },
  overcast: { name: 'Overcast',    sunCol: [.95, .97, 1], sunPow: .25,  glintCol: [.95, .97, 1], glint: .35, wireLit: .6,  envCol: [.9, .95, 1],  envWin: .8,  envLamp: 0,   grade: [.92, .96, 1.02],  expo: 1.05, sunPos: [0.5, 0.95] },
  dusk:     { name: 'Dusk',        sunCol: [1, .62, .36], sunPow: .4,   glintCol: [1, .75, .5],  glint: .7,  wireLit: .5,  envCol: [1, .75, .55], envWin: .1,  envLamp: .7,  grade: [.95, .85, .78],   expo: .95,  sunPos: [0.55, 0.62] },
  night:    { name: 'Night',       sunCol: [.6, .7, 1],   sunPow: 0,    glintCol: [1, .72, .42], glint: 1.3, wireLit: .55, envCol: [1, .7, .45],  envWin: .05, envLamp: 1.4, grade: [.55, .6, .85],    expo: .8,   sunPos: [0.72, 0.7] },
  backlit:  { name: 'Backlit',     sunCol: [1, .99, .97], sunPow: 1.5,  glintCol: [1, 1, .98],   glint: .6,  wireLit: .12, envCol: [1, 1, 1],     envWin: .2,  envLamp: 0,   grade: [1.05, 1.05, 1.05], expo: 1.1, sunPos: [0.18, 0.7] },
};

export const LIGHT_LIST = Object.entries(LIGHTS).map(([v, l]) => ({ v, name: l.name }));

// Cathedral glass palettes, eight panes each
export const PALETTES = {
  chapel:  { name: 'Chapel',  colors: ['#14a3b1', '#2c86d6', '#f4b41a', '#e65f1b', '#c0141f', '#4fcbd9', '#ffd23f', '#1b55b8'] },
  rainbow: { name: 'Rainbow', colors: ['#cf2a1f', '#e8861b', '#f2cc1c', '#2f9b3a', '#a9cde8', '#1a6ed0', '#5b2aa8', '#e9962c'] },
  bottles: { name: 'Bottles', colors: ['#7a4a12', '#a46a1c', '#c58c2c', '#3d6a2a', '#5b7d34', '#8a5a20', '#2f5a30', '#9a7a3a'] },
  rose:    { name: 'Rose',    colors: ['#c8102e', '#e0242f', '#a00d1f', '#f0b400', '#d71a2a', '#ff3b3b', '#b30f22', '#e9a21a'] },
  mosaic:  { name: 'Mosaic',  colors: ['#d23a6b', '#f08a24', '#f6d33c', '#5fbf5a', '#2aa3c9', '#3a5bd8', '#8a3fd1', '#e4ecd2'] },
};

export const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

const base = { relief: 1, frost: 0, disp: 1.2, dist: 70, scale: 26, twistRest: 0, pal: 'chapel' };

export const PRESETS = [
  { id: 'garden',    name: 'Garden, wired',   swatch: ['#0e2a12', '#7fae3a', '#e9efe6'], ...base, scene: 0, tex: 0, mesh: 1, tint: 0, light: 'noon' },
  { id: 'rain',      name: 'Rain at dusk',    swatch: ['#120f1c', '#f08a2a', '#8a7f72'], ...base, scene: 2, tex: 3, mesh: 0, tint: 0, light: 'dusk', dist: 110, disp: 1.4, relief: .8 },
  { id: 'chapel',    name: 'Chapel',          swatch: ['#14a3b1', '#f4b41a', '#c0141f'], ...base, scene: 5, tex: 0, mesh: 5, tint: 1, light: 'backlit', relief: .8, scale: 30 },
  { id: 'sunburst',  name: 'Sunburst',        swatch: ['#5b2aa8', '#2f9b3a', '#e8861b'], ...base, scene: 5, tex: 0, mesh: 6, tint: 1, light: 'noon', relief: .55, pal: 'rainbow', scale: 34 },
  { id: 'opal',      name: 'Opal',            swatch: ['#c9a6d8', '#9fe0c8', '#f3c0a8'], ...base, scene: 3, tex: 4, mesh: 0, tint: 2, light: 'golden', disp: 2.2 },
  { id: 'bottles',   name: 'Bottle ends',     swatch: ['#3d6a2a', '#a46a1c', '#2a1a0c'], ...base, scene: 1, tex: 5, mesh: 0, tint: 1, light: 'golden', pal: 'bottles', scale: 24 },
  { id: 'stairwell', name: 'Stairwell',       swatch: ['#2d3644', '#8b97a8', '#d6dde6'], ...base, scene: 1, tex: 0, mesh: 3, tint: 5, light: 'overcast', scale: 30, relief: 1.1 },
  { id: 'forest',    name: 'Forest, reeded',  swatch: ['#18401a', '#a7c94a', '#dfeee6'], ...base, scene: 1, tex: 1, mesh: 2, tint: 0, light: 'noon', scale: 30 },
  { id: 'flemish',   name: 'Flemish',         swatch: ['#1d4a22', '#f0a04a', '#d9eccf'], ...base, scene: 0, tex: 2, mesh: 0, tint: 0, light: 'golden', relief: 1.1 },
  { id: 'vases',     name: 'Two vases',       swatch: ['#1b3fd0', '#e06a9a', '#b89a72'], ...base, scene: 4, tex: 4, mesh: 0, tint: 0, light: 'noon', dist: 40 },
  { id: 'rose',      name: 'Red flower',      swatch: ['#c8102e', '#f0b400', '#f2f4f6'], ...base, scene: 5, tex: 2, mesh: 5, tint: 1, light: 'backlit', relief: .7, pal: 'rose', scale: 40 },
  { id: 'lobby',     name: 'Lobby',           swatch: ['#1a1a24', '#ffb347', '#e8e6e0'], ...base, scene: 2, tex: 6, mesh: 2, tint: 0, light: 'overcast', frost: 1.2, scale: 34 },
  { id: 'mosaic',    name: 'Mosaic',          swatch: ['#d23a6b', '#f6d33c', '#2aa3c9'], ...base, scene: 0, tex: 2, mesh: 5, tint: 1, light: 'backlit', pal: 'mosaic', relief: .6, scale: 22 },
];
