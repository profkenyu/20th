#!/usr/bin/env python3
"""Create the A2 flat-exhibition prototype for TERRA INCOGNITA.

The drawings are vector diagrams derived from the actual simulation constants.
They are interpretive exhibition drawings, not fabrication blueprints.
"""

from __future__ import annotations

import math
from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A2
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
PANELS = OUT / "panels"
MASTER = OUT / "TERRA_INCOGNITA_A2_FLAT_EXHIBITION_PROTOTYPE.pdf"

W, H = A2
MM = 72 / 25.4
M = 24 * MM

BG = HexColor("#ffffff")
INK = HexColor("#171a1e")
MUTED = HexColor("#59616a")
DIM = HexColor("#9aa2aa")
GRID = Color(0.55, 0.58, 0.61, alpha=0.48)
CRIMSON = HexColor("#ad1630")
GRAPHITE = HexColor("#f0f2f4")
PANEL = HexColor("#e0e4e8")
GREEN = HexColor("#157a51")
AMBER = HexColor("#9b5e18")
CYAN = HexColor("#28758b")

FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
pdfmetrics.registerFont(TTFont("KOR", FONT_PATH))


def sw(text: str, font: str = "KOR", size: float = 10) -> float:
    return pdfmetrics.stringWidth(str(text), font, size)


def wrap(text: str, width: float, font: str = "KOR", size: float = 10) -> list[str]:
    lines: list[str] = []
    for source in str(text).split("\n"):
        if not source:
            lines.append("")
            continue
        current = ""
        for token in source.split(" "):
            trial = token if not current else current + " " + token
            if sw(trial, font, size) <= width:
                current = trial
            elif current:
                lines.append(current)
                current = token
            else:
                # Korean text can arrive without spaces; split by glyph.
                chunk = ""
                for glyph in token:
                    if sw(chunk + glyph, font, size) > width and chunk:
                        lines.append(chunk)
                        chunk = glyph
                    else:
                        chunk += glyph
                current = chunk
        if current:
            lines.append(current)
    return lines


def para(c, text, x, y, width, size=10, leading=None, color=MUTED, font="KOR", max_lines=None):
    leading = leading or size * 1.55
    lines = wrap(text, width, font, size)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def caps(c, text, x, y, size=8, color=MUTED, tracking=1.2):
    c.setFont("Helvetica", size)
    c.setFillColor(color)
    cursor = x
    for ch in text.upper():
        c.drawString(cursor, y, ch)
        cursor += sw(ch, "Helvetica", size) + tracking


def line(c, x1, y1, x2, y2, color=DIM, width=0.7, dash=None):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(width)
    if dash:
        c.setDash(dash)
    c.line(x1, y1, x2, y2)
    c.restoreState()


def grid(c, x, y, w, h, step=12 * MM):
    c.saveState()
    c.setStrokeColor(GRID)
    c.setLineWidth(0.3)
    px = x
    while px <= x + w + 0.1:
        c.line(px, y, px, y + h)
        px += step
    py = y
    while py <= y + h + 0.1:
        c.line(x, py, x + w, py)
        py += step
    c.restoreState()


def arrow(c, x1, y1, x2, y2, color=CRIMSON, width=1.2, head=5):
    line(c, x1, y1, x2, y2, color, width)
    a = math.atan2(y2 - y1, x2 - x1)
    for d in (-0.55, 0.55):
        c.line(x2, y2, x2 - math.cos(a + d) * head, y2 - math.sin(a + d) * head)


def dimline(c, x1, y1, x2, y2, label, offset=9, vertical=False):
    c.saveState()
    c.setStrokeColor(MUTED)
    c.setFillColor(MUTED)
    c.setLineWidth(0.55)
    c.setFont("Helvetica", 7)
    if vertical:
        xx = x1 + offset
        c.line(xx, y1, xx, y2)
        c.line(xx - 3, y1, xx + 3, y1)
        c.line(xx - 3, y2, xx + 3, y2)
        c.saveState()
        c.translate(xx + 3, (y1 + y2) / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, label)
        c.restoreState()
    else:
        yy = y1 + offset
        c.line(x1, yy, x2, yy)
        c.line(x1, yy - 3, x1, yy + 3)
        c.line(x2, yy - 3, x2, yy + 3)
        c.drawCentredString((x1 + x2) / 2, yy + 3, label)
    c.restoreState()


def callout(c, n, label, ax, ay, tx, ty, align="left"):
    c.saveState()
    c.setStrokeColor(CRIMSON)
    c.setFillColor(CRIMSON)
    c.setLineWidth(0.7)
    c.circle(ax, ay, 2.2, fill=1, stroke=0)
    elbow = tx - 7 if align == "left" else tx + 7
    c.line(ax, ay, elbow, ty + 2)
    c.line(elbow, ty + 2, tx, ty + 2)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(tx if align == "left" else tx - 12, ty + 5, f"{n:02d}")
    c.setFillColor(INK)
    c.setFont("KOR", 7.5)
    if align == "left":
        c.drawString(tx + 16, ty + 5, label)
    else:
        c.drawRightString(tx - 16, ty + 5, label)
    c.restoreState()


