"""Render the reading-room nocturne and the train ending theme."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import runpy
import sys

ROOT = Path(__file__).resolve().parent
engine = runpy.run_path(str(ROOT / "render-variety.py"))
SUITES = [
    dict(id="study-soundboard", title="琴弦下面亮着灯", tag="钢琴独奏 · 三拍夜曲",
         desc="左手在低音和内声之间轻摆，右手的四音问句隔着空拍才得到回答。",
         color="#e3c39b", chapters=["开灯","木纹","移低八度","只听左手","灯影重合","合上琴盖"],
         tempi=[68,72,64,66,71,63], shifts=[0,0,-2,0,3,0], gain=4.5,
         patches=[(0,0,108,58),(1,0,95,66)]),
    dict(id="study-platform", title="末班车驶出画框", tag="动画片尾 · 电钢琴、单簧管与弦乐",
         desc="电钢琴在后半拍落下，单簧管把一段上行旋律交给弦乐，最后两句留在空站台。",
         color="#d6b6ab", chapters=["站名牌","过桥","靠窗座位","隧道出口","车尾红灯","字幕落尽"],
         tempi=[84,88,80,86,90,78], shifts=[0,0,-2,2,2,0], gain=4.2,
         patches=[(0,4,96,50),(1,71,96,67),(2,48,76,77)])]

# Roots and chord tones in D minor and F major respectively.
CHORDS = [
    [(38,(57,62,65,69)),(34,(53,57,62,65)),(41,(57,60,65,69)),(36,(55,60,64,67)),
     (43,(58,62,65,69)),(45,(57,61,64,67)),(40,(55,58,62,65)),(38,(57,62,65,69))],
    [(41,(57,60,64,67)),(40,(55,60,64,67)),(38,(57,60,65,69)),(34,(53,57,62,65)),
     (43,(58,62,65,69)),(45,(55,60,64,69)),(36,(55,58,62,67)),(41,(57,60,65,69))]]

def arrange(kind, chapter, bpm, shift):
    meter = 4 if kind else 3
    beat = engine["RATE"] * 60 / bpm
    phrases = round(8 * bpm / (8 * meter))
    events = defaultdict(list)
    for phrase in range(phrases):
        for bar in range(8):
            chord = ([0,2,3,1,4,6,5,7] if phrase % 4 == 2 else range(8))[bar]
            root, tones = CHORDS[kind][chord]
            def note(channel, pitch, at, hold, velocity):
                start = round(((phrase * 8 + bar) * meter + at) * beat)
                pitch += shift
                events[start].append((channel, pitch, velocity))
                events[start + round(hold * beat)].append((channel, pitch, 0))
            quiet = phrase % 5 == 3 or chapter == 3
            cadence = bar == 7
            if kind == 0:
                note(1, root + 12, 0, 1.75, 49)
                for i in range(1 if quiet else 2):
                    note(1, tones[i], 1 + i * .62, .76, 45 + i)
                rhythm = [(0,2,.84),(1,3,.45),(1.5,1,.9)] if bar % 2 == 0 else [(.5,0,1.25),(2,1,.85)]
                for at, degree, hold in ([(0,0,2.6)] if cadence else rhythm):
                    if quiet and at == 1: continue
                    note(0, tones[(degree + phrase//3 % 2) % 4] + (0 if chapter == 2 else 12), at, hold, 62 if at < 1 else 54)
            else:
                note(0, root + 12, 0, 2.25, 57)
                for at in ([1.5] if quiet else [.5,2.5]):
                    for i,pitch in enumerate(tones[:3]):
                        note(0,pitch,at + i*.025,.95,48-i)
                lead = 2 if chapter == 2 or phrase % 4 == 2 else 1
                rhythm = [(.5,0,.45),(1,1,.45),(1.5,2,1.4),(3.25,3,.65)] if bar % 2 == 0 else [(0,2,1.7),(2,1,1.45)]
                for at, degree, hold in ([(0,0,3.2)] if cadence else rhythm):
                    if quiet and hold < .7: continue
                    note(lead,tones[degree]+12,at,hold,63 if at < 2 else 55)
                if not quiet and lead == 1 and bar % 4 == 3:
                    note(2,tones[0],.25,3.4,45)
    return events, round(phrases * 8 * meter * beat)

if __name__ == "__main__":
    encoder = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(engine["render"], i, suite, encoder, arrange) for i,suite in enumerate(SUITES)]
        tracks = [job.result() for job in jobs]
    (ROOT / "reading-tracks.js").write_text("globalThis.studyReadingTracks = " + json.dumps(tracks, ensure_ascii=False, indent=2) + ";\n", encoding="utf8")
