const ROWS = Object.freeze({
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "00100", "01000", "10000", "10000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]
});
const SEGMENTS = Object.freeze({
  "0": "abcedf",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgecd",
  "7": "abc",
  "8": "abcdefg",
  "9": "abfgcd"
});
export function installDotMatrixStyles() {
  if (document.getElementById("ti-dot-matrix-style")) return;
  const style = document.createElement("style");
  style.id = "ti-dot-matrix-style";
  style.textContent = `
.ti-dot-matrix {
  display: inline-flex;
  align-items: center;
  gap: var(--dot-character-gap,3px);
  color: var(--dot-colour,#85f2a8);
  line-height: 1;
}
.ti-dot-character {
  display: grid;
  grid-template-columns: repeat(5, var(--dot-size,2px));
  grid-template-rows: repeat(7, var(--dot-size,2px));
  gap: var(--dot-gap,1px);
}
.ti-dot-pixel {
  width: var(--dot-size,2px);
  height: var(--dot-size,2px);
  background: currentColor;
  opacity: var(--dot-off,.075);
}
.ti-dot-pixel.on {
  opacity: var(--dot-on,.92);
  box-shadow: 0 0 var(--dot-glow,3px) currentColor;
}
`;
  document.head.appendChild(style);
}
export function renderDotMatrix(element, text, { label = text } = {}) {
  if (!element) return;
  element.classList.add("ti-dot-matrix");
  const value = String(text ?? "").toUpperCase();
  if (element.dataset.dotValue === value) return;
  element.dataset.dotValue = value;
  element.setAttribute("aria-label", label);
  element.replaceChildren(...[...value].map((character) => {
    const glyph = ROWS[character] ?? ROWS[" "];
    const cell = document.createElement("i");
    cell.className = "ti-dot-character";
    cell.setAttribute("aria-hidden", "true");
    for (const row of glyph) for (const bit of row) {
      const pixel = document.createElement("b");
      pixel.className = bit === "1" ? "ti-dot-pixel on" : "ti-dot-pixel";
      cell.appendChild(pixel);
    }
    return cell;
  }));
}
export function drawDotMatrix(ctx, text, x, y, options = {}) {
  const dot = options.dot ?? 2;
  const gap = options.gap ?? 1;
  const characterGap = options.characterGap ?? dot + gap * 2;
  const step = dot + gap;
  const advance = step * 5 - gap + characterGap;
  const on = options.on ?? "rgba(139,255,169,.88)";
  const off = options.off ?? "rgba(76,218,115,.07)";
  for (const [characterIndex, character] of [...String(text ?? "").toUpperCase()].entries()) {
    const glyph = ROWS[character] ?? ROWS[" "];
    for (let row = 0; row < 7; row++) for (let column = 0; column < 5; column++) {
      ctx.fillStyle = glyph[row][column] === "1" ? on : off;
      ctx.fillRect(x + characterIndex * advance + column * step, y + row * step, dot, dot);
    }
  }
  return [...String(text ?? "")].length * advance - characterGap;
}
export function drawSevenSegment(ctx, text, x, y, options = {}) {
  const width = options.width ?? 17;
  const height = options.height ?? 30;
  const thickness = options.thickness ?? 3;
  const spacing = options.spacing ?? 5;
  const on = options.on ?? "rgba(211,255,220,.94)";
  const off = options.off ?? "rgba(76,218,115,.07)";
  const middle = (height - thickness) * 0.5;
  const segmentRects = {
    a: [thickness, 0, width - thickness * 2, thickness],
    b: [width - thickness, thickness, thickness, middle - thickness],
    c: [width - thickness, middle + thickness, thickness, middle - thickness],
    d: [thickness, height - thickness, width - thickness * 2, thickness],
    e: [0, middle + thickness, thickness, middle - thickness],
    f: [0, thickness, thickness, middle - thickness],
    g: [thickness, middle, width - thickness * 2, thickness]
  };
  let cursor = x;
  for (const character of String(text ?? "")) {
    if (character === "/") {
      ctx.fillStyle = on;
      ctx.save();
      ctx.translate(cursor + 9, y + 4);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, 0, thickness, height * 0.55);
      ctx.restore();
      cursor += 11 + spacing;
      continue;
    }
    const lit = SEGMENTS[character] ?? "";
    for (const [segment, rect] of Object.entries(segmentRects)) {
      ctx.fillStyle = lit.includes(segment) ? on : off;
      ctx.fillRect(cursor + rect[0], y + rect[1], rect[2], rect[3]);
    }
    cursor += width + spacing;
  }
  return cursor - x - spacing;
}
