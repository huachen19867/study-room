import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const rate = 24000;
const names = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
const samples = new Map();
const localSamples = new URL('./reference/study-instruments/samples/piano/', import.meta.url);
const sampleRoot = existsSync(localSamples) ? localSamples : new URL('../../reference/study-instruments/samples/piano/', import.meta.url);
const media = new URL('./media/', import.meta.url);
const encoder = process.argv[2] ?? 'ffmpeg';
const compositions = [
  {
    id:'piano-margin', title:'页边的赋格', tag:'双声部 · 赋格小品', color:'#e7c994',
    desc:'右手在纸上写下四个音，左手慢一拍接过，再各自走开。',
    bpm:68, beats:4, mode:[0,2,3,5,7,8,11], key:60,
    motives:[[0,2,1,4,3,2,1,0],[2,4,5,4,2,1,2,3],[4,3,1,2,0,-1,1,0]],
    progressions:[[0,0,3,4,0,5,1,4],[3,3,5,0,1,4,0,4],[0,5,3,1,4,4,0,0]],
    form:[0,0,1,0,2,1,0,2,0], texture:'counterpoint',
  },
  {
    id:'piano-elevator', title:'电梯没有七楼', tag:'三拍子 · 圆舞曲', color:'#efb7a2',
    desc:'左手稳稳数着一二三，右手偶尔跨过一拍，像在等迟来的楼层。',
    bpm:72, beats:3, mode:[0,2,4,5,7,9,11], key:65,
    motives:[[2,4,5,4,2,1,0,2],[4,6,5,3,4,2,1,2],[2,1,0,-1,0,2,1,0]],
    progressions:[[0,2,3,4,0,5,1,4],[5,2,3,0,1,5,3,4],[0,3,2,5,1,4,0,0]],
    form:[0,1,0,2,1,0,1,2,0,2], texture:'waltz',
  },
  {
    id:'piano-index', title:'第零号索引', tag:'五拍子 · 极简练习曲', color:'#a8d9d1',
    desc:'五拍按三加二分开，同一组音在键盘上缓慢移位。',
    bpm:79, beats:5, mode:[0,2,3,5,7,9,10], key:62,
    motives:[[0,2,4,1,3,2,5,4],[3,1,2,4,6,4,5,2],[0,3,2,1,4,2,1,0]],
    progressions:[[0,0,3,3,5,5,1,4],[3,3,0,0,1,1,4,4],[0,2,3,5,1,4,0,0]],
    form:[0,1,0,2,0,1,2,2,0,2], texture:'ostinato',
  },
  {
    id:'piano-tick', title:'秒针在纸上走', tag:'自由速度 · 夜曲', color:'#c6bee5',
    desc:'旋律给尾音留足时间，左手从单音铺到宽和弦，再慢慢收回来。',
    bpm:60, beats:4, mode:[0,2,4,5,7,9,11], key:60,
    motives:[[2,4,3,5,4,2,1,0],[4,6,5,3,2,4,1,2],[0,2,4,2,1,-1,1,0]],
    progressions:[[0,5,3,4,0,2,1,4],[3,2,5,0,1,3,4,4],[0,5,1,3,4,4,0,0]],
    form:[0,0,1,2,0,1,2,0,2], texture:'nocturne',
  },
];

function piano(midi) {
  if (samples.has(midi)) return samples.get(midi);
  const name = names[midi % 12] + (Math.floor(midi / 12) - 1);
  const wav = readFileSync(new URL(name + '.wav', sampleRoot));
  let sourceRate;
  let data;
  for (let pos = 12; pos + 8 <= wav.length;) {
    const size = wav.readUInt32LE(pos + 4);
    const chunk = wav.toString('ascii', pos, pos + 4);
    if (chunk === 'fmt ') {
      if (wav.readUInt16LE(pos + 8) !== 1 || wav.readUInt16LE(pos + 10) !== 1 ||
          wav.readUInt16LE(pos + 22) !== 16) throw new Error('Unsupported WAV: ' + name);
      sourceRate = wav.readUInt32LE(pos + 12);
    }
    if (chunk === 'data') {
      data = new Int16Array(wav.buffer, wav.byteOffset + pos + 8, size / 2);
      break;
    }
    pos += 8 + size + size % 2;
  }
  if (!sourceRate || !data) throw new Error('Invalid WAV: ' + name);
  const result = { data, step: sourceRate / rate };
  samples.set(midi, result);
  return result;
}

