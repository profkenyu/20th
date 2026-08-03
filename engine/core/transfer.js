/**
 * PLANET TRANSFER — the body stays; its survey memory continues elsewhere.
 * The engine owns time and blackout. A work owns the actual world swap.
 */

const CSS = `
#ti-transfer-trigger{position:fixed;z-index:32;right:20px;top:calc(var(--bar) + 210px);border:0;border-top:1px solid rgba(105,224,145,.22);background:rgba(5,5,6,.38);padding:8px 2px 4px;width:154px;text-align:right;cursor:pointer;font:8px/1.4 'DM Mono',ui-monospace,monospace;letter-spacing:.18em;color:rgba(163,201,177,.48);transition:color .8s,opacity .8s}
#ti-transfer-trigger:hover,#ti-transfer-trigger:focus-visible{color:#69e091;outline:none}#ti-transfer-trigger:disabled{opacity:.18;cursor:default}
#ti-transfer-layer{position:fixed;inset:0;z-index:43;pointer-events:none;opacity:0;display:grid;place-items:center;overflow:hidden;color:#d9dde2;background:radial-gradient(circle at 50% 50%,transparent 0 10%,rgba(5,5,6,.18) 42%,rgba(5,5,6,.84) 100%);transition:opacity 1.8s cubic-bezier(.4,0,.2,1)}
#ti-transfer-layer::before{content:'';position:absolute;inset:-12%;opacity:0;background:repeating-linear-gradient(0deg,rgba(105,224,145,.018) 0 1px,transparent 1px 5px);transform:scaleY(1.4);transition:opacity 1.2s}
#ti-transfer-axis{position:absolute;left:50%;top:-20%;width:min(31vw,430px);height:140%;opacity:0;transform:translateX(-50%) scaleX(.72);border-left:1px solid rgba(217,221,226,.055);border-right:1px solid rgba(217,221,226,.055);border-radius:50%;background:linear-gradient(90deg,transparent,rgba(217,221,226,.018) 18%,rgba(217,221,226,.045) 50%,rgba(217,221,226,.018) 82%,transparent);box-shadow:inset 0 0 42px rgba(217,221,226,.025),0 0 34px rgba(217,221,226,.025)}
#ti-transfer-field{position:absolute;left:50%;top:50%;width:10px;height:10px;transform:translate(-50%,-50%);opacity:0}
#ti-transfer-field i{position:absolute;inset:0;border:1px solid rgba(217,221,226,.07);border-radius:50%;transform:translate(-50%,-50%) scale(.1)}
#ti-transfer-flare{position:absolute;inset:-25%;opacity:0;background:radial-gradient(circle at 50% 50%,rgba(245,240,220,.22) 0,rgba(217,221,226,.06) 2%,transparent 11%);mix-blend-mode:screen}
#ti-transfer-core{position:absolute;left:50%;top:50%;width:9px;height:9px;border:1px solid rgba(120,181,140,.52);border-radius:50%;background:transparent;box-shadow:0 0 8px rgba(120,181,140,.16);opacity:0;transform:translate(-50%,-50%) scale(.35)}
#ti-transfer-copy{position:absolute;left:50%;top:68%;width:min(620px,86vw);text-align:center;font-family:'DM Mono',ui-monospace,monospace;letter-spacing:.20em;text-transform:uppercase;opacity:0;transform:translate(-50%,7px);transition:opacity 1.1s,transform 1.4s}
#ti-transfer-copy .ko{display:block;font:400 12px/1.8 'Noto Sans KR','Apple SD Gothic Neo',sans-serif;letter-spacing:.12em;color:#d9dde2}
#ti-transfer-copy .en{display:block;margin-top:8px;font-size:8px;line-height:1.7;color:#5e666e}
#ti-transfer-copy .meter{display:block;width:74px;height:1px;margin:18px auto 0;background:linear-gradient(90deg,#69e091 var(--memory,0%),rgba(105,224,145,.12) 0)}
body.tx-active #ti-transfer-layer{opacity:1}body.tx-lock #ti-transfer-layer::before{opacity:1}body.tx-lock #ti-transfer-copy{opacity:1;transform:translate(-50%,0)}
body.tx-lock #ti-transfer-axis{animation:ti-axis-charge 4.9s cubic-bezier(.35,0,.2,1) both}
body.tx-lock #ti-transfer-field{opacity:1}
body.tx-lock #ti-transfer-field i:nth-child(1){animation:ti-field-collapse 3.8s .15s ease-in both}
body.tx-lock #ti-transfer-field i:nth-child(2){animation:ti-field-collapse 3.5s .55s ease-in both}
body.tx-lock #ti-transfer-field i:nth-child(3){animation:ti-field-collapse 3.2s .95s ease-in both}
body.tx-lock #ti-transfer-flare{animation:ti-flare-out 5s ease-in both}
body.tx-blackout #ti-transfer-layer{opacity:1;background:#050506;transition-duration:1.7s}body.tx-blackout #ti-transfer-copy{opacity:.72;transform:translate(-50%,0)}
body.tx-blackout #ti-transfer-axis{animation:ti-axis-residue 2.6s ease-out both}
body.tx-blackout #ti-transfer-core{opacity:0;transition:opacity .3s ease-out}
body.tx-arrival #ti-transfer-layer{opacity:0;background:#050506;transition-duration:4.8s}body.tx-arrival #ti-transfer-copy{opacity:0}
body.tx-arrival #ti-transfer-core{opacity:0}body.tx-active #ti-minimap{filter:drop-shadow(0 0 5px rgba(105,224,145,.08))}body.tx-lock #survey-log{filter:drop-shadow(0 0 3px rgba(105,224,145,.12))}
body.tx-arrival #ti-transfer-axis{animation:ti-axis-arrive 5.8s cubic-bezier(.2,.7,.2,1) both}
body.tx-arrival #ti-transfer-field{opacity:1}
body.tx-arrival #ti-transfer-field i:nth-child(1){animation:ti-field-arrive 2.9s .1s ease-out both}
body.tx-arrival #ti-transfer-field i:nth-child(2){animation:ti-field-arrive 3.3s .45s ease-out both}
body.tx-arrival #ti-transfer-field i:nth-child(3){animation:ti-field-arrive 3.7s .8s ease-out both}
body.tx-arrival #ti-transfer-flare{animation:ti-flare-in 5.6s ease-out both}
@keyframes ti-link-pulse{0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}35%{opacity:.32}100%{opacity:0;transform:translate(-50%,-50%) scale(4.5)}}
@keyframes ti-axis-charge{0%{opacity:0;transform:translateX(-50%) scaleX(.72)}22%{opacity:.13}72%{opacity:.25;transform:translateX(-50%) scaleX(1)}96%{opacity:.34}100%{opacity:0;transform:translateX(-50%) scaleX(1.035)}}
@keyframes ti-axis-arrive{0%{opacity:.34;transform:translateX(-50%) scaleX(1.035)}10%{opacity:.24}72%{opacity:.09;transform:translateX(-50%) scaleX(.96)}100%{opacity:0;transform:translateX(-50%) scaleX(.78)}}
@keyframes ti-axis-residue{0%,77%{opacity:.22;transform:translateX(-50%) scaleX(1)}86%{opacity:.17}100%{opacity:0;transform:translateX(-50%) scaleX(1.025)}}
@keyframes ti-field-collapse{0%{opacity:0;transform:translate(-50%,-50%) scale(68)}14%{opacity:.15}82%{opacity:.07}100%{opacity:0;transform:translate(-50%,-50%) scale(.25)}}
@keyframes ti-field-arrive{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}12%{opacity:.18}100%{opacity:0;transform:translate(-50%,-50%) scale(76)}}
@keyframes ti-flare-out{0%,76%{opacity:0}92%{opacity:.18}100%{opacity:0}}
@keyframes ti-flare-in{0%{opacity:.16}8%{opacity:.07}100%{opacity:0}}
@media(max-width:760px){#ti-transfer-trigger{right:14px;width:154px}#ti-transfer-copy .ko{font-size:11px}}
`;

