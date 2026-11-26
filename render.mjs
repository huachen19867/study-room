import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import './themes.js';
const themes = globalThis.studyThemes;

const media = new URL('./media/', import.meta.url);
mkdirSync(media, { recursive: true });
export const rate = 24000;
const turn = 2 * Math.PI;
const voices = {
  felt: [[1, 1, 1.4], [2.001, .31, .75], [3.008, .13, .41], [4.019, .07, .24], [1.002, .16, 1.1]],
  rhodes: [[1, 1, 1.8], [2, .23, .7], [3, .18, .4], [7, .14, .11], [1.004, .15, 1.1]],
  nylon: [[1, 1, .82], [2.001, .47, .47], [3.003, .28, .27], [4.008, .14, .17], [5.014, .08, .12]],
  celesta: [[1, 1, 1.72], [2.003, .14, .72], [4.05, .16, .33], [9.6, .06, .11]],
  flute: [[1, 1, 2.5], [1.003, .17, 1.9], [2, .25, 1.4], [3, .11, .7], [4, .04, .35]],
  pad: [[1, 1, 3.4], [1.006, .5, 3.1], [.995, .47, 3.1], [2, .14, 2.5], [3, .07, 1.7]],
};

function waveFile(name, channels, targetPeak) {
  const frames = channels[0].length;
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  const scale = targetPeak * 32767 / peak;
  const bytes = frames * channels.length * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels.length, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * channels.length * 2, 28);
  wav.writeUInt16LE(channels.length * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(bytes, 40);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      wav.writeInt16LE(Math.round(channel[frame] * scale), offset);
      offset += 2;
    }
  }
  writeFileSync(new URL(name + '.wav', media), wav);
  console.log(name, (frames / rate).toFixed(1) + 's');
}

export function renderScore(theme, { wrap = true } = {}) {
  const beat = 60 / theme.bpm;
  const meter = theme.meter;
  const frames = Math.round((theme.order.length * 8 * meter * beat + (wrap ? 0 : 3)) * rate);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const cache = new Map();

  function play(voice, midi, time, volume, pan, hold) {
    const key = [voice, midi, hold].join('/');
    if (!cache.has(key)) {
      const note = new Float32Array(Math.round((hold + 1.25) * rate));
      const fundamental = 440 * 2 ** ((midi - 69) / 12);
      const rise = voice === 'pad' ? .66 : voice === 'flute' ? .16 : voice === 'nylon' ? .009 : .022;
      for (const [ratio, strength, decay] of voices[voice]) {
        const step = turn * fundamental * ratio / rate;
        if (step >= Math.PI) continue;
        const ring = decay * 2 ** ((60 - midi) / 48);
        for (let i = 0; i < note.length; i++) {
          const t = i / rate;
          note[i] += strength * Math.sin(i * step) * Math.exp(-t / ring);
        }
      }
      for (let i = 0; i < note.length; i++) {
        const t = i / rate;
        const attack = Math.min(1, t / rise);
        const release = Math.max(0, Math.min(1, (hold + 1.25 - t) / 1.25));
        note[i] *= attack * release ** 2;
      }
      cache.set(key, note);
    }
    const note = cache.get(key);
    const start = Math.round(time * rate);
    const l = volume * Math.sqrt((1 - pan) / 2);
    const r = volume * Math.sqrt((1 + pan) / 2);
    const echo = Math.round(rate * .24);
    for (let i = 0; i < note.length; i++) {
      const index = start + i;
      if (!wrap && index >= frames) break;
      const sample = index % frames;
      left[sample] += note[i] * l;
      right[sample] += note[i] * r;
      if (wrap || index + echo < frames) left[(index + echo) % frames] += note[i] * r * .17;
      if (wrap || index + echo + 1170 < frames) right[(index + echo + 1170) % frames] += note[i] * l * .15;
    }
  }

  for (let bar = 0; bar < theme.order.length * 8; bar++) {
    const section = Math.floor(bar / 8);
    const phrase = bar % 8;
    const chordIndex = theme.order[section][phrase];
    const [bass, ...chord] = theme.chords[chordIndex];
    const start = bar * meter * beat;
    const dynamic = (theme.dynamics ?? [.85, 1, .9, .79])[section];
    play('felt', bass, start, .2 * dynamic, -.18, beat * 2);
    if (theme.pad ?? (theme.voice === 'pad' || theme.voice === 'celesta')) {
      chord.slice(0, 3).forEach((midi, index) => {
        play('pad', midi - 12, start + index * .12, .095 * dynamic, (index - 1) * .42, beat * meter);
      });
    }
    for (const [offset, index, volume] of (theme.patterns?.[section] ?? theme.pattern)) {
      const note = chord[index];
      play(theme.voice === 'pad' ? 'felt' : theme.voice, note, start + offset * beat,
        volume * dynamic, ((index % 3) - 1) * .35, beat * 1.1);
    }
    const melody = theme.melody[section][phrase];
    for (const [offset, midi, length] of melody) {
      if (!theme.dynamics && section === 3 && offset > 1.5) continue;
      play(theme.lead, midi, start + offset * beat, .29 * dynamic, .15, length * beat);
    }
  }
  return [left, right];
}

function ambient(kind, seed) {
  const length = 18 * rate;
  const overlap = 2 * rate;
  const samples = new Float32Array(length + overlap);
  let fast = 0;
  let slow = 0;
  let deep = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    fast += .28 * (white - fast);
    slow += .019 * (white - slow);
    deep += .003 * (white - deep);
    const angle = turn * i / length;
    const swell = .56 + .26 * Math.sin(3 * angle) + .13 * Math.sin(2 * angle + .8);
    samples[i] = kind === 'rain-bed' ? .63 * fast + .37 * slow :
      (kind === 'waves' ? slow + .32 * fast : 2 * deep + .3 * slow) * swell;
  }
  for (let i = 0; i < overlap; i++) {
    const weight = .5 - .5 * Math.cos(Math.PI * i / overlap);
    samples[i] = samples[length + i] * (1 - weight) + samples[i] * weight;
  }
  waveFile(kind, [samples.subarray(0, length)], .40);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  themes.forEach(theme => waveFile(theme.id, renderScore(theme), .63));
  ambient('rain-bed', 90);
  ambient('waves', 128);
  ambient('wind', 2026);
}
