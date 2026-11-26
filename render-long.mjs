import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { finished } from 'node:stream/promises';
import { rate, renderScore } from './render.mjs';

const encoder = process.argv[2] ?? 'ffmpeg';
const themes = globalThis.studyThemes;
const overlap = 3 * rate;
const fadeOut = (sample, duration) => .5 + .5 * Math.cos(Math.PI * sample / duration);
const media = new URL('./media/', import.meta.url);

const suites = {
  rain: [
    ['第一滴雨', 61, 4, 0, 'felt', 'felt', 'arpeggio'],
    ['沿玻璃蜿蜒', 66, 3, 0, 'felt', 'felt', 'waltz'],
    ['湿漉漉的街灯', 62, 4, -3, 'rhodes', 'felt', 'block'],
    ['雨势渐缓', 55, 4, -3, 'pad', 'felt', 'drift'],
    ['有人撑伞经过', 68, 4, 0, 'felt', 'nylon', 'syncopated'],
    ['窗缝里的晨光', 60, 4, 0, 'felt', 'felt', 'arpeggio'],
  ],
  cafe: [
    ['门铃轻响', 77, 4, 0, 'rhodes', 'rhodes', 'syncopated'],
    ['刚烤好的面包', 80, 4, 2, 'nylon', 'rhodes', 'arpeggio'],
    ['角落的旧唱片', 72, 4, 2, 'rhodes', 'felt', 'block'],
    ['写在杯垫背面', 73, 3, -2, 'felt', 'rhodes', 'waltz'],
    ['午后移了一寸', 68, 4, -2, 'rhodes', 'felt', 'drift'],
    ['最后一口牛奶', 74, 4, 0, 'rhodes', 'rhodes', 'syncopated'],
  ],
  forest: [
    ['鞋尖沾了露水', 72, 3, 0, 'nylon', 'nylon', 'waltz'],
    ['树影在地上走', 74, 4, 0, 'nylon', 'felt', 'arpeggio'],
    ['小溪绕过石头', 79, 3, 2, 'nylon', 'celesta', 'waltz'],
    ['蕨叶下的空地', 60, 4, -2, 'pad', 'nylon', 'drift'],
    ['沿山脊折返', 75, 4, -2, 'nylon', 'nylon', 'syncopated'],
    ['树线尽头', 66, 3, 0, 'nylon', 'felt', 'block'],
  ],
  sea: [
    ['涨潮以前', 58, 4, 0, 'pad', 'felt', 'drift'],
    ['浅水里的天', 63, 4, 2, 'pad', 'rhodes', 'arpeggio'],
    ['给岛屿的信', 59, 3, 2, 'pad', 'nylon', 'waltz'],
    ['看不见的洋流', 53, 4, -3, 'pad', 'felt', 'drift'],
    ['浮标轻晃', 60, 4, -3, 'rhodes', 'celesta', 'block'],
    ['低潮露出沙纹', 56, 4, 0, 'pad', 'felt', 'drift'],
  ],
  night: [
    ['台灯亮起', 65, 3, 0, 'celesta', 'felt', 'waltz'],
    ['书页间的月亮', 62, 4, 2, 'felt', 'celesta', 'arpeggio'],
    ['睡着的街道', 54, 4, -2, 'pad', 'celesta', 'drift'],
    ['星星还没落下', 63, 3, -2, 'celesta', 'celesta', 'waltz'],
    ['远处还有一盏灯', 59, 4, 3, 'rhodes', 'felt', 'block'],
    ['把书签留在这里', 56, 4, 0, 'pad', 'felt', 'drift'],
  ],
};

const patterns = {
  arpeggio: [[.12,0,.14],[.5,1,.10],[1.25,2,.14],[2,3,.11],[2.6,1,.11],[3.45,2,.07]],
  waltz: [[.2,0,.12],[.9,1,.14],[1.25,2,.11],[1.9,0,.10],[2.35,3,.11]],
  block: [[.1,0,.14],[.16,1,.12],[.23,2,.10],[2.1,1,.11],[2.17,3,.085]],
  drift: [[.76,1,.10],[1.8,2,.11],[2.8,3,.085]],
  syncopated: [[.57,1,.12],[.64,2,.11],[1.67,0,.13],[2.34,2,.115],[3.62,3,.09]],
};
const contours = [
  [0, 1, 3, 2, 1, 2, 1, 0], [2, 1, 0, 2, 3, 1, 0, 1],
  [1, 3, 2, 0, 2, 3, 1, 0], [3, 2, 1, 0, 1, 0, 2, 1],
  [0, 2, 1, 3, 2, 1, 3, 0], [1, 0, 2, 1, 3, 2, 0, 1],
];

