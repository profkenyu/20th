#!/usr/bin/env python3

from __future__ import annotations

import math
from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
PDF = OUT / "TERRA_INCOGNITA_MISSION_EXHIBITION_PROPOSAL_KO.pdf"

W, H = landscape(A4)
M = 40
TOP = H - 38
BOTTOM = 36

BG = HexColor("#ffffff")
INK = HexColor("#14181b")
MUTED = HexColor("#59636b")
DIM = HexColor("#9aa3aa")
LINE = HexColor("#cbd1d5")
GRID = HexColor("#e6e9eb")
PANEL = HexColor("#f3f5f6")
PANEL_DARK = HexColor("#e7eaec")
RED = HexColor("#ad1730")
GREEN = HexColor("#126c50")
CYAN = HexColor("#2a6c7b")
AMBER = HexColor("#9b5f1d")

FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
pdfmetrics.registerFont(TTFont("KOR", FONT_PATH))


def width(text, font="KOR", size=9):
    return pdfmetrics.stringWidth(str(text), font, size)


def wrap(text, max_width, font="KOR", size=9):
    lines = []
    for paragraph in str(text).split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for token in paragraph.split(" "):
            trial = token if not current else f"{current} {token}"
            if width(trial, font, size) <= max_width:
                current = trial
                continue
            if current:
                lines.append(current)
                current = ""
            if width(token, font, size) <= max_width:
                current = token
                continue
            chunk = ""
            for glyph in token:
                if chunk and width(chunk + glyph, font, size) > max_width:
                    lines.append(chunk)
                    chunk = glyph
                else:
                    chunk += glyph
            current = chunk
        if current:
            lines.append(current)
    return lines


def para(c, text, x, y, max_width, size=9, leading=None, color=MUTED, max_lines=None, font="KOR"):
    leading = leading or size * 1.55
    lines = wrap(text, max_width, font, size)
    if max_lines is not None:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for item in lines:
        c.drawString(x, y, item)
        y -= leading
    return y


def caps(c, text, x, y, size=7, color=MUTED, tracking=0.9):
    c.setFont("Helvetica", size)
    c.setFillColor(color)
    cursor = x
    for glyph in text.upper():
        c.drawString(cursor, y, glyph)
        cursor += width(glyph, "Helvetica", size) + tracking


def rule(c, x1, y1, x2, y2, color=LINE, stroke=0.7, dash=None):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(stroke)
    if dash:
        c.setDash(dash)
    c.line(x1, y1, x2, y2)
    c.restoreState()


def arrow(c, x1, y1, x2, y2, color=RED, stroke=1.1, head=6):
    rule(c, x1, y1, x2, y2, color, stroke)
    angle = math.atan2(y2 - y1, x2 - x1)
    for delta in (-0.54, 0.54):
        c.line(x2, y2, x2 - math.cos(angle + delta) * head, y2 - math.sin(angle + delta) * head)


def box(c, x, y, w, h, fill=PANEL, stroke=LINE, radius=4):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def tag(c, text, x, y, fill=INK, text_color=BG, size=6.6, pad_x=7, h=18):
    w = width(text, "KOR", size) + pad_x * 2
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    c.setFont("KOR", size)
    c.setFillColor(text_color)
    c.drawCentredString(x + w / 2, y + 5.5, text)
    return w


def section(c, label, x, y, w, accent=RED):
    c.setFillColor(accent)
    c.rect(x, y - 2, 17, 1.4, fill=1, stroke=0)
    caps(c, label, x + 25, y - 5, 6.8, MUTED, 0.8)
    rule(c, x, y - 14, x + w, y - 14, LINE, 0.55)


def page_base(c, number, title, subtitle):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, H - 7, W, 7, fill=1, stroke=0)
    caps(c, "TERRA INCOGNITA / MISSION & EXHIBITION PROPOSAL", M, TOP, 6.3, MUTED, 0.7)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(RED)
    c.drawRightString(W - M, TOP, f"{number:02d} / 09")
    c.setFont("KOR", 21)
    c.setFillColor(INK)
    c.drawString(M, TOP - 34, title)
    para(c, subtitle, M, TOP - 54, W - M * 2, 8.2, 12, MUTED, max_lines=2)
    rule(c, M, TOP - 76, W - M, TOP - 76, LINE, 0.7)


def footer(c, number, note="CURRENT IMPLEMENTATION + CURATORIAL PROPOSAL / 2026.08.31"):
    rule(c, M, 29, W - M, 29, LINE, 0.55)
    caps(c, note, M, 16, 5.5, DIM, 0.55)
    c.setFont("Helvetica", 6)
    c.setFillColor(DIM)
    c.drawRightString(W - M, 16, f"TI.MX.{number:02d}")


def bullet(c, text, x, y, w, color=INK, bullet_color=RED, size=8.3, leading=12.2):
    c.setFillColor(bullet_color)
    c.circle(x + 2, y + 2.5, 1.7, fill=1, stroke=0)
    return para(c, text, x + 13, y, w - 13, size, leading, color)