const clamp = x => Math.max(0, Math.min(1, x));

export class PlanetTransfer {
  constructor({ minimap, survey, effect, ambient, onBegin, onBlackout, onArrived }) {
    this.minimap = minimap; this.survey = survey;
    this.effect = effect;
    this.ambient = ambient;
    this.onBegin = onBegin; this.onBlackout = onBlackout; this.onArrived = onArrived;
    this.active = false; this.phase = 'idle'; this.light = 1; this.audio = 1;
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    this.layer = document.createElement('div'); this.layer.id = 'ti-transfer-layer';
    this.layer.setAttribute('aria-live', 'polite');
    this.layer.innerHTML = '<div id="ti-transfer-axis"></div><div id="ti-transfer-field"><i></i><i></i><i></i></div><div id="ti-transfer-flare"></div><div id="ti-transfer-core"></div><div id="ti-transfer-copy"></div>';
    document.body.appendChild(this.layer); this.copy = this.layer.querySelector('#ti-transfer-copy');
    this.trigger = document.createElement('button'); this.trigger.id = 'ti-transfer-trigger'; this.trigger.type = 'button';
    this.trigger.textContent = 'T · TRANSMIT'; this.trigger.setAttribute('aria-label', 'Transmit survey memory to the next planet');
    document.body.appendChild(this.trigger); this.trigger.addEventListener('click', () => this.onRequest?.('manual'));
  }

