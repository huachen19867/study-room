"""Render an original instrumental anime opening and its variations."""
from collections import defaultdict
import json
from pathlib import Path
import random
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REF = ROOT / "reference" if (ROOT / "reference").is_dir() else ROOT.parents[1] / "reference"
sys.path.insert(0, str(REF / "study-python"))
from tinysoundfont import Synth

RATE = 32000
TITLE = "放学铃响之前"
ID = "anime-opening"
BANK = REF / "study-generaluser-gs" / "GeneralUser-GS.sf2"
CHORDS = {
    "C": (36, (60, 64, 67, 71)), "G/B": (35, (59, 62, 67, 69)),
    "Am": (33, (57, 60, 64, 67)), "F": (41, (57, 60, 65, 69)),
    "G": (43, (59, 62, 67, 69)), "Em": (40, (55, 59, 64, 67)),
    "Dm": (38, (57, 60, 62, 65)), "E7": (40, (56, 59, 62, 64)),
    "C/E": (40, (55, 60, 64, 67)),
}

# Offsets and lengths are in beats; pitches are MIDI notes in C.
HOOK = [
    [(0, 72, .42),(.5, 76, .43),(1, 79, .72),(2, 81, 1.22),(3.5, 79, .38)],
    [(0, 76, .88),(1, 74, .39),(1.5, 71, .72),(2.5, 74, 1.14)],
    [(.25, 76, .5),(1, 79, .44),(1.5, 83, 1.27),(3, 81, .39),(3.5, 79, .37)],
    [(0, 76, .65),(1, 74, .42),(1.5, 72, 1.38),(3.25, 69, .58)],
    [(0, 72, .46),(.5, 76, .42),(1, 79, .7),(2, 81, .85),(3, 84, .82)],
    [(0, 83, 1.24),(1.5, 79, .4),(2, 81, .5),(2.75, 83, .91)],
    [(0, 84, .7),(1, 83, .38),(1.5, 81, .4),(2, 80, 1.65)],
    [(0, 81, 1.45),(1.5, 76, .45),(2, 72, .95),(3.5, 76, .44)],
]
VERSE = [
    [(.5, 64, .69),(1.5, 67, .39),(2, 69, .52),(3, 67, .77)],
    [(.25, 62, .65),(1, 67, 1.4),(3, 64, .64)],
    [(0, 69, .73),(1, 72, .49),(1.5, 71, .46),(2, 69, 1.45)],
    [(.5, 65, .44),(1, 69, .66),(2, 67, 1.71)],
    [(0, 64, .65),(1.25, 67, .55),(2, 72, .75),(3.25, 71, .51)],
    [(.5, 67, .58),(1.5, 64, .7),(2.75, 62, .91)],
    [(0, 64, .7),(1, 69, .7),(2, 72, .67),(3, 74, .7)],
    [(.5, 69, .61),(1.5, 67, 1.42),(3.5, 65, .41)],
]
PRE = [
    [(0, 65, .67),(1, 69, .76),(2, 72, 1.43)],
    [(.5, 67, .5),(1.5, 71, .54),(2.5, 74, 1.15)],
    [(0, 67, .5),(.75, 71, .5),(1.5, 76, .5),(2.25, 79, 1.56)],
    [(0, 76, .67),(1, 81, 1.5),(3.25, 79, .46)],
    [(0, 69, .63),(1, 72, .63),(2, 77, 1.62)],
    [(.25, 67, .64),(1, 71, .47),(1.5, 74, .55),(2.25, 79, 1.42)],
    [(0, 76, .45),(.5, 79, .45),(1, 84, .67),(2, 83, 1.68)],
    [(0, 81, 1.25),(1.5, 79, .75),(3.35, 71, .48)],
]
PARTS = {
    "intro": (("C","G/B","Am","F"), HOOK),
    "verse": (("C","G/B","Am","F","C","G/B","Am","F"), VERSE),
    "pre": (("Dm","G","Em","Am","F","G","C/E","G"), PRE),
    "hook": (("F","G","Em","Am","F","G","E7","Am"), HOOK),
    "bridge": (("Am","Em","F","C/E","Dm","Am","F","G"), VERSE),
    "tag": (("F","G","C","C"), HOOK),
}
OPENING = [("intro",8),("verse",12),("pre",8),("hook",16),("tag",8)]
LONG_FORM = [("verse",16),("pre",8),("hook",16),("bridge",16),("verse",8),("hook",16),("tag",8)]
CHAPTERS = [
    ("片头", 148, 0, "band"),
    ("走廊镜头", 117, 0, "clean"),
    ("三号楼楼顶", 124, 2, "strings"),
    ("放学路的间奏", 105, -2, "acoustic"),
    ("最后一圈", 139, 0, "band"),
    ("天色渐暗", 108, 0, "piano"),
    ("片头回归", 137, 2, "finale"),
]