function score(piece) {
  let seed = 191 + (piece.chapter ?? 0) * 8191;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const notes = [];
  let start = .8;
  const beat = 60 / piece.bpm;
  for (const [section, kind] of piece.form.entries()) {
    const contour = piece.motives[kind];
    const chords = piece.progressions[kind];
    const lift = (section % 7 === 4 || section % 7 === 5) ? piece.innerShift : 0;
    const pitch = degree => piece.key + lift + 12 * Math.floor(degree / 7) + piece.mode[(degree % 7 + 7) % 7];
    for (let bar = 0; bar < 8; bar++) {
      const root = chords[(bar + (section % 4 === 2 ? 2 : 0)) % chords.length];
      const last = section === piece.form.length - 1 && bar === 7;
      const pulse = beat * (1 + .026 * Math.sin(bar * .82) + (bar === 7 ? .08 : 0) + (last ? .26 : 0));
      const swell = (.85 + .12 * Math.sin(Math.PI * bar / 7)) * (kind === 1 ? 1.08 : .95);
      const put = (time, degree, length, dynamic) => {
        notes.push([start + Math.max(0, time * pulse + (random() - .5) * .025),
          pitch(degree), length * pulse, dynamic * swell * (.91 + .18 * random())]);
      };
      const first = contour[(bar + section % 3) % 8];
      const next = contour[(bar + section % 3 + 1) % 8];
      if (last) {
        put(0,-14,5.5,.29); put(.1,-7,5,.19); put(.24,-3,4.7,.14);
        put(.42,0,4.5,.30);
      } else if (piece.texture === 'counterpoint') {
        [first, first+2, first+1, next].forEach((degree,i) => put(i * .65, degree, .78,.25 - i*.017));
        put(.05,root-14,2.3,.23);
        [first-7,first-5,first-6,next-7].forEach((degree,i) => put(1.05+i*.68,degree,.76,.16));
      } else if (piece.texture === 'waltz') {
        put(0,root-14,1.6,.25);
        for (const time of [1,2]) {
          put(time,root-7,.73,.12); put(time+.048,root-5,.66,.10); put(time+.09,root-3,.62,.085);
        }
        put(.13,first,1.4,.29);
        if (bar % 4 !== 3) put(1.73,next+2,.72,.20);
        if (bar % 3 === 1) put(2.52,next,.4,.145);
      } else if (piece.texture === 'ostinato') {
        const offsets = [0,.5,1,1.5,2,2.5,3,3.5,4,4.5];
        const pattern = [0,4,7,2,4,7,0,3,7,4];
        offsets.forEach((time,i) => put(time, root - 9 + pattern[(i + section) % 10], .66, i % 3 === 0 ? .18 : .12));
        put(.31,first+7,1.25,.22);
        if (bar % 3 !== 2) put(3.12,next+7,1.5,.19);
      } else {
        put(0,root-14,3.7,.21); put(.64,root-10,2.7,.136); put(1.25,root-7,2.5,.12);
        if (kind === 1 || bar % 2 === 0) put(2.12,root-5,1.8,.11);
        put(.24,first+7,bar % 3 === 2 ? 3.45 : 2,.26);
        if (bar % 3 !== 2) put(2.58,next+7,1.35,.19);
      }
      start += pulse * piece.beats;
    }
  }
  return { notes, seconds: start + 3.3 };
}

function render(piece) {
  const { notes, seconds } = score(piece);
  const frames = Math.ceil(seconds * rate);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (const [time, midi, hold, velocity] of notes) {
    const { data, step } = piano(midi);
    const start = Math.round(time * rate);
    const limit = Math.min(frames - start, Math.floor((data.length - 1) / step), Math.ceil((hold + 1.15) * rate));
    const pan = Math.max(-.44, Math.min(.44, (midi - 60) / 45));
    const l = Math.sqrt((1 - pan) / 2) * velocity, r = Math.sqrt((1 + pan) / 2) * velocity;
    const reflection = Math.round(.056 * rate);
    const release = Math.ceil(hold * rate);
    for (let i = 0; i < limit; i++) {
      const cursor = i * step;
      const position = Math.floor(cursor);
      const value = (data[position] + (data[position+1] - data[position]) * (cursor - position)) / 32768;
      const envelope = Math.min(1, i / 180) * (i <= release ? 1 : Math.exp(-(i - release) / (.25 * rate)));
      const sample = value * envelope;
      left[start+i] += sample*l;
      right[start+i] += sample*r;
      if (start+i+reflection < frames) {
        left[start+i+reflection] += sample*r*.12;
        right[start+i+reflection] += sample*l*.12;
      }
    }
  }
  const pcm = Buffer.allocUnsafe(frames * 4);
  for (let i = 0; i < frames; i++) {
    pcm.writeInt16LE(Math.round(Math.tanh(left[i]) * 32767), i*4);
    pcm.writeInt16LE(Math.round(Math.tanh(right[i]) * 32767), i*4+2);
  }
  return { pcm, frames };
}