function score(theme, chapter, chapterIndex, firstPhrase, phraseCount) {
  const [, bpm, meter, shift, voice, lead, rhythm] = chapter;
  const chords = theme.chords.map((chord, index) => {
    const [bass, low, mid, high, color] = chord.map(key => key + shift);
    return (chapterIndex + index) % 3 === 1 ? [bass, mid, high, color, low + 12] :
      [bass, low, mid, high, color];
  });
  const order = [];
  const melody = [];
  const dynamics = [];
  const textures = [];
  for (let i = 0; i < phraseCount; i++) {
    const phrase = firstPhrase + i;
    const variation = (chapterIndex + Math.floor(phrase / 2)) % contours.length;
    const progression = theme.form[(chapterIndex + phrase + Math.floor(phrase / 5)) % theme.form.length];
    const bridge = theme.form[(chapterIndex + phrase + 2) % theme.form.length];
    const contrasting = phrase % 4 === 2;
    const closing = i === phraseCount - 1;
    const line = progression.map((chord, bar) => {
      if (closing && bar === 7) return theme.form[0][0];
      if (contrasting && bar > 2 && bar < 7) return bridge[(bar + chapterIndex) % 8];
      return chord;
    });
    order.push(line);
    dynamics.push((contrasting ? .91 : .78) + .08 * Math.sin(phrase * 1.47 + chapterIndex));
    const pattern = patterns[rhythm].filter(([offset]) => offset < meter - .18);
    textures.push(contrasting ? pattern.filter((_, index) => index % 3 !== 1) : pattern);
    melody.push(line.map((chord, bar) => {
      const contour = contours[variation];
      const degree = contour[(bar + (phrase % 2)) % 8];
      const keys = chords[chord];
      const register = rhythm === 'drift' || chapterIndex === 5 ? 0 : 12;
      const note = keys[1 + degree] + register;
      const answer = keys[1 + contour[(bar + 3) % 8]] + register;
      if ((closing && bar === 7) || (rhythm === 'drift' && bar % 3 === 2)) {
        return [[.45, keys[2], meter - .7]];
      }
      if (contrasting && bar % 2 === 1) return [[1.05, note, meter - 1.25]];
      if (rhythm === 'drift') return [[.65 + (bar % 2) * .4, note, meter - 1.4]];
      if (theme.motifs && (bar + phrase) % 4 !== 3) {
        return theme.motifs.filter(([offset]) => offset < meter - .24).map(([offset, degree, length], i) =>
          [offset, keys[1 + ((degree + bar % 2 + chapterIndex % 2) % 4)] + register, length * (contrasting && i === 0 ? 1.24 : 1)]);
      }
      const upbeat = rhythm === 'syncopated' ? .64 : bar % 3 === 0 ? .22 : .5;
      return [[upbeat, note, .95 + (bar % 2) * .24], [meter - 1.2, answer, .8]];
    }));
  }
  return { bpm, meter, voice, lead, chords, order, melody, dynamics, patterns: textures,
    pad: voice === 'pad' || voice === 'celesta' || (voice === 'felt' && chapterIndex % 2 === 1) };
}

function pcm(channels, end, previousTail) {
  const output = Buffer.allocUnsafe(end * 4);
  let peak = .8;
  for (const channel of channels) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  const gain = .44 / peak;
  for (let sample = 0; sample < end; sample++) {
    const blend = sample < overlap ? fadeOut(sample, overlap) : 0;
    for (let channel = 0; channel < 2; channel++) {
      const value = channels[channel][sample] * gain;
      const mixed = previousTail && sample < overlap ? previousTail[channel][sample] * blend + value * (1 - blend)
        : value * (1 - blend);
      output.writeInt16LE(Math.round(mixed * 32767), sample * 4 + channel * 2);
    }
  }
  return { output, gain };
}

export async function renderSuite(theme, chaptersConfig = suites[theme.id], minutesPerChapter = 9) {
  const chapters = [];
  const dest = new URL(theme.id + '-long.mp3', media);
  const temp = new URL(theme.id + '-long.part.mp3', media);
  const process = spawn(encoder, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 's16le', '-ar', String(rate), '-ac', '2', '-i', 'pipe:0',
    '-af', 'acompressor=threshold=0.085:ratio=3:attack=18:release=280:makeup=5.6,alimiter=limit=0.78:attack=5:release=100:level=false:latency=1', '-ar', '32000',
    '-c:a', 'libmp3lame', '-b:a', '64k', '-metadata', 'title=' + theme.title + ' · 长听版',
    '-metadata', 'album=耳边自习室', fileURLToPath(temp)],
  { stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true });
  const closed = once(process, 'close').then(([code]) => {
    if (code !== 0) throw new Error('FFmpeg exit ' + code);
  });
  const input = finished(process.stdin);
  const complete = Promise.all([closed, input]);
  complete.catch(() => {});
  let frames = 0;
  let tail;
  try {
    for (const [index, chapter] of chaptersConfig.entries()) {
      const [title, bpm, meter] = chapter;
      const phraseCount = Math.round(minutesPerChapter * bpm / (8 * meter));
      chapters.push({ title, start: Math.round(frames / rate) });
      for (let first = 0; first < phraseCount; first += 4) {
        const remaining = phraseCount - first;
        const count = remaining === 5 ? 5 : Math.min(4, remaining);
        const channels = renderScore(score(theme, chapter, index, first, count), { wrap: false });
        const end = channels[0].length - overlap;
        const { output, gain } = pcm(channels, end, tail);
        if (!process.stdin.write(output)) await Promise.race([once(process.stdin, 'drain'), complete]);
        frames += end;
        tail = channels.map(channel => channel.slice(end).map(value => value * gain));
        if (count === remaining) break;
      }
      console.log(theme.id, title, Math.round(frames / rate) + 's');
    }
    const closing = Buffer.alloc(overlap * 4);
    for (let sample = 0; sample < overlap; sample++) {
      for (let channel = 0; channel < 2; channel++) {
        closing.writeInt16LE(Math.round(tail[channel][sample] * fadeOut(sample, overlap) * 32767),
          sample * 4 + channel * 2);
      }
    }
    process.stdin.end(closing);
    frames += overlap;
    await complete;
    renameSync(temp, dest);
    return [theme.id, { seconds: Math.round(frames / rate), chapters }];
  } catch (error) {
    process.stdin.destroy();
    process.kill();
    await complete.catch(() => {});
    rmSync(temp, { force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const library = Object.fromEntries(await Promise.all(themes.map(theme => renderSuite(theme))));
  writeFileSync(new URL('./long-tracks.js', import.meta.url),
    'globalThis.studyLongTracks = ' + JSON.stringify(library, null, 2) + ';\n');
}