def planet(c, cx, cy, r, color, ring=True):
    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(BG)
    c.setLineWidth(1.4)
    c.circle(cx, cy, r, fill=1, stroke=1)
    c.setStrokeColor(Color(color.red, color.green, color.blue, alpha=0.32))
    c.setLineWidth(0.7)
    c.circle(cx, cy, r * 0.66, fill=0, stroke=1)
    if ring:
        c.saveState()
        c.translate(cx, cy)
        c.rotate(-14)
        c.ellipse(-r * 1.45, -r * 0.34, r * 1.45, r * 0.34, fill=0, stroke=1)
        c.restoreState()
    c.restoreState()


def metric(c, value, label, x, y, w, accent=RED):
    box(c, x, y, w, 48, PANEL, LINE, 3)
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(accent)
    c.drawString(x + 10, y + 24, value)
    caps(c, label, x + 10, y + 9, 5.7, MUTED, 0.55)


def table_row(c, cols, widths, x, y, h, fill=None, colors=None, sizes=None):
    if fill:
        c.setFillColor(fill)
        c.rect(x, y, sum(widths), h, fill=1, stroke=0)
    xx = x
    for i, (text, colw) in enumerate(zip(cols, widths)):
        if i:
            rule(c, xx, y, xx, y + h, LINE, 0.4)
        c.setFont("KOR", (sizes or [7.2] * len(cols))[i])
        c.setFillColor((colors or [INK] * len(cols))[i])
        c.drawString(xx + 8, y + h / 2 - 2.5, text)
        xx += colw
    rule(c, x, y, x + sum(widths), y, LINE, 0.4)


def cover(c):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, 0, 11, H, fill=1, stroke=0)
    caps(c, "20TH SOLO EXHIBITION / KIM GUNWOO", M, H - 49, 6.7, MUTED, 0.85)
    c.setFont("Helvetica-Bold", 31)
    c.setFillColor(INK)
    c.drawString(M, H - 118, "TERRA INCOGNITA")
    c.setFont("KOR", 22)
    c.drawString(M, H - 154, "행성 임무 · 이동 UI · 전시 운영 제안서")
    para(c, "설계도 오프닝과 START 전이, 세 행성의 실제 해금 조건, 터치 단말의 저대역 탐사면을 기준으로 관객 경험과 전시 운영을 하나의 실행 문서로 정리한다.", M, H - 186, 420, 10, 16, MUTED, max_lines=3)
    y = 104
    tag(c, "WebGPU 실행 조건", M, y, RED)
    tag(c, "설계도 · START 의식", M + 121, y, INK)
    tag(c, "전시 실행안", M + 247, y, GREEN)
    caps(c, "MISSION CHAIN", W - 278, H - 66, 6.2, RED, 0.7)
    route_y = H - 202
    nodes = [
        (W - 236, route_y, 24, RED, "01", "MATERIAL", "4 + 2"),
        (W - 145, route_y - 73, 20, CYAN, "02", "WATER", "H2O"),
        (W - 230, route_y - 160, 26, GREEN, "03", "MEMORY", "3 / 3"),
    ]
    arrow(c, nodes[0][0] - 2, nodes[0][1] - 32, nodes[1][0] - 19, nodes[1][1] + 12, DIM, 0.8, 4)
    arrow(c, nodes[1][0] - 18, nodes[1][1] - 15, nodes[2][0] + 19, nodes[2][1] + 20, DIM, 0.8, 4)
    for cx, cy, r, color, no, name, value in nodes:
        planet(c, cx, cy, r, color)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(color)
        c.drawString(cx + r + 12, cy + 8, no)
        caps(c, name, cx + r + 12, cy - 4, 5.7, INK, 0.5)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(color)
        c.drawString(cx + r + 12, cy - 19, value)
    rule(c, W - 306, 78, W - M, 78, LINE, 0.55)
    para(c, "핵심 명제", W - 306, 61, 76, 7.2, 10, RED)
    para(c, "관측된 증거가 다음 세계의 조건이 된다.", W - 225, 61, 185, 8.6, 12.5, INK, max_lines=2)
    caps(c, "2026.09.01 / VERSION 1.2", M, 31, 5.8, DIM, 0.7)
    c.showPage()