def header(c, no, title_ko, title_en, kicker):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(CRIMSON)
    c.rect(0, H - 8 * MM, W, 0.6, fill=1, stroke=0)
    caps(c, "TERRA INCOGNITA / 20TH SOLO EXHIBITION", M, H - M + 8, 7, MUTED, 1.05)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(CRIMSON)
    c.drawRightString(W - M, H - M + 8, f"PLATE {no:02d} / 08")
    c.setFont("KOR", 28)
    c.setFillColor(INK)
    c.drawString(M, H - M - 28, title_ko)
    caps(c, title_en, M, H - M - 48, 9, MUTED, 1.6)
    para(c, kicker, M, H - M - 72, W - 2 * M, 9, 14, MUTED, max_lines=2)
    line(c, M, H - M - 108, W - M, H - M - 108, DIM, 0.7)


def footer(c, no, note="EXHIBITION DIAGRAM DERIVED FROM THE COMPUTATIONAL MODEL / NOT A FABRICATION DRAWING"):
    line(c, M, M - 4, W - M, M - 4, DIM, 0.55)
    caps(c, note, M, M - 20, 6.5, DIM, 0.9)
    c.setFont("Helvetica", 7)
    c.setFillColor(DIM)
    c.drawRightString(W - M, M - 20, f"TI.A2.{no:02d} / 2026")


def section_label(c, text, x, y, width):
    c.setFillColor(CRIMSON)
    c.rect(x, y - 2, 16, 1.2, fill=1, stroke=0)
    caps(c, text, x + 24, y - 5, 7, MUTED, 1.1)
    line(c, x, y - 13, x + width, y - 13, GRID, 0.45)


def info_block(c, title, items, x, y, w, accent=CRIMSON):
    c.saveState()
    c.setStrokeColor(DIM)
    c.setFillColor(GRAPHITE)
    c.roundRect(x, y, w, 82, 2, fill=1, stroke=1)
    c.setFillColor(accent)
    c.rect(x, y + 80.8, w, 1.2, fill=1, stroke=0)
    caps(c, title, x + 10, y + 64, 7, accent, 1.0)
    yy = y + 46
    for key, value in items:
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(DIM)
        c.drawString(x + 10, yy, key.upper())
        c.setFont("KOR", 7.2)
        c.setFillColor(INK)
        c.drawRightString(x + w - 10, yy, value)
        yy -= 14
    c.restoreState()


def rover_diagram(c, x, y, w, h):
    grid(c, x, y, w, h, 18 * MM)
    cx, cy = x + w * 0.45, y + h * 0.59
    s = 88
    # Top view
    c.saveState()
    c.setStrokeColor(INK)
    c.setFillColor(PANEL)
    c.setLineWidth(1.1)
    body_w, body_l = 1.04 * s, 1.32 * s
    p = c.beginPath()
    p.moveTo(cx - body_w / 2, cy + body_l / 2)
    p.lineTo(cx + body_w / 2, cy + body_l / 2)
    p.lineTo(cx + body_w * 0.42, cy - body_l / 2)
    p.lineTo(cx - body_w * 0.42, cy - body_l / 2)
    p.close()
    c.drawPath(p, fill=1, stroke=1)
    # Solar lid
    c.setStrokeColor(CYAN)
    c.rect(cx - 0.50 * s, cy - 0.13 * s, 1.00 * s, 1.42 * s, fill=0, stroke=1)
    for i in range(1, 5):
        c.line(cx - 0.50 * s + i * 0.20 * s, cy - 0.13 * s,
               cx - 0.50 * s + i * 0.20 * s, cy + 1.29 * s)
    # Eight wheels, four axles
    for zz in (-0.98, -0.33, 0.33, 0.98):
        for xx in (-0.62, 0.62):
            c.setStrokeColor(INK)
            c.setFillColor(BG)
            c.roundRect(cx + xx * s - 0.095 * s, cy + zz * s - 0.29 * s,
                        0.19 * s, 0.58 * s, 3, fill=1, stroke=1)
            c.setStrokeColor(DIM)
            c.line(cx + xx * s, cy + zz * s - 0.25 * s,
                   cx + xx * s, cy + zz * s + 0.25 * s)
    # Mast and sensor head
    c.setStrokeColor(CRIMSON)
    c.circle(cx, cy - 0.36 * s, 0.12 * s, fill=0, stroke=1)
    c.line(cx, cy - 0.36 * s, cx + 0.24 * s, cy - 0.53 * s)
    c.circle(cx + 0.27 * s, cy - 0.55 * s, 0.06 * s, fill=0, stroke=1)
    c.restoreState()
    dimline(c, cx - 0.62 * s, cy - 1.40 * s, cx + 0.62 * s, cy - 1.40 * s, "TRACK 1.24 m", -8)
    dimline(c, cx + 0.85 * s, cy - 0.98 * s, cx + 0.85 * s, cy + 0.98 * s, "WHEELBASE 1.96 m", 10, True)
    callout(c, 1, "8륜 독립 접지", cx - 0.62 * s, cy - 0.33 * s, x + 16, y + h - 32)
    callout(c, 2, "태양 추적 배열", cx + 0.42 * s, cy + 0.82 * s, x + w - 14, y + h - 60, "right")
    callout(c, 3, "센서 크라운", cx + 0.26 * s, cy - 0.54 * s, x + w - 14, y + 46, "right")
    # Side inset
    bx, by, bw, bh = x + w * 0.08, y + 18, w * 0.70, h * 0.22
    line(c, bx, by, bx + bw, by, DIM, 0.5)
    c.setStrokeColor(INK)
    c.setFillColor(GRAPHITE)
    c.roundRect(bx + 62, by + 31, bw - 132, 34, 5, fill=1, stroke=1)
    for i in range(4):
        wx = bx + 82 + i * (bw - 172) / 3
        c.setFillColor(BG)
        c.circle(wx, by + 25, 17, fill=1, stroke=1)
        c.circle(wx, by + 25, 7, fill=0, stroke=1)
    c.setStrokeColor(CYAN)
    c.line(bx + 87, by + 70, bx + bw - 70, by + 92)
    c.line(bx + 87, by + 74, bx + bw - 70, by + 96)
    c.setStrokeColor(INK)
    c.line(bx + bw * 0.55, by + 65, bx + bw * 0.55, by + 113)
    c.rect(bx + bw * 0.55 - 13, by + 105, 30, 13, fill=0, stroke=1)
    caps(c, "SIDE ELEVATION", bx, by + bh - 3, 6, DIM, 0.8)