def build_events(form, bpm, key, style, variation):
    events = defaultdict(list)
    rng = random.Random(399 + variation)
    bar = 0

    def put(channel, midi, offset, duration, velocity):
        # Delayed attacks on chord strings keep strums distinct from keyboard hits.
        when = max(0, (bar * 4 + offset) * 60 / bpm)
        start = round(when * RATE)
        stop = start + max(1, round(duration * 60 / bpm * RATE))
        events[start].append((channel, midi, max(1, min(127, velocity + rng.randint(-3, 3)))))
        events[stop].append((channel, midi, 0))

    full_band = style in {"band", "finale"}
    for part, length in form:
        changes, phrases = PARTS[part]
        for index in range(length):
            chord = changes[index % len(changes)]
            bass, tones = CHORDS[chord]
            strong = part in {"hook", "tag"}
            open_texture = part in {"intro", "bridge"}
            transpose = key + (2 if style == "finale" and strong and index >= 8 else 0)
            lead_ch = 8 if full_band and part == "intro" else 0 if full_band else 6 if style == "strings" else 1
            for offset, midi, duration in phrases[index % 8]:
                if open_texture and index % 4 == 1 and offset < 1:
                    continue
                if variation % 3 == 2 and part in {"verse","bridge"} and index % 4 == 1:
                    midi -= 7
                if style == "piano" and not strong and offset > 2.8:
                    continue
                put(lead_ch, midi + transpose, offset, duration, 89 if strong else 80)
                if full_band and strong and index % 4 in (0, 2):
                    put(6, midi - 12 + transpose, offset + .05, duration * .91, 57)

            if style in {"piano","acoustic","strings"} or open_texture:
                for step, interval in [(0,0),(1.9,7)]:
                    put(4, bass + transpose + interval, step, 1.65, 59)
            else:
                pattern = [(0,0, .75),(.95,0,.36),(1.5,7,.4),(2,0,.43),(2.5,12,.43),(3.25,7,.53)]
                for offset, interval, duration in pattern:
                    put(4, bass + transpose + interval, offset, duration, 82 if strong else 72)

            if full_band and not open_texture:
                guitar_midi = bass + transpose + 12
                hits = [(0,.34),(.52,.26),(1,.27),(1.5,.35),(2,.4),(2.76,.23),(3,.27),(3.52,.34)]
                if strong:
                    hits = [(0,.84),(1.03,.38),(1.55,.41),(2,.78),(3,.4),(3.51,.42)]
                for beat, sustain in hits:
                    for channel, delay in [(2,0),(3,.043)]:
                        for string, interval in enumerate([0,7,12]):
                            put(channel, guitar_midi + interval, beat+delay+.012*string,
                                sustain, (72 if strong else 59) - string*6)
            else:
                for step in range(8):
                    tone = tones[(step + (step // 4)) % 4]
                    put(8 if full_band and part == "intro" else 2, tone + transpose, .5*step, .43, 58 if step % 4 == 0 else 46)

            if part in {"pre","hook","tag"} or style == "strings":
                for tone in tones[:3]:
                    put(5, tone + transpose, .13, 3.62, 59 if strong else 48)
            for beat in ([0,1.5,2.5,3.5] if strong else [.3,2.22]):
                tone = tones[round(beat * 2) % 4]
                put(7, tone + transpose, beat, .45, 63 if strong else 54)

            if (full_band or style == "clean") and not (part == "intro" and index < 4):
                for beat in ([0,1.5,2,2.75,3.52] if strong else [0,1.75,2.5]):
                    put(9,36,beat,.22,99 if strong else 84)
                for beat in [1,3]:
                    put(9,38,beat,.25,91 if strong else 77)
                for eighth in range(8):
                    put(9,46 if strong and eighth in (3,7) else 42,eighth/2,.14,
                        64 if eighth%2==0 else 51)
                if strong and index % 8 == 0:
                    put(9,49,0,.28,76)
                if part == "pre" and index % 8 == 7:
                    for beat, note in [(2.55,45),(2.83,47),(3.1,48),(3.57,38)]:
                        put(9,note,beat,.22,77)
            elif style in {"strings","acoustic"} and index % 2 == 0:
                put(9, 36, 0, .19, 53)
                put(9, 42, 2, .2, 45)
            bar += 1
    return events, round(bar * 4 * 60 / bpm * RATE)


def select_programs(synth, bank, style):
    loud = style in {"band", "finale"}
    presets = {0:29,1:0,2:30 if loud else 25,3:30,4:34,5:48,6:40,7:0,8:27,9:0}
    levels = {0:99,1:108,2:71,3:66,4:95,5:64,6:72,7:60,8:91,9:101}
    pans = {0:65,1:64,2:25,3:100,4:64,5:82,6:56,7:78,8:53,9:64}
    if style == "strings":
        levels[6] = 103
    if style == "clean":
        presets[1] = 4
    for channel, preset in presets.items():
        synth.program_select(channel, bank, 0, preset, channel == 9)
        synth.control_change(channel, 7, levels[channel])
        synth.control_change(channel, 10, pans[channel])


def play_events(synth, pipe, events, length):
    cursor = 0
    for target, change in sorted(events.items()):
        if target > cursor:
            pipe.write(synth.generate_simple(target - cursor))
            cursor = target
        # Release a preceding note before any new hit on the same key.
        for channel, note, velocity in sorted(change, key=lambda event: bool(event[2])):
            if velocity:
                synth.noteon(channel, note, velocity)
            else:
                synth.noteoff(channel, note)
    if cursor < length:
        pipe.write(synth.generate_simple(length - cursor))
    return max(length, cursor)


def main():
    encoder = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
    media = ROOT / "media"
    temp = media / f"{ID}-long.part.mp3"
    child = subprocess.Popen([
        encoder, "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le",
        "-ar", str(RATE), "-ac", "2", "-i", "pipe:0", "-af",
        "volume=4.6,acompressor=threshold=0.17:ratio=1.6:attack=16:release=220,"
        "alimiter=limit=0.78:attack=5:release=100:level=false:latency=1",
        "-codec:a", "libmp3lame", "-b:a", "112k", "-metadata", f"title={TITLE}",
        str(temp)
    ], stdin=subprocess.PIPE)
    synth = Synth(gain=-8, samplerate=RATE)
    bank = synth.sfload(str(BANK))
    chapters = []
    frames = 0
    try:
        for index, (title, bpm, key, style) in enumerate(CHAPTERS):
            chapters.append({"title": title, "start": round(frames / RATE)})
            select_programs(synth, bank, style)
            forms = [OPENING, LONG_FORM, LONG_FORM] if index == 0 else [LONG_FORM] * (3 if bpm >= 120 else 2)
            for variation, form in enumerate(forms):
                if variation == 1 and index != 0:
                    form = [("bridge",16),("verse",16),("pre",8),("hook",16),("verse",8),("hook",16),("tag",8)]
                events, length = build_events(form, bpm, key, style, variation + index)
                frames += play_events(synth, child.stdin, events, length)
            child.stdin.write(synth.generate_simple(RATE // 2))
            frames += RATE // 2
            print(title, round(frames / RATE), flush=True)
        child.stdin.close()
        if child.wait():
            raise RuntimeError("FFmpeg failed to encode the soundtrack")
        temp.replace(media / f"{ID}-long.mp3")
    except BaseException:
        child.kill()
        child.wait()
        temp.unlink(missing_ok=True)
        raise

    data = {
        "id": ID, "title": TITLE, "color": "#f1ba92",
        "tag": "番剧片头风 · 吉他与乐队",
        "desc": "从干净吉他进入主歌，鼓组和弦乐逐渐铺开，副歌把四个音的主题推到高处。",
        "seconds": round(frames / RATE), "chapters": chapters,
    }
    metadata = "globalThis.studyOpeningTrack = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "opening-track.js").write_text(metadata, encoding="utf-8")


if __name__ == "__main__":
    main()