def mission_map(c):
    page_base(c, 2, "현재 미션 구조", "본편은 행성을 자유 선택하는 게임 구조가 아니라, 앞선 관측이 다음 표면을 생성하는 단일 서사 루프다.")
    y = 317
    positions = [148, 421, 694]
    colors = [RED, CYAN, GREEN]
    data = [
        ("PLANET 01", "SHEAR WORLD", "구조 자원 4종 + 원료 2종", "6 / 6"),
        ("PLANET 02", "YARDANG FIELD", "수분 등가 신호 확인", "H₂O"),
        ("PLANET 03", "JOINTED GRANITE", "기억 교차 결절 고정", "3 / 3"),
    ]
    for i, (x, color, item) in enumerate(zip(positions, colors, data)):
        planet(c, x, y, 37, color)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(color)
        c.drawCentredString(x, y + 60, item[0])
        caps(c, item[1], x - 46, y - 63, 5.6, INK, 0.45)
        para(c, item[2], x - 78, y - 85, 156, 7.5, 11, MUTED, max_lines=2)
        c.setFont("KOR", 16)
        c.setFillColor(color)
        c.drawCentredString(x, y - 117, item[3])
        if i < 2:
            arrow(c, x + 54, y, positions[i + 1] - 54, y, DIM, 1, 5)
    gate_y = 408
    gate_w = 172
    for x, title, copy, accent in [
        (229, "GATE 01", "6개 서명 완료 + 착륙선 전 부품 면 상태 고정", RED),
        (502, "GATE 02", "H₂O CONFIRMED + 4.8초 확인 호흡", CYAN),
    ]:
        box(c, x, gate_y, gate_w, 54, BG, accent, 4)
        caps(c, title, x + 11, gate_y + 35, 6, accent, 0.6)
        para(c, copy, x + 11, gate_y + 18, gate_w - 22, 6.8, 9.5, INK, max_lines=2)
    section(c, "STATE CHAIN", M, 190, W - M * 2)
    chain = [
        ("INPUT", "접근·감속·정지"),
        ("MEASURE", "지속 관측"),
        ("STATE", "증거 확정"),
        ("DOCK", "로버 격납"),
        ("VOYAGE", "다음 표면 생성"),
    ]
    gap = 12
    cw = (W - M * 2 - gap * 4) / 5
    for i, (name, copy) in enumerate(chain):
        x = M + i * (cw + gap)
        box(c, x, 90, cw, 72, PANEL, LINE, 3)
        caps(c, name, x + 10, 139, 6.3, RED if i in (1, 2) else MUTED, 0.7)
        para(c, copy, x + 10, 119, cw - 20, 7.4, 11, INK, max_lines=2)
        if i < 4:
            arrow(c, x + cw + 2, 126, x + cw + gap - 2, 126, DIM, 0.7, 3)
    footer(c, 2, "CURRENT ROUTE / MATERIAL → WATER → GEOLOGICAL MEMORY")
    c.showPage()


def planet_01(c):
    page_base(c, 3, "PLANET 01 · SHEAR WORLD", "네 가지 구조 자원과 질소·알코올 원료를 여러 장소에서 발견해 착륙선을 하나의 완성 상태로 만든다.")
    mx = M
    for value, label, accent in [("18", "DISTRIBUTED FORMS", RED), ("≤ 2.0 m", "SCAN ENTRY", INK), ("≤ 0.12 m/s", "SPEED", INK), ("3.6 s", "STABLE HOLD", GREEN)]:
        metric(c, value, label, mx, 429, 150, accent)
        mx += 162
    section(c, "SIX REQUIRED SIGNATURES", M, 405, 480)
    tx, ty = M, 129
    widths = [36, 135, 145, 146]
    table_row(c, ["NO", "관측 서명", "적용 모듈", "역할"], widths, tx, ty + 225, 25, PANEL_DARK, [MUTED] * 4, [6.5] * 4)
    rows = [
        ("01", "FE–NI ALLOY", "FOUNDATION", "구조"),
        ("02", "SILICATE CERAMIC", "LOAD PATHS", "구조"),
        ("03", "CARBON COMPOSITE", "SERVICE / PRESSURE", "구조"),
        ("04", "CONDUCTIVE LATTICE", "TRANSFER / VISOR", "구조"),
        ("05", "N₂ FEEDSTOCK", "ATMOSPHERE BASE", "원료"),
        ("06", "ALCOHOL · C₂H₅OH", "CHEMICAL BASE", "원료"),
    ]
    for i, row in enumerate(rows):
        y = ty + 197 - i * 28
        fill = BG if i % 2 == 0 else PANEL
        color = RED if i < 4 else GREEN
        table_row(c, list(row), widths, tx, y, 28, fill, [color, INK, MUTED, color], [6.6, 7.2, 6.7, 6.7])
    rx = 555
    section(c, "MISSION LOGIC", rx, 405, W - M - rx)
    stages = [
        ("APPROACH", "아직 회수하지 않은 임의 후보의 2.0 m 이내 접근"),
        ("SETTLE", "절대 속도 0.12 m/s 이하 유지"),
        ("COMMIT", "3.6초 뒤 현재 항목을 상태에 기록"),
        ("FIX", "약 5.4초 시각 사건 종료 후 다음 항목 활성화"),
    ]
    yy = 349
    for i, (name, copy) in enumerate(stages):
        c.setFillColor(RED if i in (2, 3) else INK)
        c.circle(rx + 10, yy + 4, 5, fill=1, stroke=0)
        if i < len(stages) - 1:
            rule(c, rx + 10, yy - 10, rx + 10, yy - 40, LINE, 1)
        caps(c, name, rx + 28, yy + 8, 6, RED if i in (2, 3) else MUTED, 0.6)
        para(c, copy, rx + 28, yy - 8, W - M - rx - 28, 7.3, 10.5, INK, max_lines=2)
        yy -= 52
    box(c, rx, 79, W - M - rx, 86, BG, RED, 4)
    caps(c, "NEXT PLANET GATE", rx + 13, 142, 6.4, RED, 0.75)
    para(c, "SHELL 4/4 + RAW 2/2 + 착륙선 모든 부품이 SOLID", rx + 13, 120, W - M - rx - 26, 8.3, 12.5, INK, max_lines=2)
    para(c, "조건 충족 → 5.4초 완성 장면 → 자동 격납 → PLANET 02", rx + 13, 91, W - M - rx - 26, 7.2, 10.5, MUTED, max_lines=2)
    footer(c, 3, "PLANET 01 / FOUR STRUCTURES + TWO RAW MATERIALS")
    c.showPage()


