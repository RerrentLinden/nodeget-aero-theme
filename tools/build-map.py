#!/usr/bin/env python3
"""把国家边界的 GeoJSON 简化成主题用的 map.json（等距圆柱投影，整数坐标，相对路径）。

数据用 Natural Earth 的 1:50m 国家边界（公有领域）：
  https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson

用法: python3 tools/build-map.py ne_50m_admin_0_countries.geojson src/map.json [epsilon] [min_area]"""
import json, sys

SRC, OUT = sys.argv[1], sys.argv[2]
EPS = float(sys.argv[3]) if len(sys.argv) > 3 else 9.0     # 单位：0.1 px（画布 10000 宽）
MIN_AREA = float(sys.argv[4]) if len(sys.argv) > 4 else 260.0
LAT_TOP, LAT_BOT, W = 84.0, -58.0, 10000.0
K = W / 360.0
H = round((LAT_TOP - LAT_BOT) * K)

def proj(lng, lat):
    lat = max(LAT_BOT, min(LAT_TOP, lat))
    return ((lng + 180.0) * K, (LAT_TOP - lat) * K)

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = (dx * dx + dy * dy) ** 0.5 or 1e-9
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L
            if d > best:
                best, idx = d, i
        if best > eps and idx > 0:
            keep[idx] = True
            stack.append((a, idx)); stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]

def area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

geo = json.load(open(SRC, encoding='utf-8'))
paths, cents, npts = {}, {}, 0
for n, f in enumerate(geo['features']):
    pr = f['properties']
    # 两位地区码：Natural Earth 用 ISO_A2_EH；没有码的小块也画出来，只是不会被点亮
    code = next((c.upper() for c in (pr.get('ISO_A2_EH'), pr.get('ISO_A2'), pr.get('name')) if isinstance(c, str) and len(c) == 2 and c.isalpha()), '_%d' % n)
    g = f['geometry']
    if not g or code == 'AQ':
        continue
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    rings = [[proj(x, y) for x, y in poly[0]] for poly in polys if poly and poly[0]]
    if not rings:
        continue
    big = max(rings, key=area)
    xs = [p[0] for p in big]; ys = [p[1] for p in big]
    cents[code] = [round((min(xs) + max(xs)) / 2), round((min(ys) + max(ys)) / 2)]
    d = []
    for r in rings:
        if area(r) < MIN_AREA:
            continue
        s = rdp(r[:-1] if r[0] == r[-1] else r, EPS)
        q = []
        for x, y in s:
            p = (round(x), round(y))
            if not q or q[-1] != p:
                q.append(p)
        if len(q) > 1 and q[0] == q[-1]:
            q.pop()
        if len(q) < 3:
            continue
        npts += len(q)
        seg = 'M%d %d' % q[0] + 'l' + ' '.join('%d %d' % (q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]) for i in range(1, len(q))) + 'z'
        d.append(seg.replace(' -', '-'))
    if d:
        paths[code] = ''.join(d)

out = {'w': int(W), 'h': H, 'p': paths, 'c': cents}
json.dump(out, open(OUT, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=True)
print('countries with shape', len(paths), 'centroids', len(cents), 'points', npts, 'bytes', len(json.dumps(out, separators=(',', ':'))))