def panel_rover(c):
    header(c, 1, "로버 설계도", "ROVER SYSTEM BLUEPRINT", "지형은 이미지가 아니라 여덟 접촉점에 응답하는 물리적 조건이다.")
    top = H - M - 126
    rover_diagram(c, M, 278, W - 2 * M, top - 278)
    info_block(c, "GEOMETRY", [("WHEEL", "R 0.29 m / W 0.19 m"), ("BASE", "1.96 x 1.24 m"), ("STROKE", "+/- 0.24 m")], M, 150, (W - 2 * M - 18) / 2)
    info_block(c, "BEHAVIOR", [("CONTACT", "8 independent samples"), ("DRIVE", "traction + metric lapse"), ("POWER", "solar / load / lamps")], M + (W - 2 * M + 18) / 2, 150, (W - 2 * M - 18) / 2, CYAN)
    para(c, "바퀴 접지 높이, 경사, 서스펜션 충격과 전력이 하나의 연속된 상태로 연결된다. 로버는 지형 위의 장식이 아니라 지형을 읽는 측정 장치다.", M, 125, W - 2 * M, 9, 14, MUTED)
    footer(c, 1)


def lander_diagram(c, x, y, w, h):
    grid(c, x, y, w, h, 18 * MM)
    cx, ground = x + w * 0.50, y + h * 0.20
    s = 42
    # Front shield body
    c.saveState()
    c.setStrokeColor(INK)
    c.setFillColor(GRAPHITE)
    c.setLineWidth(1.15)
    p = c.beginPath()
    p.moveTo(cx - 3.3 * s, ground + 2.1 * s)
    p.lineTo(cx - 2.7 * s, ground + 4.8 * s)
    p.lineTo(cx - 1.5 * s, ground + 5.6 * s)
    p.lineTo(cx + 1.5 * s, ground + 5.6 * s)
    p.lineTo(cx + 2.7 * s, ground + 4.8 * s)
    p.lineTo(cx + 3.3 * s, ground + 2.1 * s)
    p.close()
    c.drawPath(p, fill=1, stroke=1)
    # Pressure hull facets
    for xx in (-2.7, -1.35, 0, 1.35, 2.7):
        line(c, cx, ground + 5.45 * s, cx + xx * s, ground + 2.15 * s, DIM, 0.6)
    # Service stage
    c.setFillColor(BG)
    c.ellipse(cx - 3.05 * s, ground + 1.55 * s, cx + 3.05 * s, ground + 2.55 * s, fill=1, stroke=1)
    c.setStrokeColor(AMBER)
    for xx in (-2.35, 2.35):
        c.rect(cx + xx * s - 18, ground + 1.80 * s, 36, 28, fill=0, stroke=1)
    # Six articulated legs visible as front projection
    for i in range(6):
        a = i * math.pi / 3
        fx = cx + math.cos(a) * 5.55 * s
        foreshorten = 0.48 + 0.52 * abs(math.cos(a))
        fy = ground + (1 - foreshorten) * 12
        sx = cx + math.cos(a) * 2.62 * s
        sy = ground + 2.24 * s
        ex = cx + math.cos(a) * 4.12 * s
        ey = ground + 1.35 * s
        c.setStrokeColor(INK)
        c.setLineWidth(3.0)
        c.line(sx, sy, ex, ey)
        c.setStrokeColor(MUTED)
        c.setLineWidth(2.1)
        c.line(ex, ey, fx, fy)
        c.setLineWidth(0.8)
        c.ellipse(fx - 0.70 * s, fy - 4, fx + 0.70 * s, fy + 4, fill=0, stroke=1)
    # Crown and blade
    c.setStrokeColor(INK)
    c.setFillColor(BG)
    c.ellipse(cx - 2.05 * s, ground + 5.45 * s, cx + 2.05 * s, ground + 5.90 * s, fill=1, stroke=1)
    c.rect(cx - 1.33 * s, ground + 6.20 * s, 2.65 * s, 0.18 * s, fill=0, stroke=1)
    c.line(cx, ground + 5.88 * s, cx, ground + 6.95 * s)
    # Open portal and ramp
    c.setFillColor(BG)
    c.setStrokeColor(CRIMSON)
    c.rect(cx - 1.50 * s, ground + 2.00 * s, 3.00 * s, 2.70 * s, fill=1, stroke=1)
    c.setStrokeColor(INK)
    c.setLineWidth(2)
    c.line(cx - 1.55 * s, ground + 2.0 * s, cx - 1.40 * s, ground)
    c.line(cx + 1.55 * s, ground + 2.0 * s, cx + 1.40 * s, ground)
    c.restoreState()
    dimline(c, cx - 5.55 * s, ground - 18, cx + 5.55 * s, ground - 18, "DEPLOYED FOOTPRINT 11.10 m", -4)
    dimline(c, cx + 5.75 * s, ground, cx + 5.75 * s, ground + 6.95 * s, "HEIGHT approx. 6.9 m", 10, True)
    callout(c, 1, "6개 관절식 하중 경로", cx - 4.1 * s, ground + 1.35 * s, x + 10, y + h - 35)
    callout(c, 2, "압력 선체 / 12면", cx + 2.5 * s, ground + 4.2 * s, x + w - 10, y + h - 58, "right")
    callout(c, 3, "로버 격납 포털", cx, ground + 3.3 * s, x + 10, y + 56)
    callout(c, 4, "센서 크라운", cx, ground + 6.5 * s, x + w - 10, y + 40, "right")