const movements = [
  ['原题','展开','两行之间','反题','行间留白','低声的争论','远处的应答','回到页边'],
  ['入场','偏离重拍','转身','空楼层','回旋','慢一拍','门合上以前','谢幕'],
  ['第一组五拍','错一格','换轴','映射','低音索引','稀疏排列','重新编号','归零'],
  ['秒针','长句','墨迹未干','桌灯以外','低声连奏','缓行','近乎静止','落笔'],
];

function arrange(piece, chapter) {
  const shift = [0, 0, 3, -2, -2, 2, 2, 0][chapter];
  const bpm = piece.bpm + [0, 4, -4, 3, -7, 1, -5, -2][chapter];
  const texture = piece.texture === 'counterpoint' && (chapter === 2 || chapter === 4)
    ? 'nocturne' : piece.texture === 'nocturne' && (chapter === 3 || chapter === 5)
      ? 'counterpoint' : piece.texture;
  const mode = chapter === 2 || chapter === 5 ? [0,2,4,5,7,9,11] :
    chapter === 3 || chapter === 4 ? [0,2,3,5,7,8,10] : piece.mode;
  const motifs = piece.motives.map((motif, index) => motif.map((degree, beat) => {
    const offset = (beat + (chapter + index) % 4) % motif.length;
    if (chapter === 3) return 4 - motif[offset];
    if (chapter === 6) return beat % 3 === 1 ? degree + 2 : degree;
    if (chapter === 7) return degree;
    return motif[offset] + (chapter % 2 === 1 && beat === 4 ? 1 : 0);
  }));
  const progressions = piece.progressions.map((line, variant) => line.map((degree, bar) => {
    if (bar === 7) return variant === 2 ? 0 : 4;
    if (chapter % 2 === 1 && bar === 2) return (degree + 2) % 7;
    if (chapter > 1 && bar === 5) return [5, 1, 3][(chapter + variant) % 3];
    return degree;
  }));
  const count = Math.round((390 - 4) * bpm / (60 * 8 * piece.beats * 1.01));
  const form = Array.from({ length: count }, (_, index) =>
    piece.form[(index + chapter * 2) % piece.form.length]);
  form[0] = chapter === 0 || chapter === 7 ? 0 : chapter % 3;
  form[count - 1] = 2;
  return { ...piece, key: piece.key + shift, bpm, texture, mode, motives: motifs, progressions,
    form, chapter, innerShift: chapter % 3 === 1 ? -2 : 2 };
}

async function suite(piece, index) {
  const file = new URL(piece.id + '-long.mp3', media);
  const partial = new URL(piece.id + '-long.part.mp3', media);
  const child = spawn(encoder, ['-hide_banner','-loglevel','error','-y','-f','s16le','-ar',String(rate),
    '-ac','2','-i','pipe:0','-af','volume=2.2,alimiter=limit=0.77:attack=5:release=100:level=false:latency=1',
    '-ar','32000','-c:a','libmp3lame','-b:a','80k','-metadata','title='+piece.title,
    '-metadata','album=耳边自习室',fileURLToPath(partial)],
    { stdio:['pipe','ignore','inherit'], windowsHide:true });
  const exit = once(child,'close').then(([code]) => {
    if (code !== 0) throw new Error('FFmpeg exit ' + code);
  });
  const done = Promise.all([exit, finished(child.stdin)]);
  done.catch(() => {});
  const chapters = [];
  let frames = 0;
  try {
    for (const [chapter,title] of movements[index].entries()) {
      const movement = render(arrange(piece, chapter));
      chapters.push({ title, start: Math.round(frames / rate) });
      frames += movement.frames;
      if (!child.stdin.write(movement.pcm)) await Promise.race([once(child.stdin,'drain'), done]);
      console.log(piece.title, title, Math.round(frames / rate) + 's');
    }
    child.stdin.end();
    await done;
    renameSync(partial, file);
  } catch (error) {
    child.stdin.destroy();
    child.kill();
    await done.catch(() => {});
    rmSync(partial, { force:true });
    throw error;
  }
  const { id, title, tag, color, desc } = piece;
  return { id, title, tag, color, desc, seconds: Math.round(frames / rate), chapters };
}

const results = await Promise.allSettled(compositions.map(suite));
const errors = results.filter(result => result.status === 'rejected');
if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Piano suite rendering failed');
writeFileSync(new URL('./piano-tracks.js', import.meta.url),
  'globalThis.studyPianoTracks = ' + JSON.stringify(results.map(result => result.value), null, 2) + ';\n');
