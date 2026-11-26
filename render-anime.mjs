import { writeFileSync } from 'node:fs';
import './anime-themes.js';
import { renderSuite } from './render-long.mjs';

const results = await Promise.allSettled(globalThis.studyAnimeThemes.map(theme =>
  renderSuite(theme, theme.suite, 8.5)));
const errors = results.filter(result => result.status === 'rejected');
if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Anime suite rendering failed');
const library = Object.fromEntries(results.map(result => result.value));
writeFileSync(new URL('./anime-tracks.js', import.meta.url),
  'globalThis.studyAnimeTracks = ' + JSON.stringify(library, null, 2) + ';\n');