def panel_lander(c):
    header(c, 2, "착륙선 설계도", "LANDER RESTORATION BLUEPRINT", "여덟 물질 서명이 FOUNDATION에서 SIGNAL CORE까지 구조를 순차 복원한다.")
    lander_diagram(c, M, 288, W - 2 * M, H - M - 430)
    info_block(c, "ENVELOPE", [("STAGE", "diameter 6.10 m"), ("FOOTPRINT", "11.10 m"), ("RAMP", "3.14 x 4.90 m")], M, 154, (W - 2 * M - 18) / 2)
    info_block(c, "RESTORATION", [("KEYS", "8 material signatures"), ("LEGS", "alternating tripod"), ("PORTAL", "clear rover volume")], M + (W - 2 * M + 18) / 2, 154, (W - 2 * M - 18) / 2, AMBER)
    para(c, "FOUNDATION - LOAD PATHS - SERVICE CELLS - PRESSURE HULL - SENSOR VISOR - TRANSFER BRIDGE - SENSOR CROWN - SIGNAL CORE", M, 126, W - 2 * M, 8.2, 13, MUTED)
    footer(c, 2)


def potential(r, mass=20.0, ang=88.0):
    rc = max(r, 40.0)
    return -mass / rc + ang * ang / (2 * rc * rc) - mass * ang * ang / (rc ** 3)


def panel_planet_01(c):
    header(c, 3, "PLANET 01 · 전단 세계", "SHEAR WORLD / MATERIAL", "Schwarzschild 유효 퍼텐셜이 장벽, 골과 접근 불가능한 중심을 직접 생성한다.")
    x, y, w, h = M, 444, W - 2 * M, 360
    section_label(c, "EFFECTIVE POTENTIAL / RADIAL TOPOLOGY", x, y + h + 18, w)
    grid(c, x, y, w, h, 20 * MM)
    # Concentric topology map
    cx, cy, scale = x + w * 0.28, y + h * 0.48, 0.42
    for r, col, label in [(312.97, MUTED, "stable trough 312.97 m"), (74.23, CRIMSON, "barrier 74.23 m"), (60, AMBER, "photon sphere 60 m"), (40, INK, "horizon 40 m")]:
        c.setStrokeColor(col)
        c.setLineWidth(1.25 if r in (74.23, 40) else 0.65)
        c.circle(cx, cy, max(8, r * scale), fill=0, stroke=1)
        caps(c, label, cx - r * scale, cy + r * scale + 5, 5.5, col, 0.45)
    # Plot
    px, py, pw, ph = x + w * 0.56, y + 52, w * 0.40, h - 104
    line(c, px, py + ph * 0.50, px + pw, py + ph * 0.50, DIM, 0.5)
    line(c, px, py, px, py + ph, DIM, 0.5)
    path = c.beginPath()
    for i in range(220):
        r = 40 + i / 219 * 560
        v = potential(r)
        xx = px + i / 219 * pw
        yy = py + ph * (0.14 + (v + 0.5) / 0.56 * 0.72)
        (path.moveTo if i == 0 else path.lineTo)(xx, yy)
    c.setStrokeColor(CRIMSON)
    c.setLineWidth(1.4)
    c.drawPath(path, fill=0, stroke=1)
    caps(c, "V(r)", px + 4, py + ph - 8, 6, CRIMSON, 0.6)
    caps(c, "r 40 -> 600 m", px + pw - 82, py - 14, 6, DIM, 0.55)
    c.setFont("Helvetica", 9)
    c.setFillColor(INK)
    c.drawString(px, y + h - 18, "V(r) = -M/r + L^2/(2r^2) - ML^2/r^3")
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(px, y + h - 34, "M = 20 m   L = 88 m   r_s = 40 m   depth = 260 m")
    info_block(c, "ACCURATE", [("MODEL", "G = c = 1"), ("EXTREMA", "74.23 / 312.97 m"), ("FIELD", "divergence-free curl")], M, 292, (W - 2 * M - 18) / 2)
    info_block(c, "MISSION", [("EVIDENCE", "8 material signatures"), ("VEHICLE", "traction + lapse"), ("RESULT", "lander restoration")], M + (W - 2 * M + 18) / 2, 292, (W - 2 * M - 18) / 2, CRIMSON)
    para(c, "수치 근사: 유효 퍼텐셜을 2D 높이장으로 변환한다. 예술적 해석: 중력 장벽을 행성 지형과 물질 층리로 번역한다. 사건지평선 내부의 외부 관측자 물리는 주장하지 않는다.", M, 260, W - 2 * M, 9, 14, MUTED)
    footer(c, 3, "PLANET 01 / MATHEMATICS GENERATES THE ROUTE")


