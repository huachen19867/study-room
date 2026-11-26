"""Generate bossa nova, Celtic folk and mallet minimalism study suites."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parent
spec = spec_from_file_location("study_variety", ROOT / "render-variety.py")
base = module_from_spec(spec)
spec.loader.exec_module(base)
RATE = base.RATE

SUITES = [
    dict(id="study-bossa", title="天井里的半拍", tag="巴萨诺瓦 · 尼龙弦、长笛与沙锤",
         color="#e5cc96", desc="尼龙弦把和弦放在弱拍，长笛在吉他的留白里接话。",
         chapters=["前廊","拐角","一扇半开的门","光移到地上","走回去","空椅子"],
         tempi=[96,102,94,100,92,98], shifts=[0,2,0,-2,2,0], gain=5.0,
         patches=[(0,24,113,49),(1,32,84,64),(2,73,93,74),(9,0,66,66)]),
    dict(id="study-celtic", title="灯塔以北三英里", tag="凯尔特民谣 · 锡笛、竖琴、小提琴",
         color="#bad6b1", desc="六八拍像走在起伏的小路上，锡笛引路，竖琴和小提琴在身后应答。",
         chapters=["石阶","坡顶的风","旧里程碑","海鸟飞过","草里有路径","回望灯塔"],
         tempi=[82,89,78,86,82,74], shifts=[0,2,0,-2,2,0], gain=4.0,
         patches=[(0,46,104,77),(1,42,75,57),(2,78,99,57),(3,40,91,70)]),
    dict(id="study-mallet", title="玻璃珠计数法", tag="极简马林巴 · 五拍、颤音琴与低音",
         color="#b5d7eb", desc="马林巴把五拍分成三加二。颤音琴隔几小节才响一次，像拨动一颗玻璃珠。",
         chapters=["三加二","换一颗","两手交错","少算一拍","对齐","从一重数"],
         tempi=[94,97,91,98,92,88], shifts=[0,0,3,3,-2,0], gain=4.2,
         patches=[(0,12,103,45),(1,11,83,82),(2,46,81,62),(3,42,75,61)]),
]

HARMONY = [
    [(36,[55,59,64,69]),(33,[55,60,64,71]),(38,[53,57,60,64]),(43,[53,59,62,69]),
     (40,[55,59,62,66]),(45,[55,60,64,67]),(41,[52,57,60,67]),(43,[53,57,61,67])],
    [(38,[57,62,65,69]),(33,[57,60,64,67]),(36,[55,60,64,67]),(43,[55,59,62,67]),
     (41,[53,57,60,65]),(34,[53,58,62,65]),(38,[57,62,64,69]),(45,[57,61,64,69])],
    [(42,[54,57,61,64]),(38,[54,57,62,66]),(45,[52,57,61,64]),(40,[52,56,59,64]),
     (47,[54,57,59,62]),(37,[53,56,61,64]),(38,[54,57,59,62]),(42,[54,57,61,66])],
]
ROUTES = [[0,1,2,3,0,4,6,3],[6,4,2,7,5,2,3,0],[0,5,6,4,2,5,7,0],
          [2,1,0,3,4,6,7,0],[6,2,0,4,5,2,3,0],[0,2,6,3,4,2,0,0]]
FOLK = [
    [(0,0,.42),(.5,1,.22),(.76,2,.53),(1.5,3,.43),(2,2,.42),(2.5,1,.40)],
    [(0,2,.56),(.75,1,.20),(1,0,.40),(1.5,1,.52),(2.25,3,.55)],
    [(.25,1,.40),(.75,3,.61),(1.5,2,.37),(2,1,.42),(2.5,0,.42)],
]


def arrange(kind, chapter, bpm, shift):
    rng = random.Random(1209 + chapter * 23 + kind * 89)
    events = defaultdict(list)
    meter = [4,3,5][kind]
    tick = RATE * 60 / bpm
    phrases = round(8.5 * bpm / (meter * 8))
    for phrase in range(phrases):
        route = ROUTES[(chapter + phrase//2 + phrase%3) % len(ROUTES)]
        thin = phrase % 7 == 4
        for bar, chord in enumerate(route):
            root, keys = HARMONY[kind][chord]
            downbeat = (phrase * 8 + bar) * meter
            tuning = shift + (2 if phrase%8 in (5,6) else 0)
            melody = [keys[1],keys[2],keys[3],keys[0]+12]

            def put(channel, pitch, at, length, strength):
                start = round((downbeat + at) * tick)
                end = start + round(length*tick)
                pitch += 0 if channel == 9 else tuning
                events[start].append((channel, pitch, strength+rng.randint(-3,3)))
                events[end].append((channel, pitch, 0))

            if kind == 0:
                put(1,root,0,1.35,67)
                put(1,root+7,2,1.28,61)
                beats = [0,.75,1.5,2.5,3.25] if (bar+chapter)%2 else [.5,1.25,2,2.75,3.5]
                for at in beats[::2] if thin else beats:
                    for i,key in enumerate(keys):
                        put(0,key,at+i*.022,.29 if at>2.5 else .43,(62 if at%1==0 else 54)-i*3)
                flute = [(.5,0,.68),(1.5,2,.67),(2.75,1,.62)] if bar%2 else [(0,1,1.13),(1.5,3,.66),(3,2,.68)]
                if not thin and bar%4!=3:
                    for at,index,hold in flute:
                        put(2,melody[(index+phrase+bar)%4]+12,at,hold,64)
                for at in [0,1,1.5,2,3,3.5]:
                    put(9,70,at,.14,38)
                for at in [1.5,3.5]:
                    put(9,37,at,.12,43)
            elif kind == 1:
                put(1,root+12,0,2.75,56)
                for at,i in [(0,0),(.5,1),(1,2),(1.5,3),(2,2),(2.5,1)]:
                    if not thin or i%2==0:
                        put(0,keys[i],at,.38,60 if at in (0,1.5) else 49)
                notes = FOLK[(chapter+phrase+bar)%3]
                answer = (phrase%4 == 2 or bar%4 == 3)
                for at,index,hold in notes:
                    if thin and at not in (0,1.5):
                        continue
                    put(3 if answer else 2,melody[(index+bar%2)%4]+(0 if answer else 12),at,hold,65)
            else:
                put(3,root+12,0,3.8,56)
                for at in [0,3]:
                    put(2,root+12+(7 if at else 0),at,1.42,56)
                for index,at in enumerate([0,.5,1,1.5,2,2.5,3,3.5,4,4.5]):
                    if thin and index%3!=0:
                        continue
                    offset = (index + (bar+chapter)%4) % 4
                    put(0,keys[offset]+(12 if index in (3,8) else 0),at,.31,
                        67 if index in (0,6) else 52)
                if bar%2==0 or thin:
                    for at,index in [(.75,1),(3.25,3)]:
                        put(1,melody[(index+phrase)%4]+12,at,1.26,55)
    return events,round(phrases*8*meter*tick)


def main():
    encoder = sys.argv[1] if len(sys.argv)>1 else "ffmpeg"
    with ThreadPoolExecutor(max_workers=len(SUITES)) as pool:
        jobs = [pool.submit(base.render,index,suite,encoder,arrange) for index,suite in enumerate(SUITES)]
        tracks = [job.result() for job in jobs]
    (ROOT/"encore-tracks.js").write_text("globalThis.studyEncoreTracks = "+
        json.dumps(tracks,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")


if __name__ == "__main__":
    main()
