const originalThemes = globalThis.studyThemes;
const pianoTracks = globalThis.studyPianoTracks;
const library = globalThis.studyLongTracks;
const themes = [
  { ...globalThis.studyOpeningTrack, kind: 'opening' },
  ...globalThis.studyReadingTracks.map(track => ({ ...track, kind: track.id === 'study-soundboard' ? 'piano' : 'encore' })),
  ...globalThis.studyVarietyTracks.map(track => ({ ...track, kind: 'variety' })),
  ...globalThis.studyEncoreTracks.map(track => ({ ...track, kind: 'encore' })),
  ...pianoTracks.map(track => ({ ...track, kind: 'piano' })),
  ...globalThis.studyAnimeThemes.map(track => ({ ...track, ...globalThis.studyAnimeTracks[track.id], kind: 'anime' })),
  ...originalThemes.map(track => ({ ...track, ...library[track.id], kind: 'long' })),
];
const cards = [];
const control = id => document.getElementById(id);
const music = control('music');
const bed = control('bed');
const seek = control('seek');
const status = control('status');
const ambience = control('ambience');
const bedVolume = control('ambienceVolume');
const chapterMenu = control('chapters');
const backdrop = control('backdrop');
const search = control('search');
const genreFilter = control('genre');
const focus = control('focus');
const repeat = control('repeat');
const musicVolume = control('volume');
let chapters = [];
let current = 0;
const covers = { 'study-soundboard': 'piano-reading-room.png', 'study-platform': 'anime-train.jpg' };
const coverPath = id => 'media/' + (covers[id] ?? id + '.jpg');

let history = [];
let cursor = 0;
let remaining = [];

function resetShuffle() {
  history = [current];
  cursor = 0;
  remaining = themes.map((_, i) => i).filter(i => i !== current);
}

function stepTrack(direction, start) {
  if (repeat.value !== 'shuffle') return select(current + direction, start);
  if (!history.length) resetShuffle();
  if (direction < 0) {
    if (cursor === 0) return;
    cursor--;
  } else if (cursor < history.length - 1) {
    cursor++;
  } else {
    const newRound = remaining.length === 0;
    if (newRound) remaining = themes.map((_, i) => i);
    const choices = newRound && remaining.length > 1 ? remaining.filter(i => i !== current) : remaining;
    const next = choices[Math.floor(Math.random() * choices.length)];
    remaining.splice(remaining.indexOf(next), 1);
    history.push(next);
    if (history.length > themes.length * 2) history.shift();
    cursor = history.length - 1;
  }
  select(history[cursor], start);
}

const sessionKey = 'study-room.session.v1';
let pendingPosition = 0;
let lastSave = 0;

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey)) ?? {};
  } catch {
    return {};
  }
}

function saveSession() {
  const theme = themes[current];
  const position = pendingPosition || music.currentTime;
  try {
    localStorage.setItem(sessionKey, JSON.stringify({
      id: theme.id,
      kind: theme.kind,
      position: Number.isFinite(position) ? Math.max(0, position) : 0,
      backdrop: backdrop.value,
      ambience: ambience.value,
      volume: musicVolume.value,
      bedVolume: bedVolume.value,
      repeat: repeat.value,
      shuffle: repeat.value === 'shuffle' ? {
        history: history.map(i => themes[i].id), cursor, remaining: remaining.map(i => themes[i].id),
      } : undefined,
    }));
  } catch {
    // Playback remains available when browser storage is disabled.
  }
}

function report(message = '') {
  status.textContent = message;
  status.hidden = !message;
}