def planet_02(c):
    page_base(c, 4, "PLANET 02 · YARDANG FIELD", "표면의 물 이미지를 찾는 것이 아니라, 서로 다른 측정 단서가 같은 수분 상태를 지시하는지 확인한다.")
    left_x, left_w = M, 420
    section(c, "WATER-EQUIVALENT EVIDENCE", left_x, 414, left_w)
    chart_x, chart_y, chart_w, chart_h = left_x, 197, left_w, 181
    box(c, chart_x, chart_y, chart_w, chart_h, PANEL, LINE, 3)
    base = chart_y + 56
    rule(c, chart_x + 28, base, chart_x + chart_w - 24, base, DIM, 0.8)
    bands = [(1.4, 0.44), (1.9, 0.69), (2.9, 0.9)]
    for value, pos in bands:
        x = chart_x + 36 + pos * (chart_w - 72)
        h = 74 if value == 1.9 else 47
        c.setStrokeColor(CYAN if value == 1.9 else MUTED)
        c.setLineWidth(4 if value == 1.9 else 2)
        c.line(x, base, x, base + h)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(INK)
        c.drawCentredString(x, base - 17, f"{value:.1f} μm")
    caps(c, "ABSORPTION BANDS", chart_x + 18, chart_y + chart_h - 24, 6.3, CYAN, 0.65)
    para(c, "1.9 μm 흡수대를 중심으로 1.4 / 2.9 μm 대역, –16 K 열 편차, 수화 규산염 암부를 함께 기록한다.", chart_x + 18, chart_y + chart_h - 48, chart_w - 36, 7.6, 11.5, INK, max_lines=4)
    metric(c, "3.8 m", "ACQUIRE RADIUS", left_x, 126, 128, CYAN)
    metric(c, "5.2 m", "CANCEL RADIUS", left_x + 140, 126, 128, INK)
    metric(c, "4.2 s", "INTEGRATION", left_x + 280, 126, 140, GREEN)
    right_x = 495
    section(c, "MISSION & TRANSFER", right_x, 414, W - M - right_x)
    items = [
        ("01", "후보 중심 3.8 m 이내로 접근한다."),
        ("02", "속도 0.12 m/s 이하에서 4.2초 머문다."),
        ("03", "스캔 중 5.2 m 밖으로 이탈하면 다시 시작한다."),
        ("04", "H₂O CONFIRMED를 임무 기억에 기록한다."),
    ]
    yy = 360
    for no, copy in items:
        c.setFont("Helvetica-Bold", 15)
        c.setFillColor(CYAN)
        c.drawString(right_x, yy, no)
        para(c, copy, right_x + 40, yy + 1, W - M - right_x - 40, 8, 12, INK, max_lines=2)
        rule(c, right_x + 40, yy - 14, W - M, yy - 14, GRID, 0.5)
        yy -= 52
    box(c, right_x, 92, W - M - right_x, 85, BG, CYAN, 4)
    caps(c, "NEXT PLANET GATE", right_x + 13, 152, 6.4, CYAN, 0.75)
    para(c, "H₂O CONFIRMED + 4.8초의 확인 호흡", right_x + 13, 131, W - M - right_x - 26, 8.8, 13, INK)
    para(c, "조건 충족 → 자동 격납 → PLANET 03. 자유 선택 입력은 잠긴다.", right_x + 13, 105, W - M - right_x - 26, 7.3, 10.5, MUTED, max_lines=2)
    footer(c, 4, "PLANET 02 / EVIDENCE, NOT A DECORATIVE WATER SURFACE")
    c.showPage()


