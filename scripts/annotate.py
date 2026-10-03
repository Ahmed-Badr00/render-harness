"""Draw red rounded boxes and a short red label on screenshots (evidence for findings).

Usage: uv run --quiet --with pillow python annotate.py spec.json
spec.json: [{"src": "shots/iphone-15/orders__list-01.png", "out": "findings/evidence/LST-1.png",
             "label": "Back button sits under the status area", "boxes": [[x0, y0, x1, y1]],
             "label_at": [x, y], "device": "iphone-15"}]
Coordinates are device points (CSS px). The pixel scale is PNG width / device width, taken from "device" (devices.json),
or "scale", or guessed from the path (<shots>/<device>/...). Pass "scale": 1 for raw pixels.
A box can also be a selector instead of numbers: {"selector": "#moreActions"} reads the element's box from the shot's
log (list the selector in the scenario's "boxes" so shoot.mjs records it). "log" names the .log.json if it is not next
to the PNG (step shots after a fold live in <device>__to__<device2>/ while the log stays in <device>/).
"""
import glob
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

RED = (230, 20, 20)
HERE = os.path.dirname(os.path.abspath(__file__))
DEV = json.load(open(os.path.join(HERE, 'devices.json')))['devices']


def font(size):
    for f in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def scale_of(im, item):
    if 'scale' in item:
        return float(item['scale'])
    dev = item.get('device') or next((p for p in item['src'].replace('\\', '/').split('/') if p in DEV), None)
    if dev:
        return im.width / DEV[dev]['w']
    return 3.0


def box_from_log(item, sel):
    shot = os.path.basename(item['src'])
    src_dir = os.path.dirname(os.path.abspath(item['src']))
    logs = [item['log']] if item.get('log') else glob.glob(os.path.join(src_dir, '*.log.json'))
    if '__to__' in os.path.basename(src_dir):
        logs += glob.glob(os.path.join(os.path.dirname(src_dir), os.path.basename(src_dir).split('__to__')[0], '*.log.json'))
    for lp in logs:
        b = json.load(open(lp)).get('boxes', {}).get(shot, {}).get(sel)
        if b:
            pad = item.get('pad', 4)
            return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
    raise SystemExit(f'no box for {sel!r} on {shot}: add it to the scenario "boxes" and re-shoot, or give numbers')


def annotate(item):
    im = Image.open(item['src']).convert('RGB')
    k = scale_of(im, item)
    d = ImageDraw.Draw(im)
    fnt = font(int(13 * k))
    item['boxes'] = [box_from_log(item, b['selector']) if isinstance(b, dict) else b for b in item['boxes']]
    for bx in item['boxes']:
        d.rounded_rectangle([v * k for v in bx[:4]], radius=int(8 * k), outline=RED, width=max(3, int(2.7 * k)))
    words, lines, cur = item['label'].split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=fnt) > im.width - 40 * k / 3:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    lh = int(17 * k)
    h = lh * len(lines) + int(7 * k)
    tw = max(d.textlength(line, font=fnt) for line in lines) + int(13 * k)
    lx, ly = [v * k for v in item.get('label_at', item['boxes'][0][:2])]
    lx = max(7 * k, min(lx, im.width - tw - 7 * k))
    ly = ly - h - 4 * k if ly - h - 4 * k > 0 else ly + 4 * k
    d.rounded_rectangle([lx, ly, lx + tw, ly + h], radius=int(5 * k), fill=(255, 255, 255), outline=RED, width=max(2, int(1.7 * k)))
    for i, line in enumerate(lines):
        d.text((lx + 6 * k, ly + 3 * k + lh * i), line, fill=RED, font=fnt)
    os.makedirs(os.path.dirname(os.path.abspath(item['out'])), exist_ok=True)
    im.save(item['out'])
    print('ok', item['out'])


if __name__ == '__main__':
    for it in json.load(open(sys.argv[1])):
        annotate(it)