function clock(seconds) {
  const whole = Math.floor(Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(whole / 60);
  const tail = String(whole % 60).padStart(2, '0');
  if (minutes < 60) return minutes + ':' + tail;
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + tail;
}

function showProgress() {
  const known = Number.isFinite(music.duration) && music.duration > 0;
  seek.disabled = !known;
  seek.max = known ? music.duration : 1;
  seek.value = known ? music.currentTime : 0;
  control('time').textContent = clock(music.currentTime) + ' / ' + clock(music.duration);
  chapterMenu.disabled = !known;
  if (chapters.length) {
    const chapter = chapters.findLast(item => item.start <= music.currentTime) ?? chapters[0];
    chapterMenu.value = String(chapter.start);
  }
}

function setVolumes() {
  // The earlier synthesized suites are mastered about 12 dB louder.
  const gain = (themes[current].kind === 'long' || themes[current].kind === 'anime') ? .27 : 1;
  music.volume = Number(musicVolume.value) / 100 * gain;
  bed.volume = Number(bedVolume.value) / 100 * .65;
}

function syncBed() {
  if (music.paused || !ambience.value) {
    bed.pause();
    return;
  }
  bed.play().catch(error => {
    if (error.name !== 'AbortError') report('环境声暂时无法播放。');
  });
}

async function play() {
  report();
  try {
    await music.play();
  } catch (error) {
    if (error.name !== 'AbortError') report('无法播放。请确认 media 文件夹和播放器在同一个目录。');
  }
}

function renderShelf() {
  const shelf = control('shelf');
  const minutes = Math.round(themes.reduce((sum, theme) => sum + theme.seconds, 0) / 60);
  control('libraryLength').textContent = themes.length + ' 首 · 约 ' + Math.floor(minutes / 60) + ' 小时' +
    (minutes % 60 ? ' ' + minutes % 60 + ' 分钟' : '');
  for (const [position, theme] of themes.entries()) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    const image = document.createElement('img');
    image.src = coverPath(theme.id);
    image.alt = '';
    image.loading = 'lazy';
    const name = document.createElement('span');
    name.textContent = theme.title;
    const tag = document.createElement('small');
    tag.textContent = theme.tag + ' · ' + clock(theme.seconds);
    card.append(image, name, tag);
    card.onclick = () => {
      if (position !== current) {
        if (repeat.value === 'shuffle') {
          history.splice(cursor + 1);
          history.push(position);
          if (history.length > themes.length * 2) history.shift();
          cursor = history.length - 1;
          remaining = remaining.filter(i => i !== position);
        }
        select(position, true);
      }
      else if (music.paused) play();
    };
    shelf.append(card);
    cards.push(card);
  }
}

const genres = {
  rain: 'piano', cafe: 'jazz', forest: 'acoustic', sea: 'electronic', night: 'electronic',
  'mix-jazz': 'jazz', 'mix-chamber': 'classical', 'mix-electronic': 'electronic',
  'study-bossa': 'jazz', 'study-celtic': 'acoustic', 'study-mallet': 'classical',
};

function currentGenre(track) {
  return genres[track.id] ?? (track.kind === 'piano' ? 'piano' : 'screen');
}

function filterShelf() {
  const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const genre = genreFilter.value;
  const genreNames = Object.fromEntries([...genreFilter.options].map(option => [option.value, option.textContent]));
  let visible = 0;
  for (const [index, track] of themes.entries()) {
    const category = currentGenre(track);
    const haystack = [track.title, track.tag, track.desc, genreNames[category]].join(' ').toLowerCase();
    const matches = (!genre || genre === category) && words.every(word => haystack.includes(word));
    cards[index].hidden = !matches;
    visible += Number(matches);
  }
  control('emptyShelf').hidden = visible > 0;
}

function setFocus(enabled) {
  focus.setAttribute('aria-pressed', enabled);
  focus.textContent = enabled ? '退出专注模式' : '专注模式';
  control('libraryPanel').hidden = enabled;
  control('room').classList.toggle('focus-mode', enabled);
  if (enabled) control('settings').open = false;
}

function selectOption(element, value) {
  if ([...element.options].some(option => option.value === value)) element.value = value;
}

function applyAmbience() {
  bedVolume.disabled = !ambience.value;
  if (ambience.value && bed.getAttribute('src') !== 'media/' + ambience.value + '.wav') {
    bed.src = 'media/' + ambience.value + '.wav';
  }
  syncBed();
}
function showBackdrop(theme) {
  const choice = backdrop.value;
  const image = choice === 'auto' ? theme.id : choice;
  const cover = control('cover');
  cover.hidden = image === 'plain';
  if (!cover.hidden) cover.src = coverPath(image);
  cover.parentElement.classList.toggle('piano', cover.hidden);
}

function select(index, start, position = 0) {
  current = (index + themes.length) % themes.length;
  const theme = themes[current];
  document.documentElement.style.setProperty('--accent', theme.color);
  const piano = theme.kind === 'piano';
  showBackdrop(theme);

  chapters = theme.chapters;
  control('chapterRow').hidden = !chapters.length;
  chapterMenu.replaceChildren();
  for (const chapter of chapters) {
    const option = document.createElement('option');
    option.value = String(chapter.start);
    option.textContent = clock(chapter.start) + ' · ' + chapter.title;
    chapterMenu.append(option);
  }
  control('style').textContent = theme.tag + ' · ' + chapters.length + ' 章';
  control('theme').textContent = theme.title;
  control('track').textContent = (piano ? '钢琴独奏' : theme.kind === 'opening' ? '番剧片头风纯音乐' : theme.kind === 'anime' ? '动画风纯音乐' : '长听版') + ' · ' + clock(theme.seconds);
  control('description').textContent = theme.desc;
  setVolumes();
  pendingPosition = position;
  music.src = 'media/' + theme.id + '-long.mp3';
  const download = control('download');
  download.href = music.getAttribute('src');
  download.download = theme.title + '·长听版.mp3';
  cards.forEach((card, position) => card.setAttribute('aria-pressed', position === current));
  report();
  showProgress();
  saveSession();
  if (start) play();
}