def panel_planet_02(c):
    header(c, 4, "PLANET 02 · 야르당 지대", "YARDANG FIELD / WATER-EQUIVALENT SIGNAL", "바람의 방향성이 지형을 조직하고, 단 하나의 수분 등가 신호가 임무를 결정한다.")
    x, y, w, h = M, 424, W - 2 * M, 380
    section_label(c, "DIRECTIONAL GEOLOGY / SINGLE OBJECTIVE", x, y + h + 18, w)
    grid(c, x, y, w, h, 20 * MM)
    # Directional yardang map
    mx, my, mw, mh = x + 18, y + 32, w * 0.58, h - 64
    c.saveState()
    c.rect(mx, my, mw, mh, fill=0, stroke=0)
    c.clipPath(c.beginPath(), stroke=0, fill=0) if False else None
    for i in range(32):
        yy = my + (i + 0.5) / 32 * mh
        phase = i * 0.77
        p = c.beginPath()
        for j in range(90):
            xx = mx + j / 89 * mw
            drift = math.sin(j * 0.18 + phase) * 6 + math.sin(j * 0.047 + phase * 1.3) * 11
            yv = yy + drift
            (p.moveTo if j == 0 else p.lineTo)(xx, yv)
        c.setStrokeColor(Color(0.36, 0.25, 0.18, alpha=0.60 if i % 3 else 0.9))
        c.setLineWidth(0.55 if i % 3 else 0.9)
        c.drawPath(p, fill=0, stroke=1)
    c.restoreState()
    arrow(c, mx + 22, my + mh - 20, mx + 132, my + mh - 5, AMBER, 1.4, 7)
    caps(c, "WIND 7.8 DEG EAST OF +X", mx + 18, my + mh - 38, 6, AMBER, 0.7)
    # Water lens
    sx, sy = mx + mw * 0.67, my + mh * 0.37
    for rr, col in [(15, Color(0.20, 0.35, 0.38, alpha=0.35)), (7.5, CYAN), (3.8, INK)]:
        c.setStrokeColor(col)
        c.setLineWidth(1.0)
        c.circle(sx, sy, rr * 2.1, fill=0, stroke=1)
    callout(c, 1, "수분 등가 신호 렌즈", sx, sy, mx + 8, my + 18)
    # Spectrum
    px = x + w * 0.66
    caps(c, "ABSORPTION BANDS", px, y + h - 36, 7, CYAN, 0.9)
    base = y + 126
    line(c, px, base, x + w - 22, base, DIM, 0.7)
    for val in (1.4, 1.9, 2.9):
        xx = px + (val - 1.0) / 2.2 * (w * 0.29)
        line(c, xx, base, xx, base + 132, CYAN if val == 1.9 else MUTED, 3.0 if val == 1.9 else 1.3)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(INK)
        c.drawCentredString(xx, base - 14, f"{val:.1f}")
    caps(c, "MICROMETRE", px, base - 34, 6, DIM, 0.7)
    para(c, "THERMAL DELTA -16 K\nHYDRATED SILICA DARKENING\nSUBSURFACE PORE ICE", px, base + 166, w * 0.29, 8, 14, MUTED)
    info_block(c, "ACCURATE CLAIM", [("TARGET", "water-equivalent H"), ("BANDS", "1.4 / 1.9 / 2.9 um"), ("SITE", "x 52 / z 428 m")], M, 282, (W - 2 * M - 18) / 2, CYAN)
    info_block(c, "NOT CLAIMED", [("SURFACE", "no liquid pool"), ("STATUS", "virtual mission evidence"), ("SCAN", "4.2 s integration")], M + (W - 2 * M + 18) / 2, 282, (W - 2 * M - 18) / 2, AMBER)
    para(c, "지형은 풍향을 공유하는 dune, yardang, sintered crust 계열로 생성된다. 수분 임무는 장식적 웅덩이가 아니라 열적 편차와 흡수 대역의 결합으로만 완료된다.", M, 250, W - 2 * M, 9, 14, MUTED)
    footer(c, 4, "PLANET 02 / ONE SIGNAL CHANGES THE MISSION")