def wave_field(c, x, y, w, h, mode, color):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(0.45)
    for row in range(18):
        path = c.beginPath()
        for col in range(70):
            xx = x + col / 69 * w
            base = y + (row + 0.5) / 18 * h
            a = math.sin(col * 0.22 + row * 0.78) * 4.3
            b = math.sin(col * 0.14 - row * 0.46) * 5.6
            yy = base + (a if mode == 0 else b if mode == 1 else a * b / 4.8)
            (path.moveTo if col == 0 else path.lineTo)(xx, yy)
        c.drawPath(path, fill=0, stroke=1)
    c.restoreState()


def planet_03(c):
    page_base(c, 5, "PLANET 03 · JOINTED GRANITE", "앞선 두 행성의 기록이 단순 보관되지 않고, 세 번째 지형의 좌표와 밀도를 생성하는 계산 입력이 된다.")
    section(c, "CROSS-PLANET MEMORY FIELD", M, 414, W - M * 2)
    gap = 14
    bw = (W - M * 2 - gap * 2) / 3
    labels = [
        ("01 MATERIAL PHASE", "6개 회수 물질 서명", RED),
        ("02 HYDRATION PHASE", "수분 흡수·열 기록", CYAN),
        ("03 PRODUCT FIELD", "위상 일치도", GREEN),
    ]
    for i, (name, copy, color) in enumerate(labels):
        x = M + i * (bw + gap)
        box(c, x, 230, bw, 150, BG, color, 3)
        wave_field(c, x + 10, 242, bw - 20, 90, i, Color(color.red, color.green, color.blue, alpha=0.65))
        caps(c, name, x + 10, 359, 5.8, color, 0.55)
        para(c, copy, x + 10, 342, bw - 20, 7.1, 10, INK, max_lines=1)
        if i < 2:
            c.setFont("Helvetica-Bold", 15)
            c.setFillColor(DIM)
            c.drawCentredString(x + bw + gap / 2, 298, "×" if i == 0 else "=")
    for nx, ny in [(0.24, 0.31), (0.66, 0.52), (0.42, 0.76)]:
        cx = M + 2 * (bw + gap) + 10 + nx * (bw - 20)
        cy = 242 + ny * 90
        c.setStrokeColor(RED)
        c.setLineWidth(0.8)
        c.circle(cx, cy, 5, fill=0, stroke=1)
    section(c, "THREE CONCORDANCE NODES", M, 202, 480)
    nodes = [
        ("01", "MATERIAL PHASE", "6개 물질 조화 정렬"),
        ("02", "HYDRATION PHASE", "1.9 μm 수분 위상 분해"),
        ("03", "CONCORDANCE", "두 기록의 교차점 고정"),
    ]
    for i, (no, name, copy) in enumerate(nodes):
        x = M + i * 154
        box(c, x, 87, 142, 86, PANEL, LINE, 3)
        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(GREEN)
        c.drawString(x + 10, 143, no)
        caps(c, name, x + 10, 126, 5.2, INK, 0.4)
        para(c, copy, x + 10, 108, 122, 6.9, 9.8, MUTED, max_lines=2)
    rx = 536
    box(c, rx, 87, W - M - rx, 86, BG, GREEN, 4)
    caps(c, "FINAL GATE", rx + 13, 147, 6.4, GREEN, 0.75)
    para(c, "각 결절 4.2 m 이내 · 0.12 m/s 이하 · 4.2초", rx + 13, 126, W - M - rx - 26, 8.1, 12, INK, max_lines=2)
    para(c, "3/3 완료 → 12초 기억 정렬·소멸 → 자동 초기화", rx + 13, 99, W - M - rx - 26, 7.2, 10.5, MUTED, max_lines=2)
    footer(c, 5, "PLANET 03 / PRIOR EVIDENCE BECOMES THE NEXT TOPOLOGY")
    c.showPage()


def ui_mock(c, x, y, w, h):
    c.setFillColor(HexColor("#121716"))
    c.setStrokeColor(INK)
    c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
    c.setFillColor(HexColor("#183129"))
    c.roundRect(x + w - 174, y + 14, 160, h - 28, 3, fill=1, stroke=0)
    caps(c, "MISSION RELAY", x + w - 160, y + h - 42, 5.8, HexColor("#8fe0b3"), 0.55)
    line_y = y + h - 76
    rule(c, x + w - 150, line_y, x + w - 38, line_y, HexColor("#5ca783"), 1)
    states = [
        (x + w - 146, RED, "P01", "ARCHIVED"),
        (x + w - 94, AMBER, "P02", "READY"),
        (x + w - 42, DIM, "P03", "LOCKED"),
    ]
    for cx, color, code, state in states:
        c.setFillColor(color)
        c.circle(cx, line_y, 5, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 5.7)
        c.setFillColor(HexColor("#d7eee2"))
        c.drawCentredString(cx, line_y - 18, code)
        c.setFont("Helvetica", 4.4)
        c.drawCentredString(cx, line_y - 28, state)
    c.setFillColor(HexColor("#85d8ad"))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + w - 160, y + 54, "H₂O CONFIRMED")
    c.setFont("KOR", 6.5)
    c.drawString(x + w - 160, y + 38, "NEXT BODY · AUTO 06")
    c.setStrokeColor(Color(0.6, 0.9, 0.7, alpha=0.18))
    for i in range(11):
        yy = y + 22 + i * 13
        c.line(x + 15, yy, x + w - 193, yy + math.sin(i) * 3)
    c.setFont("KOR", 7)
    c.setFillColor(HexColor("#8ba89a"))
    c.drawString(x + 18, y + 20, "관객의 시선은 지형과 로버에 남고, 이동 정보는 주변부에만 나타난다.")


