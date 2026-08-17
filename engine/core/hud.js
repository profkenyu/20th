/**
 * HUD — an instrument panel, not a UI.
 *
 * It owns its own markup and styles so the shell document stays empty and the
 * single-file build has one thing to inline. Crimson is reserved for state
 * signals: the eyebrow, the frame-time trace, the recentre pulse. Nothing
 * decorative is coloured.
 */

const CSS = `
#fh-hud{
  position:fixed;z-index:30;top:calc(var(--frame-top) + 24px);left:24px;width:272px;
  pointer-events:none;   /* the panel is read-only — it must never eat a drag */
  font-family:'DM Mono',ui-monospace,monospace;font-size:10px;line-height:1.55;
  letter-spacing:.06em;color:#8a9099;transition:opacity .45s ease;
}
#fh-hud.hidden{opacity:0;pointer-events:none}
#fh-mission{
  position:fixed;z-index:30;top:calc(var(--frame-top) + 22px);left:24px;width:240px;
  pointer-events:none;font-family:'DM Mono',ui-monospace,monospace;text-transform:uppercase;
  color:#e3e5e8;border-left:1px solid rgba(192,21,42,.64);padding:3px 8px 3px 11px;
  background:linear-gradient(90deg,rgba(5,5,6,.42),rgba(5,5,6,.08) 82%,transparent);
  text-shadow:0 1px 10px rgba(0,0,0,.72);transition:opacity .8s ease;
}
#fh-mission span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#fh-mission .experience{margin-bottom:4px;font:500 7px/1.45 'DM Mono',ui-monospace,monospace;
  letter-spacing:.19em;color:rgba(158,164,173,.72);transition:color .8s ease,letter-spacing .8s ease}
#fh-mission .body{font:700 9px/1.5 'Space Mono',ui-monospace,monospace;letter-spacing:.22em;color:#c0152a}
#fh-mission .objective{margin-top:4px;font-size:8px;line-height:1.55;letter-spacing:.11em;color:rgba(229,232,235,.86)}
#fh-mission .systems{font-size:7px;line-height:1.65;letter-spacing:.10em;color:rgba(158,164,173,.72)}
body.fh-dead #fh-mission{opacity:.32}
body.ti-observer #fh-mission{opacity:.82}
body.ti-explorer #fh-mission{opacity:1;border-left-color:rgba(192,21,42,.82)}
body.ti-explorer #fh-mission .experience{color:rgba(217,221,226,.78);letter-spacing:.24em}
body.ti-completion-tableau #fh-mission,body.ti-memory-tableau #fh-mission,
body.ti-epilogue #fh-mission{opacity:0}
body.fh-dead #fh-hud{opacity:.28}
body.fh-dead #fh-keys{opacity:.25}
body.ti-explorer #fh-keys{opacity:.76;transition-duration:.6s}
body.tx-active #fh-keys{opacity:0}
#fh-hud .eyebrow{font-family:'Space Mono',ui-monospace,monospace;font-weight:700;
  font-size:9px;letter-spacing:.26em;color:#c0152a;text-transform:uppercase}
#fh-hud .rule{height:1px;background:rgba(138,144,153,.16);margin:9px 0 12px}
#fh-hud .g{margin-bottom:14px}
#fh-hud .gt{color:#4a4f57;font-size:9px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:5px}
#fh-hud .kv{display:flex;justify-content:space-between;gap:10px;white-space:nowrap}
#fh-hud .k{color:#4a4f57;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
#fh-hud .v{color:#d9dde2;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}
#fh-hud .v.m{font-family:'Space Mono',ui-monospace,monospace}
#fh-hud .v.warn{color:#c0152a}
#fh-spark{display:block;width:272px;height:32px;margin:1px 0 12px;opacity:.92}
#fh-pulse{display:inline-block;width:6px;height:6px;background:#2a2d33;margin-left:7px;
  vertical-align:1px;transition:background .06s linear}
#fh-pulse.on{background:#c0152a}
#fh-keys{position:fixed;z-index:30;left:24px;bottom:calc(var(--frame-bottom) + 24px);pointer-events:none;
  padding:7px 10px 6px;border-left:1px solid rgba(217,221,226,.13);
  background:linear-gradient(90deg,rgba(5,5,6,.38),rgba(5,5,6,0));
  font-family:'DM Mono','Noto Sans KR',ui-monospace,monospace;font-size:8px;letter-spacing:.10em;
  color:rgba(138,144,153,.54);line-height:1.8;opacity:0;transition:opacity 1.6s ease}
#fh-keys.awake{opacity:.72;transition-duration:.22s}
#fh-keys b{font-weight:500;color:rgba(217,221,226,.68);letter-spacing:.08em}
#fh-keys .mode{display:inline-block;width:34px;color:rgba(192,21,42,.72);letter-spacing:.16em}
@media (max-width:760px){
  #fh-hud{width:206px;left:14px;top:calc(var(--frame-top) + 14px)}
  #fh-mission{width:184px;left:14px;top:calc(var(--frame-top) + 14px);padding-left:9px}
  #fh-spark{width:206px}
  #fh-keys{left:14px;right:14px;bottom:calc(var(--frame-bottom) + 12px);font-size:7px;letter-spacing:.06em}
}
`;

/* The engine has no opinion about what a work measures. `new Hud(rows)`
   takes [[groupTitle, [[key, label], …]], …]. */