control('play').onclick = () => music.paused ? play() : music.pause();
control('prev').onclick = () => stepTrack(-1, !music.paused);
control('next').onclick = () => stepTrack(1, !music.paused);
repeat.onchange = () => {
  music.loop = repeat.value === 'one';
  if (repeat.value === 'shuffle') {
    resetShuffle();
    stepTrack(1, true);
    return;
  }
  saveSession();
};
search.oninput = filterShelf;
genreFilter.onchange = filterShelf;
focus.onclick = () => setFocus(focus.getAttribute('aria-pressed') !== 'true');
control('locate').onclick = () => {
  if (cards[current].hidden) {
    search.value = '';
    genreFilter.value = '';
    filterShelf();
  }
  cards[current].scrollIntoView({ block: 'nearest' });
  cards[current].focus({ preventScroll: true });
};
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.repeat) return;
  if (event.key === 'Escape' && focus.getAttribute('aria-pressed') === 'true') {
    setFocus(false);
    focus.focus();
  } else if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault();
    control('play').click();
  }
});
backdrop.onchange = () => {
  showBackdrop(themes[current]);
  saveSession();
};
chapterMenu.onchange = () => { music.currentTime = Number(chapterMenu.value); };
function changeVolume() {
  setVolumes();
  saveSession();
}
musicVolume.oninput = changeVolume;
bedVolume.oninput = changeVolume;
ambience.onchange = () => {
  applyAmbience();
  saveSession();
};
seek.oninput = () => { music.currentTime = Number(seek.value); };
for (const event of ['play', 'pause', 'emptied']) {
  music.addEventListener(event, () => {
    control('play').textContent = music.paused ? '播放' : '暂停';
    syncBed();
  });
}
for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied']) {
  music.addEventListener(event, showProgress);
}
music.addEventListener('loadedmetadata', () => {
  const position = pendingPosition;
  pendingPosition = 0;
  if (position > 0 && position < music.duration - 1) music.currentTime = position;
  showProgress();
  saveSession();
});
music.addEventListener('timeupdate', () => {
  const now = Date.now();
  if (now - lastSave < 3000) return;
  lastSave = now;
  saveSession();
});
music.addEventListener('seeked', saveSession);
music.addEventListener('pause', saveSession);
window.addEventListener('pagehide', saveSession);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveSession();
});
music.addEventListener('ended', () => stepTrack(1, true));
music.addEventListener('error', () => report('找不到或无法读取当前音频文件。'));
renderShelf();
const session = loadSession();
selectOption(backdrop, session.backdrop);
selectOption(ambience, session.ambience);
selectOption(repeat, session.repeat);
for (const [slider, value] of [[musicVolume, session.volume], [bedVolume, session.bedVolume]]) {
  if (value != null && Number.isFinite(Number(value))) slider.value = Math.max(0, Math.min(100, Number(value)));
}
music.loop = repeat.value === 'one';
applyAmbience();
const savedKind = session.kind === 'short' ? 'long' : session.kind;
const savedTrack = themes.findIndex(theme => theme.id === session.id && theme.kind === savedKind);
const resumeAt = savedTrack >= 0 && savedKind === session.kind && Number.isFinite(session.position) ? Math.max(0, session.position) : 0;
current = Math.max(0, savedTrack);
if (repeat.value === 'shuffle') {
  resetShuffle();
  const state = session.shuffle;
  if (Array.isArray(state?.history) && Array.isArray(state.remaining)) {
    const indexOf = id => themes.findIndex(track => track.id === id);
    const past = state.history.map(indexOf);
    const pool = state.remaining.map(indexOf);
    if (Number.isInteger(state.cursor) && past[state.cursor] === current &&
        past.every(i => i >= 0) && pool.every(i => i >= 0)) {
      history = past;
      cursor = state.cursor;
      remaining = pool;
    }
  }
}
select(current, false, resumeAt);