def ui_proposal(c):
    page_base(c, 6, "현재 UI와 행성 전이 원칙", "현재 빌드는 HUD를 기본적으로 감추고, START와 임무 완료 때만 상태를 드러낸다. RELAY STRIP은 이 인과를 더 선명하게 하는 선택적 전시안이다.")
    section(c, "PUBLIC VIEW / OPTIONAL RELAY", M, 414, 470)
    ui_mock(c, M, 216, 470, 168)
    rx = 536
    section(c, "DESIGN RULES", rx, 414, W - M - rx)
    rules = [
        ("01", "기본 상태에서는 HUD를 숨기고, 가장자리 호출·H 입력에서만 유지한다."),
        ("02", "LOCKED / CURRENT / READY / ARCHIVED 네 상태만 사용한다."),
        ("03", "공개 모드에서는 이전·다음 행성 임의 이동을 금지한다."),
        ("04", "READY 뒤 자동 전이한다. 운영자 직접 이동은 maintenance 경로에만 남긴다."),
    ]
    yy = 363
    for no, copy in rules:
        c.setFont("Helvetica-Bold", 13)
        c.setFillColor(RED)
        c.drawString(rx, yy, no)
        para(c, copy, rx + 35, yy + 1, W - M - rx - 35, 7.6, 11, INK, max_lines=2)
        yy -= 46
    section(c, "TWO-LAYER CONTROL", M, 190, W - M * 2)
    half = (W - M * 2 - 16) / 2
    box(c, M, 77, half, 88, PANEL, LINE, 3)
    caps(c, "AUDIENCE LAYER", M + 12, 141, 6.3, GREEN, 0.7)
    para(c, "현재 행성, 완료 조건, 다음 행성 잠금 상태만 짧게 표시한다. 기본 전시는 자동 전이이며 입력이 없어도 전체 서사가 유지된다.", M + 12, 120, half - 24, 7.7, 11.5, INK, max_lines=4)
    box(c, M + half + 16, 77, half, 88, BG, RED, 3)
    caps(c, "OPERATOR LAYER", M + half + 28, 141, 6.3, RED, 0.7)
    para(c, "H 고정 HUD 또는 전용 maintenance URL에서만 P01/P02/P03 직접 이동을 허용한다. 미션·격납·비행 중에는 모든 점프를 비활성화한다.", M + half + 28, 120, half - 24, 7.7, 11.5, INK, max_lines=4)
    footer(c, 6, "UI PRINCIPLE / SHOW CAUSALITY, DO NOT TURN THE WORK INTO A MENU")
    c.showPage()


def concept(c):
    page_base(c, 7, "이 작품이 나타내고자 하는 것", "Terra Incognita의 탐사는 정복이나 수집이 아니라, 다음 세계를 가능하게 하는 증거의 보존과 전달이다. 시작의 설계도는 그 보존될 기계의 사전 기록이다.")
    c.setFont("KOR", 19)
    c.setFillColor(INK)
    c.drawString(M, 403, "“몸체는 이동하지만, 세계를 잇는 것은 관측된 상태다.”")
    para(c, "로버가 수집한 물질·수분·위상 정보는 UI의 점수가 아니라 착륙선의 구조, 다음 행성의 목적, 마지막 지질장의 좌표가 된다. 계산을 제거하면 세 행성의 관계도 사라진다.", M, 374, W - M * 2, 8.8, 13.5, MUTED, max_lines=3)
    section(c, "COMPLETE SYSTEM CHAIN", M, 324, W - M * 2)
    chain = [
        ("INPUT", "START·접근·정지"),
        ("MODEL", "지형·중력·스펙트럼"),
        ("STATE", "증거 원장"),
        ("MAPPING", "구조·좌표·지형"),
        ("EVENT", "격납·이동·소멸"),
    ]
    gap = 10
    cw = (W - M * 2 - gap * 4) / 5
    for i, (name, copy) in enumerate(chain):
        x = M + i * (cw + gap)
        box(c, x, 239, cw, 58, PANEL, LINE, 3)
        caps(c, name, x + 9, 277, 5.8, RED if i in (1, 2) else MUTED, 0.6)
        para(c, copy, x + 9, 258, cw - 18, 7.1, 10.5, INK, max_lines=2)
        if i < 4:
            arrow(c, x + cw + 1, 268, x + cw + gap - 1, 268, DIM, 0.7, 3)
    section(c, "SCIENTIFIC CLAIM LEVELS", M, 210, W - M * 2)
    gap = 14
    colw = (W - M * 2 - gap * 2) / 3
    claims = [
        ("A / SCIENTIFICALLY ACCURATE", RED, "유효 퍼텐셜의 극값과 각운동량 장벽, 바퀴 접지·경사·전력 수지, 수분 흡수대와 열 관성 단서."),
        ("B / NUMERICAL APPROXIMATION", CYAN, "퍼텐셜을 전시 가능한 높이장으로 확대하고, 연속장을 유한 격자·이산 관측 지점·실시간 GPU 계산으로 근사."),
        ("C / ARTISTIC INTERPRETATION", AMBER, "물질 서명이 착륙선을 복원하고, 행성 기록이 화강암 기억 결절과 행성 간 물질 전이로 재현되는 서사."),
    ]
    for i, (name, color, copy) in enumerate(claims):
        x = M + i * (colw + gap)
        box(c, x, 82, colw, 100, BG, color, 3)
        caps(c, name, x + 11, 158, 5.5, color, 0.45)
        para(c, copy, x + 11, 137, colw - 22, 7.2, 10.8, INK, max_lines=5)
    footer(c, 7, "SIGNATURE EVENT / THE OPERATED MACHINE BECOMES TRANSPORTED MASS")
    c.showPage()


