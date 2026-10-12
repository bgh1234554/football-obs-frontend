"""브라우저 스크린샷에서 수평 연결부에 중간색 픽셀이 남는지 확인한다."""
import json
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2] / 'screenshots/tests/belarus-pixel-grid'
records = json.loads((root / 'measurements.json').read_text())
counts = {'before': 0, 'after': 0}
checks = 0
edge_checks = 0
edge_tints = {'before': 0, 'after': 0}
failures = []
for record in records:
    image = Image.open(root / record['file']).convert('RGB')
    for edge in record['edges']:
        x = max(0, min(image.width - 1, int(edge['sampleX'])))
        y = max(0, min(image.height - 1, int(edge['sampleY'])))
        r, g, b = image.getpixel((x, y))
        tint = (((r + g) / 2 - b) / 220.5 if edge['side'] == 'home'
                else (r - (g + b) / 2) / 255)
        edge_tints[record['mode']] += tint > .08
        if record['mode'] == 'after':
            edge_checks += 1
            if tint > .08:
                failures.append({'file': record['file'], 'edge': edge, 'rgb': [r, g, b]})
    for bend in record['bends']:
        x = max(0, min(image.width - 1, int(bend['sampleX'])))
        y = int(bend['sampleY'])
        samples = []
        for dy in [-2, -1, 0, 1]:
            if not 0 <= y + dy < image.height:
                continue
            r, g, b = image.getpixel((x, y + dy))
            coverage = (((r + g) / 2 - b) / 220.5 if bend['side'] == 'home'
                        else (r - (g + b) / 2) / 255)
            samples.append(max(0, min(1, coverage)))
        blended = sum(.08 < value < .92 for value in samples)
        counts[record['mode']] += blended
        if record['mode'] == 'after':
            checks += 1
            if blended:
                failures.append({'file': record['file'], 'bend': bend, 'samples': samples})
report = {'checked_corners': checks, 'blended_pixels': counts,
          'checked_edges': edge_checks, 'edge_tints': edge_tints, 'failures': failures}
(root / 'pixel-results.json').write_text(json.dumps(report, indent=2))
assert not failures, json.dumps(report, indent=2)
print(f"PASS {checks} rendered corners; blended pixels before={counts['before']}, after={counts['after']}")
print(f"PASS {edge_checks} top/bottom samples; team color leakage before={edge_tints['before']}, after={edge_tints['after']}")