def panel_planet_03(c):
    header(c, 5, "PLANET 03 · 화강암 기억장", "JOINTED GRANITE / GEOLOGICAL MEMORY", "PLANET 01의 물질 위상과 PLANET 02의 수분 위상이 곱해져 세 개의 기억 결절을 만든다.")
    x, y, w, h = M, 404, W - 2 * M, 400
    section_label(c, "CROSS-PLANET FIELD SYNTHESIS", x, y + h + 18, w)
    grid(c, x, y, w, h, 20 * MM)
    # Three fields: material x water = memory
    boxes = []
    gap = 18
    bw = (w - gap * 2) / 3
    for i in range(3):
        bx = x + i * (bw + gap)
        by = y + 68
        boxes.append((bx, by, bw, h - 118))
        c.setStrokeColor(DIM)
        c.rect(bx, by, bw, h - 118, fill=0, stroke=1)
    for idx, (bx, by, bw, bh) in enumerate(boxes):
        for k in range(24):
            p = c.beginPath()
            for j in range(70):
                xx = bx + j / 69 * bw
                if idx == 0:
                    yy = by + (k + 0.5) / 24 * bh + math.sin(j * 0.21 + k * 0.7) * 5
                    col = Color(0.55, 0.20, 0.24, alpha=0.62)
                elif idx == 1:
                    yy = by + (k + 0.5) / 24 * bh + math.sin(j * 0.13 - k * 0.45) * 8
                    col = Color(0.22, 0.48, 0.52, alpha=0.55)
                else:
                    yy = by + (k + 0.5) / 24 * bh + math.sin(j * 0.21 + k * 0.7) * math.sin(j * 0.13 - k * 0.45) * 12
                    col = Color(0.64, 0.66, 0.68, alpha=0.50)
                (p.moveTo if j == 0 else p.lineTo)(xx, yy)
            c.setStrokeColor(col)
            c.setLineWidth(0.55)
            c.drawPath(p, fill=0, stroke=1)
        caps(c, ["01 MATERIAL PHASE", "02 WATER PHASE", "03 PRODUCT FIELD"][idx], bx + 8, by + bh - 15, 6, [CRIMSON, CYAN, INK][idx], 0.7)
    # product operators
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(MUTED)
    c.drawCentredString(x + bw + gap / 2, y + h * 0.48, "x")
    c.drawCentredString(x + bw * 2 + gap * 1.5, y + h * 0.48, "=")
    # three memory nodes
    bx, by, bw, bh = boxes[2]
    for nx, ny in [(0.27, 0.31), (0.66, 0.52), (0.42, 0.77)]:
        for rr in (5, 11, 18):
            c.setStrokeColor(Color(0.75, 0.08, 0.16, alpha=0.75 / (rr / 5)))
            c.circle(bx + nx * bw, by + ny * bh, rr, fill=0, stroke=1)
    info_block(c, "SOURCE", [("PLANET 01", "8 material phases"), ("PLANET 02", "hydration spectrum"), ("MEMORY", "persistent mission ledger")], M, 272, (W - 2 * M - 18) / 2)
    info_block(c, "OUTPUT", [("NODES", "3 concordance sites"), ("GEOLOGY", "two joint families"), ("EVENT", "cross-planet alignment")], M + (W - 2 * M + 18) / 2, 272, (W - 2 * M - 18) / 2, GREEN)
    para(c, "과학적으로 정확한 부분은 위상장과 곱의 계산이다. 실시간 GPU 격자는 수치 근사다. 서로 다른 행성의 증거가 지질 기억으로 재출현한다는 서사는 예술적 해석이다.", M, 240, W - 2 * M, 9, 14, MUTED)
    footer(c, 5, "PLANET 03 / THE PRIOR WORLDS BECOME STRUCTURE")


def panel_engine(c):
    header(c, 6, "계산·게임 엔진 구조", "COMPUTATIONAL ENGINE / SYSTEM ARCHITECTURE", "입력, 수학, 시뮬레이션과 시각 출력은 분리된 효과가 아니라 하나의 상태 사슬이다.")
    x, y, w = M, 650, W - 2 * M
    section_label(c, "COMPLETE COMPUTATIONAL CHAIN", x, y + 58, w)
    labels = [
        ("INPUT", "touch / tilt / keys / idle"),
        ("MODEL", "metric / noise / spectra"),
        ("SIM", "WebGPU compute / CPU mirror"),
        ("STATE", "terrain / vehicle / memory"),
        ("OUTPUT", "TSL render / audio / captions"),
    ]
    gap = 10
    bw = (w - gap * 4) / 5
    for i, (a, b) in enumerate(labels):
        bx = x + i * (bw + gap)
        c.setFillColor(GRAPHITE)
        c.setStrokeColor(CRIMSON if i in (1, 2) else DIM)
        c.roundRect(bx, y, bw, 76, 3, fill=1, stroke=1)
        caps(c, a, bx + 9, y + 55, 7, CRIMSON if i in (1, 2) else MUTED, 0.8)
        para(c, b, bx + 9, y + 37, bw - 18, 7.2, 11, INK, max_lines=2)
        if i < 4:
            arrow(c, bx + bw + 2, y + 38, bx + bw + gap - 2, y + 38, DIM, 0.8, 3)
    # Architecture layers
    section_label(c, "RUNTIME LAYERS", x, 608, w)
    rows = [
        ("RENDER", "Three.js WebGPURenderer + TSL / WGSL", CRIMSON),
        ("SIMULATION", "heightfield, divergence-free field, wake, memory compute", INK),
        ("VEHICLE", "8-wheel contact, traction, power, docking, voyage", INK),
        ("AUDIO", "Web Audio pink bed + metric frequency ratio", CYAN),
        ("STATE", "mission ledger, kiosk reset, bfcache lifecycle", GREEN),
        ("BUILD", "esbuild / fonts / dependencies -> one offline HTML", AMBER),
    ]
    yy = 548
    for i, (label, desc, col) in enumerate(rows):
        c.setFillColor(GRAPHITE)
        c.setStrokeColor(DIM)
        c.rect(x, yy, w, 48, fill=1, stroke=1)
        c.setFillColor(col)
        c.rect(x, yy, 4, 48, fill=1, stroke=0)
        caps(c, label, x + 16, yy + 28, 7, col, 0.9)
        para(c, desc, x + 142, yy + 29, w - 160, 8, 12, INK, max_lines=1)
        yy -= 55
    # Tiers
    section_label(c, "ADAPTIVE QUALITY / SAME CONCEPT", x, 198, w)
    tier_w = (w - 24) / 3
    tier_data = [
        ("HIGH", "640^2 terrain\n746,900 filaments\nDPR <= 1.5"),
        ("MID", "480^2 terrain\n343,489 filaments\nDPR <= 1.0"),
        ("LOW", "320^2 terrain\n120,323 filaments\nDPR <= 0.75"),
    ]
    for i, (name, desc) in enumerate(tier_data):
        bx = x + i * (tier_w + 12)
        c.setFillColor(GRAPHITE)
        c.setStrokeColor(DIM)
        c.roundRect(bx, 92, tier_w, 84, 3, fill=1, stroke=1)
        caps(c, name, bx + 12, 151, 8, CRIMSON if i == 0 else MUTED, 1.1)
        para(c, desc, bx + 12, 132, tier_w - 24, 7.5, 13, INK)
    footer(c, 6, "ENGINE / REDUCE LUXURY BEFORE STRUCTURAL MEANING")