def floor_plan(c, x, y, w, h):
    c.setFillColor(PANEL)
    c.setStrokeColor(LINE)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(INK)
    c.rect(x + w - 22, y + 32, 6, h - 64, fill=1, stroke=0)
    caps(c, "PROJECTION", x + w - 70, y + h - 24, 5.2, INK, 0.45)
    c.setFillColor(BG)
    c.setStrokeColor(DIM)
    c.roundRect(x + 20, y + h / 2 - 34, 56, 68, 4, fill=1, stroke=1)
    caps(c, "ENTRY", x + 31, y + h / 2 + 2, 5.4, RED, 0.5)
    c.setFillColor(RED)
    c.circle(x + 92, y + h / 2, 5, fill=1, stroke=0)
    para(c, "START", x + 82, y + h / 2 - 16, 40, 5.8, 7, MUTED)
    for row in range(3):
        for col in range(5):
            cx = x + 145 + col * 40
            cy = y + 38 + row * 42
            c.setFillColor(BG)
            c.circle(cx, cy, 3.3, fill=1, stroke=1)
    c.setStrokeColor(Color(0.68, 0.09, 0.18, alpha=0.38))
    c.setLineWidth(0.7)
    for origin in [(x + 92, y + h / 2), (x + 145, y + 80)]:
        c.line(origin[0], origin[1], x + w - 28, y + h / 2)
    caps(c, "DARK VIEWING FIELD / 2.5–5 m", x + 127, y + h - 22, 5.6, MUTED, 0.5)


def exhibition(c):
    page_base(c, 8, "권장 전시 방식", "하나의 큰 화면에서 설계도·START·세 행성이 시간적으로 이어지는 단일 채널 설치가 작품의 인과 구조를 가장 정확하게 보존한다.")
    section(c, "RECOMMENDED FLOOR PLAN", M, 414, 430)
    floor_plan(c, M, 217, 430, 167)
    rx = 505
    section(c, "PRIMARY FORMAT", rx, 414, W - M - rx)
    yy = 365
    recommendations = [
        ("SCREEN", "16:9 단일 프로젝션 또는 대형 LED · 관객 시야를 채우되 HUD 글자 판독 확보"),
        ("SPACE", "저조도·검은 벽·반사면 최소화 · 화면 앞 2.5–5 m 체류 구역"),
        ("INPUT", "START만 독립 페데스털에 노출 · 키보드와 운영 HUD는 숨김"),
        ("SOUND", "화면 전면 스테레오 · 낮은 음압 · 공간의 잔향보다 상태 변화가 들리게 설정"),
    ]
    for name, copy in recommendations:
        caps(c, name, rx, yy + 4, 6, RED, 0.6)
        para(c, copy, rx + 72, yy + 4, W - M - rx - 72, 7.4, 10.6, INK, max_lines=2)
        rule(c, rx, yy - 17, W - M, yy - 17, GRID, 0.45)
        yy -= 52
    section(c, "VIEWING RHYTHM", M, 190, W - M * 2)
    rhythm = [
        ("ENTRY", "노이즈·설계도", "기계의 기록을 먼저 읽는다"),
        ("GATE", "제목·START", "수동 시작 또는 8초 뒤 진입"),
        ("OBSERVER", "자율 항로", "먼저 지켜본다"),
        ("LOCK", "스캔·격납", "입력을 멈춘다"),
        ("AFTERMATH", "기억 소멸", "자동 초기화"),
    ]
    gap = 9
    cw = (W - M * 2 - gap * 4) / 5
    for i, (name, phase, copy) in enumerate(rhythm):
        x = M + i * (cw + gap)
        box(c, x, 86, cw, 78, BG, RED if i in (0, 3) else LINE, 3)
        caps(c, name, x + 9, 141, 5.7, RED if i in (0, 3) else MUTED, 0.55)
        para(c, phase, x + 9, 122, cw - 18, 7.4, 10.4, INK, max_lines=1)
        para(c, copy, x + 9, 104, cw - 18, 6.6, 9.5, MUTED, max_lines=2)
    footer(c, 8, "EXHIBITION / ONE CONTINUOUS IMAGE, ONE CAUSAL JOURNEY")
    c.showPage()


