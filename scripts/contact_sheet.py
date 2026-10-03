"""Side-by-side contact sheets: one PNG per scenario (and per step shot) with one column per device.

Usage:
  uv run --quiet --with pillow python contact_sheet.py --shots WORK/shots --devices iphone-15,duo-cover,duo-open-l \
      --out WORK/sheets [--baseline DIR:LABEL] [--height 720] [--only SUBSTRING] [--all-pages] [--sequence]

Reads shoot.mjs output (<shots>/<device>/<name>-NN.png). --devices accepts ids or set names from devices.json.
--baseline adds a first column from another folder with the same file names (for example an earlier run or another
branch). Missing cells are grey so gaps are visible. Writes <out>/<name>.png and <out>/index.md.
--sequence: one sheet per scenario with one ROW per start device, left to right in capture order: the first screen,
then every step shot, including shots after a fold or unfold (<device>__to__<device2>/). Use it for fold flows and
multi-step journeys.
"""
import argparse
import glob
import json
import os
import re
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))


def font(size):
    for f in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/Library/Fonts/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def fit(d, text, fnt, width):
    """Shorten a label to its column so labels never run into the next column."""
    if d.textlength(text, font=fnt) <= width:
        return text
    while text and d.textlength(text + '...', font=fnt) > width:
        text = text[:-1]
    return text + '...'


def sequence(a, dev, ids):
    H = a.height
    fnt = font(20)
    os.makedirs(a.out, exist_ok=True)
    scen = {}
    for d in ids:
        folder = os.path.join(a.shots, d)
        if not os.path.isdir(folder):
            continue
        for f in os.listdir(folder):
            m = re.match(r'(.+?)-01\.png$', f)
            if m and '--' not in m.group(1) and (not a.only or a.only in f):
                scen.setdefault(m.group(1), []).append(d)
    written = []
    for name, devs in sorted(scen.items()):
        rows = []
        for d in devs:
            cells = [(os.path.join(a.shots, d, f'{name}-01.png'), f'{d}: start')]
            for folder in [os.path.join(a.shots, d)] + sorted(glob.glob(os.path.join(a.shots, f'{d}__to__*'))):
                to = os.path.basename(folder).split('__to__')[-1] if '__to__' in folder else d
                for f in os.listdir(folder):
                    m = re.match(re.escape(name) + r'--(.+)-01\.png$', f)
                    if m:
                        cells.append((os.path.join(folder, f), f'{to}: {m.group(1)}'))
            cells = cells[:1] + sorted(cells[1:], key=lambda c: os.path.getmtime(c[0]))
            rows.append(cells)
        if not any(len(r) > 1 for r in rows):
            continue
        ims = [[(lbl, Image.open(p).convert('RGB')) for p, lbl in r] for r in rows]
        ims = [[(lbl, im.resize((max(1, int(im.width * H / im.height)), H))) for lbl, im in r] for r in ims]
        W = max(sum(im.width for _, im in r) + 24 * (len(r) - 1) for r in ims)
        sheet = Image.new('RGB', (W, (H + 44) * len(ims)), (34, 34, 34))
        dr = ImageDraw.Draw(sheet)
        for ri, r in enumerate(ims):
            x, y = 0, ri * (H + 44)
            for lbl, im in r:
                sheet.paste(im, (x, y + 44))
                dr.text((x + 6, y + 10), fit(dr, lbl, fnt, im.width - 8), fill=(255, 255, 255), font=fnt)
                x += im.width + 24
        sheet.save(os.path.join(a.out, f'{name}__sequence.png'))
        written.append(name)
    with open(os.path.join(a.out, 'index.md'), 'w') as fh:
        fh.write(f'# Sequence sheets ({len(written)})\n\nRows: start devices; columns: capture order\n\n')
        fh.writelines(f'- {k}__sequence.png\n' for k in written)
    print(f'{len(written)} sequence sheets -> {a.out}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', required=True)
    ap.add_argument('--devices', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--baseline', action='append', default=[], help='DIR:LABEL, repeatable')
    ap.add_argument('--height', type=int, default=720)
    ap.add_argument('--only', default='')
    ap.add_argument('--all-pages', action='store_true')
    ap.add_argument('--sequence', action='store_true')
    a = ap.parse_args()

    dev = json.load(open(os.path.join(HERE, 'devices.json')))
    al = dev.get('aliases', {})
    ids = list(dict.fromkeys(al.get(x, x) for d in a.devices.split(',') if d for x in dev['sets'].get(d, [d])))
    cols = [(b.split(':', 1)[0], b.split(':', 1)[1] if ':' in b else os.path.basename(b.rstrip('/'))) for b in a.baseline]
    cols += [(os.path.join(a.shots, d), dev['devices'].get(d, {}).get('label', d)) for d in ids]

    if a.sequence:
        return sequence(a, dev, ids)
    page_re = re.compile(r'-(\d\d)\.png$')
    keys = set()
    for folder, _ in cols:
        if not os.path.isdir(folder):
            continue
        for f in os.listdir(folder):
            m = page_re.search(f)
            if not m or (not a.all_pages and m.group(1) != '01') or (a.only and a.only not in f):
                continue
            keys.add(f[:-4])
    os.makedirs(a.out, exist_ok=True)
    H = a.height
    fnt = font(22)
    written = []
    for key in sorted(keys):
        ims = []
        for folder, label in cols:
            p = os.path.join(folder, f'{key}.png')
            if os.path.exists(p):
                im = Image.open(p).convert('RGB')
                im = im.resize((max(1, int(im.width * H / im.height)), H))
            else:
                im = Image.new('RGB', (int(H * 0.5), H), (70, 70, 70))
            ims.append((label, im))
        W = sum(im.width for _, im in ims) + 24 * (len(ims) - 1)
        sheet = Image.new('RGB', (W, H + 44), (34, 34, 34))
        d = ImageDraw.Draw(sheet)
        x = 0
        for label, im in ims:
            sheet.paste(im, (x, 44))
            d.text((x + 6, 10), fit(d, label, fnt, im.width - 8), fill=(255, 255, 255), font=fnt)
            x += im.width + 24
        out = os.path.join(a.out, f'{key}.png')
        sheet.save(out)
        written.append(key)
    with open(os.path.join(a.out, 'index.md'), 'w') as fh:
        fh.write(f'# Contact sheets ({len(written)})\n\nColumns: {", ".join(label for _, label in cols)}\n\n')
        fh.writelines(f'- {k}.png\n' for k in written)
    print(f'{len(written)} sheets -> {a.out}')


if __name__ == '__main__':
    main()