export class Hud {
  /** `pulseField` is the row the recentre indicator attaches to. The engine
      must not assume a work measures anything in particular, so a missing
      field is not an error — the pulse simply has nowhere to sit. */
  constructor(rows = [], pulseField = 'recentre', { diagnostic = false } = {}) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.id = 'fh-hud';
    el.innerHTML = `
      <div class="eyebrow">Terra Incognita</div>
      <div class="rule"></div>
      ${diagnostic ? `<div class="g">
        <div class="gt">Frame</div>
        <canvas id="fh-spark" width="544" height="64"></canvas>
        <div class="kv"><span class="k">fps</span><span class="v m" data-v="fps">—</span></div>
        <div class="kv"><span class="k">cpu frame</span><span class="v" data-v="cpu">—</span></div>
        <div class="kv"><span class="k">gpu compute</span><span class="v" data-v="gc">—</span></div>
        <div class="kv"><span class="k">gpu render</span><span class="v" data-v="gr">—</span></div>
      </div>` : ''}
      ${rows.map(([title, rows]) => `
        <div class="g">
          <div class="gt">${title}</div>
          ${rows.map(([id, label]) =>
            `<div class="kv"><span class="k">${label}</span><span class="v" data-v="${id}">—</span></div>`
          ).join('')}
        </div>`).join('')}
    `;
    document.body.appendChild(el);

    const mission = document.createElement('div');
    mission.id = 'fh-mission';
    /* Frame telemetry changes continuously and must not become a screen-reader
       announcement stream. Authored captions own the live region instead. */
    mission.setAttribute('aria-hidden', 'true');
    mission.innerHTML = '<span class="experience">OBSERVER · AUTONOMOUS</span>'
      + '<span class="body">PLANET 01 · SHEAR WORLD</span>'
      + '<span class="objective">OBJECTIVE · MATERIAL 0 / 8</span>'
      + '<span class="systems">PWR — · COMMS LOCAL</span>';
    document.body.appendChild(mission);

    const keys = document.createElement('div');
    keys.id = 'fh-keys';
    keys.innerHTML = '<span class="mode">EXP</span><b>WASD / ARROWS</b> DRIVE · <b>C</b> CAMERA'
      + '<br><span class="mode">OBS</span><b>SPACE</b> AUTONOMOUS · <b>H</b> ENGINEERING · <b>M</b> AUDIO';
    document.body.appendChild(keys);

    const wakeKeys = () => {
      keys.classList.add('awake');
      clearTimeout(this._keysTimer);
      this._keysTimer = setTimeout(() => keys.classList.remove('awake'), 3600);
    };
    addEventListener('keydown', wakeKeys);

    this.el = el;
    this.missionEl = mission;
    this.keys = keys;
    this.experience = 'observer';
    this.gallery = true;
    this.pinned = false;
    this.fields = {};
    el.querySelectorAll('[data-v]').forEach(n => { this.fields[n.dataset.v] = n; });

    this.pulse = document.createElement('span');
    this.pulse.id = 'fh-pulse';
    this.fields[pulseField]?.after(this.pulse);

    this.ctx = el.querySelector('#fh-spark')?.getContext('2d') ?? null;
    this.hist = new Array(136).fill(16.7);

    /* Gallery mode gives the scene its full frame after orientation. The
       diagnostic panel returns only at the left edge, where it never masks
       the route ahead; H pins it for tuning or installation checks. */
    this._setVisible = visible => {
      el.classList.toggle('hidden', !visible);
    };
    this._setVisible(false);
    addEventListener('pointermove', e => {
      if (!this.gallery || this.pinned) return;
      this._setVisible(e.clientX <= 34);
    }, { passive: true });
    addEventListener('keydown', e => {
      if (e.code !== 'KeyH') return;
      this.pinned = !this.pinned;
      this._setVisible(this.pinned);
    });
  }

  set(k, v, warn = false) {
    const n = this.fields[k];
    if (!n) return;
    n.textContent = v;
    n.classList.toggle('warn', warn);
  }

  setMission({ body, objective, systems }) {
    if (!this.missionEl) return;
    const setText = (selector, value) => {
      if (value == null) return;
      const el = this.missionEl.querySelector(selector);
      if (el && el.textContent !== value) el.textContent = value;
    };
    setText('.body', body);
    setText('.objective', objective);
    setText('.systems', systems);
  }

  setExperience(mode) {
    const next = mode === 'explorer' ? 'explorer' : 'observer';
    if (next === this.experience
        && document.body.classList.contains(`ti-${next}`)) return;
    this.experience = next;
    document.body.classList.toggle('ti-explorer', next === 'explorer');
    document.body.classList.toggle('ti-observer', next === 'observer');
    const label = this.missionEl?.querySelector('.experience');
    if (label) label.textContent = next === 'explorer'
      ? 'EXPLORER · DIRECT CONTROL' : 'OBSERVER · AUTONOMOUS';
    this.keys?.classList.toggle('awake', next === 'explorer');
  }

  flash() {
    this.pulse.classList.add('on');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.pulse.classList.remove('on'), 90);
  }

  frame(ms) {
    this.hist.push(ms); this.hist.shift();
    const W = 544, H = 64, ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(138,144,153,.16)'; ctx.lineWidth = 2;
    const y = H - (16.7 / 40) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.strokeStyle = '#c0152a'; ctx.beginPath();
    this.hist.forEach((v, i) => {
      const x = (i / (this.hist.length - 1)) * W;
      const yy = H - Math.min(1, v / 40) * H;
      i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    });
    ctx.stroke();
  }
}
