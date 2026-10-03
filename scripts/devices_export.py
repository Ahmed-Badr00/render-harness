"""Print devices.json profiles as code for non-browser renderers, so every renderer uses the same device matrix.

Usage: python devices_export.py --devices phones,duo --format swift|kotlin|flutter|simctl|json
- swift:   swift-snapshot-testing ViewImageConfig values (points, safe area, traits)
- kotlin:  Paparazzi DeviceConfig values (pixels, density dpi)
- flutter: a Dart map for golden tests (logical size, devicePixelRatio, padding)
- simctl:  suggested iOS Simulator device type per profile (create with xcrun simctl create)
- json:    the resolved profiles
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SIMS = {'iphone-se': 'iPhone SE (3rd generation)', 'iphone-13-mini': 'iPhone 13 mini', 'iphone-14': 'iPhone 14', 'iphone-15': 'iPhone 15',
        'iphone-15-pro-max': 'iPhone 15 Pro Max', 'ipad-mini': 'iPad mini (6th generation)', 'duo-cover': 'iPhone Duo', 'duo-open-l': 'iPhone Duo',
        'duo-open-p': 'iPhone Duo', 'duo-split-l': 'iPhone Duo', 'duo-split-p': 'iPhone Duo', 'iphone-17': 'iPhone 17',
        'iphone-air': 'iPhone Air', 'iphone-17-pro-max': 'iPhone 17 Pro Max'}


def ident(s):
    return ''.join(p.capitalize() for p in s.replace('-', ' ').split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--devices', required=True)
    ap.add_argument('--format', required=True, choices=['swift', 'kotlin', 'flutter', 'simctl', 'json'])
    a = ap.parse_args()
    d = json.load(open(os.path.join(HERE, 'devices.json')))
    al = d.get('aliases', {})
    ids = list(dict.fromkeys(al.get(x, x) for s in a.devices.split(',') if s for x in d['sets'].get(s, [s])))
    if a.format in ('swift', 'kotlin', 'flutter', 'simctl'):
        skipped = [i for i in ids if d['devices'][i].get('platform') in ('windows', 'macos')]
        if skipped:
            print(f'// skipped desktop profiles (browser renderer only): {", ".join(skipped)}')
        ids = [i for i in ids if i not in skipped]
    prof = {i: {'top': 0, 'bottom': 0, 'left': 0, 'right': 0, **d['devices'][i], **{'insets': {'top': 0, 'bottom': 0, 'left': 0, 'right': 0, **d['devices'][i].get('insets', {})}}} for i in ids}
    if a.format == 'json':
        print(json.dumps(prof, indent=1))
    elif a.format == 'swift':
        print('// import SnapshotTesting; import UIKit\nlet renderHarnessDevices: [String: ViewImageConfig] = [')
        for i, p in prof.items():
            n = p['insets']
            idiom = '.pad' if p.get('tablet') else '.phone'
            print(f'  "{i}": ViewImageConfig(safeArea: UIEdgeInsets(top: {n["top"]}, left: {n["left"]}, bottom: {n["bottom"]}, right: {n["right"]}), '
                  f'size: CGSize(width: {p["w"]}, height: {p["h"]}), traits: UITraitCollection(traitsFrom: [.init(userInterfaceIdiom: {idiom}), .init(displayScale: {p["scale"]})])),')
        print(']')
    elif a.format == 'kotlin':
        print('// import app.cash.paparazzi.DeviceConfig; import com.android.resources.*\nval renderHarnessDevices = mapOf(')
        for i, p in prof.items():
            dpi = int(round(p['scale'] * 160))
            print(f'  "{i}" to DeviceConfig.PIXEL_5.copy(screenWidth = {int(round(p["w"] * p["scale"]))}, screenHeight = {int(round(p["h"] * p["scale"]))}, xdpi = {dpi}, ydpi = {dpi}),  '
                  f'// {p["label"]}: {p["w"]}x{p["h"]}dp at {dpi}dpi; if layouts look scaled, also set density to the nearest Density bucket')
        print(')')
    elif a.format == 'flutter':
        print('// logical size, devicePixelRatio and padding (insets) per profile\nconst renderHarnessDevices = <String, Map<String, double>>{')
        for i, p in prof.items():
            n = p['insets']
            print(f"  '{i}': {{'w': {p['w']}, 'h': {p['h']}, 'dpr': {p['scale']}, 'top': {n['top']}, 'bottom': {n['bottom']}, 'left': {n['left']}, 'right': {n['right']}}},")
        print('};')
    elif a.format == 'simctl':
        for i, p in prof.items():
            print(f'{i}\t{SIMS.get(i, "(Android or custom: use an emulator AVD with " + str(p["w"]) + "x" + str(p["h"]) + "dp)")}\t{p["w"]}x{p["h"]}pt')


if __name__ == '__main__':
    main()