  bindRequest(fn) { this.onRequest = fn; }

  request(reason, snapshot = {}) {
    if (this.active) return false;
    this.active = true; this.reason = reason; this.snapshot = snapshot; this.phase = 'lock'; this.t0 = performance.now();
    this.light = 1; this.audio = 1; this.trigger.disabled = true;
    const pct = Math.round((snapshot.completion ?? 0) * 100), emergency = reason === 'power';
    const ko = emergency ? '잔여 탐사 메모리 복구' : '탐사 메모리 패킷 송신';
    const cells = snapshot.atlas?.cells?.length ?? 0;
    const en = emergency ? `RECOVERED MEMORY · ${pct}% · ${cells} CELLS` : `SURVEY MEMORY · ${pct}% · ${cells} CELLS`;
    this.copy.style.setProperty('--memory', `${pct}%`);
    this.copy.innerHTML = `<span class="ko">${ko}</span><span class="en">${en}</span><span class="meter"></span>`;
    document.body.classList.add('tx-active', 'tx-lock'); this.ambient?.transferCue('charge'); this.onBegin?.(reason, snapshot); this.effect?.beginDeparture(reason); return true;
  }

  async update(now) {
    if (!this.active) return;
    const elapsed = now - this.t0;
    if (this.phase === 'lock') {
      const p = clamp((elapsed - 400) / 4400);
      this.minimap.collapse(p); this.survey.collapse(p); this.effect?.depart(p); this.light = 1 - p * p; this.audio = 1 - p * .92;
      if (elapsed < 5050) return;
      this.phase = 'blackout'; this.t0 = now; this.effect?.blackout(0); document.body.classList.remove('tx-lock'); document.body.classList.add('tx-blackout');
      this.ambient?.transferCue('release');
      this.copy.innerHTML = '<span class="ko">플랫폼 정지 · 탐사 세션 연속</span><span class="en">THE BODY REMAINS · THE SURVEY CONTINUES</span>'; return;
    }
    if (this.phase === 'blackout') {
      this.effect?.blackout(elapsed);
      if (elapsed < 3000) return;
      this.phase = 'rebuild'; await this.onBlackout?.(this.reason, this.snapshot); this.effect?.beginArrival(this.reason);
      this.phase = 'arrival'; this.t0 = performance.now(); this.minimap.collapse(0); this.survey.collapse(0);
      document.body.classList.remove('tx-blackout'); document.body.classList.add('tx-arrival');
      this.ambient?.transferCue('arrival');
      this.copy.innerHTML = '<span class="ko">사막 행성 · 원격 몸체 연결</span><span class="en">DUNE ARCHIVE · REMOTE BODY 02</span>'; return;
    }
    if (this.phase === 'arrival') {
      /* The destination field establishes itself for two full seconds before
         any material point or mechanical part is allowed to appear. */
      this.effect?.arrive(clamp((elapsed - 2000) / 6200));
      if (elapsed >= 8200) { this.finish(); this.onArrived?.(); }
    }
  }

  finish() {
    const completedTransfer = this.active;
    this.active = false; this.phase = 'idle'; this.light = 1; this.audio = 1; this.trigger.disabled = false;
    const pct = Math.round((this.snapshot?.completion ?? 0) * 100);
    this.trigger.textContent = `BODY 02 · MEMORY ${pct}%`; this.effect?.finish();
    document.body.classList.remove('tx-active', 'tx-lock', 'tx-blackout', 'tx-arrival');
    if (completedTransfer) this.ambient?.transferCue('online');
  }

  reset() {
    this.finish(); this.trigger.textContent = 'T · TRANSMIT'; this.minimap.collapse(0); this.survey.collapse(0);
  }
}