def control_key(c, key, label, x, y, w=52):
    c.setFillColor(GRAPHITE)
    c.setStrokeColor(DIM)
    c.roundRect(x, y, w, 28, 3, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(x + w / 2, y + 10, key)
    para(c, label, x + w + 12, y + 10, 150, 8, 11, MUTED, max_lines=1)


def panel_guide(c):
    header(c, 7, "관람법·조작 가이드", "VIEWING / INTERACTION GUIDE", "기본 관람은 OBSERVER다. 직접 조작은 시스템을 잠시 교란한 뒤 자율 임무로 되돌아간다.")
    x, w = M, W - 2 * M
    # Start timeline
    section_label(c, "BEGIN", x, 710, w)
    ty = 665
    line(c, x + 16, ty, x + w - 16, ty, DIM, 1)
    events = [(0, "TEXT"), (1.6, "START ENABLED"), (4.2, "ROVER ASSEMBLY"), (7.2, "AUTO RELEASE")]
    for t, lab in events:
        xx = x + 16 + t / 7.2 * (w - 32)
        c.setFillColor(CRIMSON if t in (1.6, 7.2) else INK)
        c.circle(xx, ty, 4, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(xx, ty - 18, f"{t:.1f}s")
        caps(c, lab, xx - sw(lab, "Helvetica", 5.5) / 2, ty + 13, 5.5, MUTED, 0.3)
    # Observer/explorer
    section_label(c, "TWO MODES", x, 604, w)
    half = (w - 16) / 2
    for i, (title, copy, accent) in enumerate([
        ("OBSERVER", "자율 임무와 연출된 카메라. 권장 관람 모드.", CRIMSON),
        ("EXPLORER", "직접 조향. 12초 무입력 뒤 OBSERVER 복귀.", INK),
    ]):
        bx = x + i * (half + 16)
        c.setFillColor(GRAPHITE)
        c.setStrokeColor(accent)
        c.roundRect(bx, 522, half, 68, 3, fill=1, stroke=1)
        caps(c, title, bx + 12, 566, 8, accent, 1.2)
        para(c, copy, bx + 12, 547, half - 24, 8, 12, INK, max_lines=2)
    # Desktop/mobile
    section_label(c, "DESKTOP", x, 484, half)
    section_label(c, "MOBILE", x + half + 16, 484, half)
    ky = 430
    keys = [
        ("WASD", "주행 / 조향"),
        ("SHIFT", "고속 주행"),
        ("SPACE", "자율 임무 복귀"),
        ("C L H M", "카메라 / 조명 / HUD / 사운드"),
    ]
    for key, label in keys:
        control_key(c, key, label, x, ky, 54)
        ky -= 42
    mx = x + half + 16
    mobile = [
        ("TILT", "기울기 조향 / 권한 선택"),
        ("DRAG", "좌우 드래그 대체 조향"),
        ("TAP", "OBSERVER / EXPLORER"),
        ("SOUND", "START / ON / RESUME / OFF"),
    ]
    ky = 430
    for key, label in mobile:
        control_key(c, key, label, mx, ky, 58)
        ky -= 42
    # What to watch
    section_label(c, "WHAT TO WATCH", x, 266, w)
    observations = [
        ("01", "PLANET 01", "8개 물질 서명과 착륙선의 순차 복원"),
        ("02", "PLANET 02", "표면 웅덩이가 아닌 수분 등가 관측 신호"),
        ("03", "PLANET 03", "앞선 두 기록이 세 기억 결절로 재출현"),
    ]
    oy = 210
    for no, name, copy in observations:
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(CRIMSON)
        c.drawString(x, oy, no)
        caps(c, name, x + 48, oy + 5, 7, INK, 0.8)
        para(c, copy, x + 48, oy - 13, w - 48, 8, 12, MUTED, max_lines=1)
        oy -= 50
    footer(c, 7, "VIEWING GUIDE / OBSERVE FIRST, PERTURB SECOND")


def panel_technical(c):
    header(c, 8, "기술설명서", "TECHNICAL NOTES / SCIENCE - APPROXIMATION - INTERPRETATION", "과학적 모델, 실시간 근사와 예술적 번역을 동일한 주장으로 섞지 않는다.")
    x, w = M, W - 2 * M
    section_label(c, "THREE LEVELS OF CLAIM", x, 716, w)
    gap = 14
    colw = (w - gap * 2) / 3
    claims = [
        ("A / ACCURATE", CRIMSON, [
            "Schwarzschild effective potential",
            "circular-orbit extrema",
            "ballistic dust at 3.71 m/s^2",
            "absorption-band evidence model",
        ]),
        ("B / APPROXIMATION", CYAN, [
            "finite WebGPU heightfield",
            "CPU/GPU mirrored contact model",
            "finite memory-field resolution",
            "adaptive DPR and LOD",
        ]),
        ("C / INTERPRETATION", AMBER, [
            "potential becomes terrain",
            "signals restore architecture",
            "cross-planet evidence becomes memory",
            "frequency shift becomes score",
        ]),
    ]
    for i, (name, color, lines_) in enumerate(claims):
        bx = x + i * (colw + gap)
        c.setFillColor(GRAPHITE)
        c.setStrokeColor(color)
        c.roundRect(bx, 534, colw, 162, 3, fill=1, stroke=1)
        caps(c, name, bx + 12, 670, 7, color, 0.8)
        yy = 638
        for item in lines_:
            c.setFillColor(color)
            c.circle(bx + 14, yy + 2, 1.8, fill=1, stroke=0)
            yy = para(c, item, bx + 25, yy, colw - 36, 7.3, 18, INK, max_lines=2) - 3
    # Equations
    section_label(c, "STRUCTURAL EQUATIONS", x, 500, w)
    equations = [
        ("TERRAIN", "V(r) = -M/r + L^2/(2r^2) - ML^2/r^3"),
        ("REDSHIFT", "nu_o/nu_e = sqrt(1-rs/re) / sqrt(1-rs/ro)"),
        ("POWER", "solar incidence - electronics - drive - lamps"),
        ("MEMORY", "F_memory(x,z) = F_material(x,z) x F_water(x,z)"),
    ]
    ey = 448
    for label, eq in equations:
        caps(c, label, x, ey + 5, 6, DIM, 0.65)
        c.setFont("Helvetica", 9)
        c.setFillColor(INK)
        c.drawString(x + 116, ey + 4, eq)
        line(c, x, ey - 10, x + w, ey - 10, GRID, 0.4)
        ey -= 44
    # Stack and deployment
    section_label(c, "STACK / DEPLOYMENT", x, 296, w)
    tech = [
        ("RENDER", "Three.js 0.185.1 / WebGPURenderer / TSL"),
        ("MOTION", "Anime.js 4.5.0 / authored timelines"),
        ("AUDIO", "Web Audio / iOS resume + playback session"),
        ("FORMAT", "ES2022 / offline single HTML / embedded fonts"),
        ("RECOVERY", "watchdog / device-loss retry / bfcache lifecycle"),
    ]
    yy = 250
    for k, v in tech:
        caps(c, k, x, yy, 6.5, CRIMSON, 0.7)
        para(c, v, x + 112, yy, w - 112, 8, 12, INK, max_lines=1)
        yy -= 28
    c.setFillColor(GRAPHITE)
    c.setStrokeColor(DIM)
    c.roundRect(x, 78, w, 46, 3, fill=1, stroke=1)
    para(c, "전시 배포본은 외부 네트워크 없이 실행된다. 실제 WebGPU 장치 한계와 storage/compute 기능을 검사하며, 개념이 성립하지 않는 WebGL 자동 폴백은 사용하지 않는다.", x + 12, 103, w - 24, 8, 12, MUTED, max_lines=2)
    footer(c, 8, "TECHNICAL NOTES / PRECISION OVER DECORATION")


PAGES = [
    ("01_ROVER_BLUEPRINT.pdf", panel_rover),
    ("02_LANDER_BLUEPRINT.pdf", panel_lander),
    ("03_PLANET_01_SHEAR_WORLD.pdf", panel_planet_01),
    ("04_PLANET_02_YARDANG_FIELD.pdf", panel_planet_02),
    ("05_PLANET_03_GEOLOGICAL_MEMORY.pdf", panel_planet_03),
    ("06_COMPUTATIONAL_ENGINE.pdf", panel_engine),
    ("07_VIEWING_INTERACTION_GUIDE.pdf", panel_guide),
    ("08_TECHNICAL_NOTES.pdf", panel_technical),
]


def build_master():
    OUT.mkdir(parents=True, exist_ok=True)
    PANELS.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(MASTER), pagesize=A2, pageCompression=1)
    c.setTitle("TERRA INCOGNITA - A2 Flat Exhibition Prototype")
    c.setAuthor("Kim Gunwoo / 20th Solo Exhibition")
    for _, renderer in PAGES:
        renderer(c)
        c.showPage()
    c.save()


def split_pages():
    reader = PdfReader(str(MASTER))
    if len(reader.pages) != len(PAGES):
        raise RuntimeError(f"expected {len(PAGES)} pages, got {len(reader.pages)}")
    for page, (filename, _) in zip(reader.pages, PAGES):
        writer = PdfWriter()
        writer.add_page(page)
        writer.add_metadata({"/Title": filename.replace("_", " ").removesuffix(".pdf")})
        with (PANELS / filename).open("wb") as fh:
            writer.write(fh)


if __name__ == "__main__":
    build_master()
    split_pages()
    print(MASTER)
    for filename, _ in PAGES:
        print(PANELS / filename)