def priorities(c):
    page_base(c, 9, "기타 제안사항 · 실행 우선순위", "새로운 효과를 더하기보다 WebGPU 실행 조건, 미션의 인과, 운영 안정성, 관객의 읽기 속도를 먼저 정리하는 것이 중요하다.")
    section(c, "PRIORITY MATRIX", M, 414, W - M * 2)
    x, y = M, 190
    widths = [56, 152, 345, 207]
    table_row(c, ["우선", "항목", "실행", "판정 기준"], widths, x, y + 180, 28, PANEL_DARK, [MUTED] * 4, [6.5] * 4)
    rows = [
        ("P0", "실행 조건", "navigator.gpu·어댑터·WebGPU backend를 모두 확인하고 미지원 장비는 실행하지 않음", "WebGL 대체 실행을 허용하지 않음"),
        ("P0", "운영 복구", "장치 손실·오디오 중단·비정상 정지 뒤 자동 복귀", "무인 운영 가능"),
        ("P1", "공개 이동 규칙", "관객 UI는 상태만 표시하고 미션 전 임의 점프 금지", "서사 순서가 깨지지 않음"),
        ("P1", "전시 자막", "핵심 전이 문장만 한·영 유지, 설명문 남발 금지", "이미지가 텍스트에 종속되지 않음"),
        ("P2", "터치 단말", "START 뒤 저해상도 녹색 CRT 탐사면·30Hz 저대역 모드 유지", "저성능에서도 같은 임무 정체성 유지"),
        ("P2", "접근성", "reduced motion, 사운드 상태, 모바일 안전영역과 외부 링크 첫 진입 점검", "핵심 사건 동일 유지"),
    ]
    for i, row in enumerate(rows):
        fill = BG if i % 2 == 0 else PANEL
        colors = [RED if row[0] == "P0" else AMBER if row[0] == "P1" else GREEN, INK, MUTED, INK]
        table_row(c, list(row), widths, x, y + 150 - i * 30, 30, fill, colors, [7, 7.1, 6.9, 6.7])
    section(c, "FINAL CHECK", M, 165, W - M * 2)
    checks = [
        ("MISSION", "6/6 → H₂O → 3/3가 실제 빌드에서 끝까지 이어지는가"),
        ("OPENING", "수동 START는 3.6초 암전·수신기 복구를 거치고, 자동 진입은 8초 뒤 별도 경로를 유지하는가"),
        ("DISPLAY", "프로젝터에서 검은 레벨·와이어·면 재질이 구분되는가"),
        ("DEVICE", "외부 링크 첫 진입·새로고침·BFCache·iPhone/iPad·실제 WebGPU 화면을 각각 확인했는가"),
    ]
    half = (W - M * 2 - 16) / 2
    for i, (name, copy) in enumerate(checks):
        col = i % 2
        row = i // 2
        bx = M + col * (half + 16)
        by = 82 + (1 - row) * 34
        c.setFillColor(RED if i < 2 else GREEN)
        c.rect(bx, by + 4, 8, 8, fill=0, stroke=1)
        caps(c, name, bx + 20, by + 7, 5.8, RED if i < 2 else GREEN, 0.55)
        para(c, copy, bx + 91, by + 7, half - 91, 6.8, 9.5, INK, max_lines=2)
    footer(c, 9, "DECISION / PRESERVE THE CAUSAL LOOP, EXPOSE ONLY NECESSARY CONTROL")
    c.showPage()


PAGES = [cover, mission_map, planet_01, planet_02, planet_03, ui_proposal, concept, exhibition, priorities]


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF), pagesize=(W, H), pageCompression=1)
    c.setTitle("TERRA INCOGNITA - 행성 임무, 이동 UI, 전시 운영 제안서")
    c.setAuthor("Kim Gunwoo / 20th Solo Exhibition")
    c.setSubject("Mission gates, planetary transfer UI, curatorial statement and exhibition plan")
    for renderer in PAGES:
        renderer(c)
    c.save()
    print(PDF)


if __name__ == "__main__":
    build()
