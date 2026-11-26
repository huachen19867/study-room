"""Render three long study suites using the local GeneralUser GS instrument bank."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import json
import random
import subprocess
import sys

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = spec_from_file_location("study_opening", ROOT / "render-opening.py")
opening = module_from_spec(spec)
spec.loader.exec_module(opening)
BANK, RATE, Synth, play_events = opening.BANK, opening.RATE, opening.Synth, opening.play_events

SUITES = [
    dict(id="mix-jazz", title="两张票根之间", tag="爵士三重奏 · 钢琴、低音提琴、刷鼓",
         color="#edbd8b", desc="低音提琴走四拍，钢琴的旋律从弱拍进来，刷鼓把拍子放在后面。",
         chapters=["第一行", "切分", "低音说话", "空两小节", "换一个调", "把末尾折起来"],
         tempi=[104, 110, 97, 102, 107, 94], shifts=[0, 2, -2, 0, 5, 0]),
    dict(id="mix-chamber", title="三封未寄出的信", tag="室内乐 · 弦乐、竖琴、双簧管",
         color="#ced8a4", desc="双簧管和小提琴交替领奏，大提琴托住低音。竖琴只在乐句之间出现。",
         chapters=["称呼", "第一封", "没有邮戳", "第二封", "第三封", "折回原处"],
         tempi=[70, 76, 65, 72, 68, 63], shifts=[0, 3, 0, -2, 5, 0]),
    dict(id="mix-electronic", title="信号通过第九扇窗", tag="柔和电子 · 模拟合成器、低拍、短音回声",
         color="#a8cee8", desc="低频拍点很轻，上方的短音像断续的信号。每隔几章，节奏才换一种走法。",
         chapters=["校准", "初次回波", "偏移", "暗区", "同频", "余波"],
         tempi=[83, 86, 79, 81, 88, 75], shifts=[0, 0, -3, 2, 2, 0]),
]

# Bass root, voicing and available melody tones, all written in the same register.
JAZZ = [
    (38,[53,57,60,64],[62,64,65,67,69,72]),
    (43,[53,59,62,69],[62,65,67,69,71,74]),
    (36,[52,55,59,62],[60,62,64,67,69,71]),
    (45,[55,59,61,64],[61,64,67,69,71,73]),
    (41,[52,57,60,67],[60,64,65,67,69,72]),
    (47,[53,57,62,65],[59,62,65,67,69,72]),
    (40,[50,56,62,65],[62,64,65,68,71,74]),
    (45,[52,55,60,64],[60,62,64,67,69,72]),
]
CLASSICAL = [
    (38,[50,57,62,65],[62,64,65,67,69,74]),
    (34,[53,58,62,65],[58,62,65,67,69,70]),
    (41,[53,57,60,65],[60,62,65,67,69,72]),
    (36,[55,60,64,67],[60,64,67,69,72,76]),
    (43,[55,58,62,67],[62,65,67,69,70,74]),
    (45,[55,61,64,67],[61,64,67,69,73,76]),
    (38,[53,57,60,62],[60,62,65,67,69,74]),
    (34,[53,57,62,65],[58,62,65,67,69,74]),
]
ELECTRONIC = [
    (42,[54,57,61,64],[57,61,64,66,69,73]),
    (38,[54,57,61,66],[57,61,62,66,69,73]),
    (45,[52,57,61,64],[57,59,61,64,69,71]),
    (40,[52,56,59,66],[56,59,64,66,68,71]),
    (47,[54,57,59,62],[57,59,62,66,69,74]),
    (37,[53,56,61,64],[56,61,64,65,68,73]),
    (38,[54,57,59,66],[57,59,62,66,69,73]),
    (42,[52,57,61,66],[57,61,64,66,69,73]),
]
FORMS = [
    [0,1,2,3,0,1,2,2], [4,4,5,6,7,0,1,2], [0,3,4,6,7,0,1,2],
    [2,4,0,1,5,6,7,2], [4,5,6,7,0,1,3,2], [0,1,2,4,7,0,1,2],
]
CONTOURS = [[2,4,3,5,4,2,1,0],[0,2,5,3,1,3,4,2],[4,3,5,4,2,1,3,0],
            [3,2,1,0,2,4,3,1],[0,3,5,4,1,3,2,0],[2,4,1,3,5,4,2,0]]


def build(kind, chapter, bpm, shift):
    rng = random.Random(533 + chapter * 137 + kind * 17)
    events = defaultdict(list)
    meter = 3 if kind == 1 else 4
    beat_frames = 60 / bpm * RATE
    phrases = max(1, round(8.6 * bpm / (8 * meter)))
    voicings = [JAZZ, CLASSICAL, ELECTRONIC][kind]
    for phrase in range(phrases):
        line = FORMS[(chapter + phrase // 2 + (phrase % 3 == 2)) % len(FORMS)]
        contour = CONTOURS[(chapter + phrase) % len(CONTOURS)]
        transpose = shift + (2 if phrase % 8 in (4, 5) else 0)
        sparse = phrase % 6 == 4
        answer = phrase % 4 == 2
        for bar, chord in enumerate(line):
            base = (phrase * 8 + bar) * meter
            root, keys, tones = voicings[chord]
            next_root = voicings[line[(bar + 1) % 8]][0]
            degree = contour[bar]
            next_degree = contour[(bar + 1) % 8]

            def note(channel, pitch, at, hold, vel, transpose_note=True):
                start = round((base + at) * beat_frames)
                end = start + max(1, round(hold * beat_frames))
                pitch += transpose if transpose_note else 0
                events[start].append((channel, pitch, min(125, max(1, vel + rng.randint(-3, 3)))))
                events[end].append((channel, pitch, 0))

            if kind == 0:
                distance = -1 if next_root < root else 1
                for at, pitch in enumerate([root, root+7, root+12, next_root-distance]):
                    if sparse and at in (1, 3):
                        continue
                    note(1, pitch, at, .78, 73 if at == 0 else 58)
                hits = [.67, 2.67] if sparse or answer else [.10, 1.67, 3.15]
                for at in hits:
                    for offset, pitch in enumerate(keys[:3]):
                        note(0, pitch, at+.017*offset, .51, 53-offset*3)
                rhythm = [(0,.53),(.67,.2),(1,.53),(1.67,.23),(2.67,.24),(3,.8)]
                if sparse:
                    rhythm = [(.67,.8),(2,.8)]
                elif answer:
                    rhythm = [(0,1.2),(1.67,.25),(2.67,.79)]
                indexes = [degree, (degree+1)%6, (degree+2)%6, (degree+1)%6, next_degree, degree]
                for (at,hold), index in zip(rhythm,indexes):
                    note(2, tones[index]+12, at, hold, 72 if at in (0,3) else 62)
                for at in [1,3]:
                    note(9,38,at,.2,42,False)
                for at in [0,1,1.67,2,3,3.67]:
                    note(9,42 if chapter % 2 else 51,at,.16,40 if at%1==0 else 33,False)
            elif kind == 1:
                note(0, root+12, 0, 2.79, 61 if sparse else 68)
                note(1, keys[1], .09, 1.27, 57)
                note(1, keys[(bar+1)%4], 1.53, 1.35, 61)
                lead = 3 if answer else 2
                if bar % 4 != 3 or answer:
                    note(lead, tones[degree]+(12 if lead == 2 else 0), .17, 1.51, 69)
                    note(lead, tones[next_degree]+(12 if lead == 2 else 0), 1.81, .92, 62)
                if not sparse:
                    for pulse,pitch in zip([.05,.45,.98,1.47,2.37], [keys[0],keys[2],keys[1],keys[3],keys[2]+12]):
                        note(4,pitch,pulse,.39,51)
                if bar % 4 == 3:
                    note(3 if lead == 2 else 2, tones[2], 1.23, 1.49, 65)
            else:
                for pulse in ([0, 2.49] if sparse else [0, 1.5, 2.49, 3.18]):
                    note(0,root,pulse,.66,69 if pulse == 0 else 56)
                for pitch in keys[:3]:
                    note(1,pitch,.05,3.72,53)
                for pulse,index in ([(.77,degree),(2.77,next_degree)] if sparse else
                                    [(.25,degree),(.98,(degree+2)%6),(1.75,next_degree),(2.51,degree),(3.26,(degree+4)%6)]):
                    note(2,tones[index]+12,pulse,.27,64 if pulse < 1 else 51)
                    if not answer:
                        note(3,tones[index]+12,pulse+.33,.24,36)
                for pulse in ([0,2.52] if sparse else [0,1.51,2.52]):
                    note(9,36,pulse,.2,62,False)
                note(9,37,2,.15,43,False)
                if not sparse:
                    for pulse in [.5,1,1.75,2.75,3.5]:
                        note(9,42,pulse,.13,33,False)
    return events, round(phrases * 8 * meter * beat_frames)


def render(kind, suite, encoder, builder=build):
    sound = Synth(gain=-8, samplerate=RATE)
    bank = sound.sfload(str(BANK))
    default_patches = [
        [(0,0,85,48),(1,32,96,64),(2,0,107,63),(9,40,66,68)],
        [(0,42,90,52),(1,41,73,79),(2,40,101,50),(3,68,86,67),(4,46,82,83)],
        [(0,38,96,63),(1,89,83,67),(2,11,97,48),(3,11,75,87),(9,24,72,64)],
    ]
    patches = suite['patches'] if 'patches' in suite else default_patches[kind]
    for channel, program, volume, pan in patches:
        sound.program_select(channel, bank, 0, program, channel == 9)
        sound.control_change(channel, 7, volume)
        sound.control_change(channel, 10, pan)
    media = ROOT / "media"
    temp = media / (suite["id"] + "-long.part.mp3")
    gain = suite['gain'] if 'gain' in suite else [4.2, 3.2, 3.6][kind]
    child = subprocess.Popen([
        encoder,"-hide_banner","-loglevel","error","-y","-f","f32le","-ar",str(RATE),
        "-ac","2","-i","pipe:0","-af",
        f"volume={gain},acompressor=threshold=0.16:ratio=1.5:attack=20:release=240,"
        "alimiter=limit=0.78:attack=5:release=100:level=false:latency=1",
        "-codec:a","libmp3lame","-b:a","96k","-metadata","title="+suite["title"],str(temp)
    ], stdin=subprocess.PIPE)
    chapters = []
    frames = 0
    try:
        for index, (name,bpm,shift) in enumerate(zip(suite["chapters"],suite["tempi"],suite["shifts"])):
            chapters.append({"title": name, "start": round(frames / RATE)})
            events, length = builder(kind,index,bpm,shift)
            frames += play_events(sound,child.stdin,events,length)
            print(suite["id"],name,round(frames/RATE),flush=True)
        child.stdin.write(sound.generate_simple(RATE))
        frames += RATE
        child.stdin.close()
        if child.wait():
            raise RuntimeError("FFmpeg did not finish " + suite["id"])
        temp.replace(media / (suite["id"] + "-long.mp3"))
    except BaseException:
        child.kill()
        child.wait()
        temp.unlink(missing_ok=True)
        raise
    return {**{key:suite[key] for key in ("id","title","tag","desc","color")},
            "chapters":chapters,"seconds":round(frames/RATE)}


def main():
    encoder = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
    with ThreadPoolExecutor(max_workers=len(SUITES)) as executor:
        jobs = [executor.submit(render,index,suite,encoder) for index,suite in enumerate(SUITES)]
        library = [job.result() for job in jobs]
    (ROOT / "variety-tracks.js").write_text(
        "globalThis.studyVarietyTracks = " + json.dumps(library, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
