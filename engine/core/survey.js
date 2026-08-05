import * as THREE from 'three';
import { vec3, vec4 } from 'three/tsl';

/* A local instrument, not an omniscient world map. Cells enter only when the
   rover's scan footprint touches them; unknown terrain remains literally
   absent. Absolute world coordinates keep the record stable while the render
   clipmap recentres underneath it. */
export class MiniMap {
  constructor(canvas, start, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.heightAt = options.heightAt ?? (() => 0);
    this.cell = options.cell ?? 8;              // measured detail, metres
    this.coarseCell = options.coarseCell ?? 32; // compressed old detail
    this.span = options.span ?? 1024;           // local frame, never a globe
    this.detailLimit = options.detailLimit ?? 3072;
    this.coarseLimit = options.coarseLimit ?? 1024;
    this.trailLimit = options.trailLimit ?? 512;
    this.reset(start, {
      id: options.id ?? 'BODY 01', label: options.label ?? 'TERRA', archives: [],
    });
  }

  get stats() {
    return {
      id: this.id, detail: this.cells.size, coarse: this.coarse.size,
      trail: this.trail.length, archives: this.archives.length,
      area: this.cells.size * this.cell ** 2 + this.coarse.size * this.coarseCell ** 2,
    };
  }

  collapse(amount) { this.transfer = Math.max(0, Math.min(1, amount)); }

  reset(start, options = {}) {
    /* Compatibility with the former reset(start, trail) signature: treat the
       old path as one archival memory, never as knowledge of the new body. */
    if (Array.isArray(options)) {
      options = options.length ? {
        archives: [{ id: 'BODY 01', label: 'LEGACY PATH', cell: 24, cells: [], trail: options }],
      } : {};
    }
    this.id = options.id ?? 'BODY 01';
    this.label = options.label ?? 'LOCAL FRAME';
    this.archives = (options.archives ?? []).slice(-2).map(a => ({
      ...a,
      cells: (a.cells ?? []).map(p => ({ ...p })),
      trail: (a.trail ?? []).map(p => ({ ...p })),
      bounds: a.bounds ? { ...a.bounds } : null,
    }));
    this.start = { x: start[0], z: start[1] };
    this.trail = [{ ...this.start }];
    this.cells = new Map();
    this.coarse = new Map();
    this.lastTrail = performance.now();
    this.lastScan = this.lastTrail - 1000;
    this.transfer = 0;
    const memory = options.memory;
    if (memory) {
      this.start = { ...(memory.start ?? this.start) };
      this.trail = (memory.trail ?? []).map(p => ({ ...p }));
      if (!this.trail.length) this.trail = [{ ...this.start }];
      this.cells = new Map((memory.cells ?? []).map(p => [this.cellKey(p.ix, p.iz), { ...p }]));
      this.coarse = new Map((memory.coarse ?? []).map(p => [this.cellKey(p.ix, p.iz), { ...p }]));
      this.enforceBudget();
    }
  }

  cellKey(ix, iz) { return `${ix},${iz}`; }

  writeCell(ix, iz, now, confidence = 1) {
    const key = this.cellKey(ix, iz);
    const x = (ix + 0.5) * this.cell, z = (iz + 0.5) * this.cell;
    const h = this.heightAt(x, z);
    const old = this.cells.get(key);
    const sample = old ? {
      ix, iz, x, z,
      h: old.h + (h - old.h) / Math.min(12, old.n + 1),
      n: Math.min(12, old.n + 1), confidence: Math.max(old.confidence, confidence), last: now,
    } : { ix, iz, x, z, h, n: 1, confidence, last: now };
    /* Refresh insertion order: eviction is least-recently measured, not the
       arbitrary coordinate that happened to be inserted first. */
    if (old) this.cells.delete(key);
    this.cells.set(key, sample);
  }

  compress(cell) {
    const ix = Math.floor(cell.x / this.coarseCell), iz = Math.floor(cell.z / this.coarseCell);
    const key = this.cellKey(ix, iz), old = this.coarse.get(key);
    const x = (ix + 0.5) * this.coarseCell, z = (iz + 0.5) * this.coarseCell;
    const sample = old ? {
      ix, iz, x, z, h: old.h + (cell.h - old.h) / Math.min(24, old.n + 1),
      n: Math.min(24, old.n + 1), confidence: Math.max(old.confidence, cell.confidence),
    } : { ix, iz, x, z, h: cell.h, n: 1, confidence: cell.confidence };
    if (old) this.coarse.delete(key);
    this.coarse.set(key, sample);
    while (this.coarse.size > this.coarseLimit) this.coarse.delete(this.coarse.keys().next().value);
  }

  enforceBudget() {
    while (this.cells.size > this.detailLimit) {
      const key = this.cells.keys().next().value, cell = this.cells.get(key);
      this.cells.delete(key); this.compress(cell);
    }
  }

  scan(v, now, charge) {
    const range = 5 + 9 * Math.max(0, Math.min(1, charge));
    const x0 = Math.floor((v.x - range) / this.cell), x1 = Math.floor((v.x + range) / this.cell);
    const z0 = Math.floor((v.z - range) / this.cell), z1 = Math.floor((v.z + range) / this.cell);
    let wrote = false;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const x = (ix + 0.5) * this.cell, z = (iz + 0.5) * this.cell;
      const d = Math.hypot(x - v.x, z - v.z);
      if (d > range) continue;
      this.writeCell(ix, iz, now, 0.28 + 0.72 * (1 - d / range)); wrote = true;
    }
    if (!wrote) this.writeCell(Math.floor(v.x / this.cell), Math.floor(v.z / this.cell), now, 1);
    this.enforceBudget();
  }

  record(v, now, charge) {
    if (now - this.lastTrail > 280) {
      const p = { x: v.x, z: v.z }, last = this.trail.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1.25) {
        this.trail.push(p);
        if (this.trail.length > this.trailLimit) this.trail.shift();
      }
      this.lastTrail = now;
    }
    if (now - this.lastScan > 430) { this.scan(v, now, charge); this.lastScan = now; }
  }

  decimate(points, limit) {
    if (points.length <= limit) return points.map(p => ({ x: p.x, z: p.z }));
    const out = [], stride = (points.length - 1) / (limit - 1);
    for (let i = 0; i < limit; i++) {
      const p = points[Math.round(i * stride)]; out.push({ x: p.x, z: p.z });
    }
    return out;
  }

  snapshot() {
    /* Archive at 24 m: enough to retain the travelled shape in a thumbnail,
       finite enough that a chain of planets cannot grow without bound. */
    const archiveCell = 24, cells = new Map();
    const add = p => {
      const ix = Math.floor(p.x / archiveCell), iz = Math.floor(p.z / archiveCell);
      const key = this.cellKey(ix, iz), old = cells.get(key);
      if (old) { old.h += (p.h - old.h) / ++old.n; old.confidence = Math.max(old.confidence, p.confidence); }
      else cells.set(key, {
        x: (ix + 0.5) * archiveCell, z: (iz + 0.5) * archiveCell,
        h: p.h, n: 1, confidence: p.confidence,
      });
    };
    this.coarse.forEach(add); this.cells.forEach(add);
    const packed = [...cells.values()].slice(-1024).map(({ x, z, h, confidence }) => ({ x, z, h, confidence }));
    const trail = this.decimate(this.trail, 192);
    const pts = [...packed, ...trail];
    const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
    const bounds = pts.length ? {
      minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
    } : { minX: this.start.x, maxX: this.start.x, minZ: this.start.z, maxZ: this.start.z };
    return {
      id: this.id, label: this.label, cell: archiveCell, cells: packed, trail, bounds,
      measuredCells: this.cells.size + this.coarse.size,
      coverageSqM: this.stats.area,
    };
  }

  /** Full finite live state for revisiting a body. `snapshot()` remains the
   compressed off-world thumbnail; this restores the active atlas itself. */
  state() {
    return {
      id: this.id, label: this.label, start: { ...this.start },
      trail: this.trail.map(p => ({ ...p })),
      cells: [...this.cells.values()].map(p => ({ ...p })),
      coarse: [...this.coarse.values()].map(p => ({ ...p })),
    };
  }

  drawArchive(c, memory, x, y, w, h) {
    c.fillStyle = 'rgba(5,5,6,.88)'; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(217,221,226,.055)'; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
    c.font = '11px DM Mono, monospace'; c.fillStyle = 'rgba(177,230,197,.24)';
    c.fillText(memory.id ?? 'MEMORY', x + 7, y + 13);
    const b = memory.bounds, cells = memory.cells ?? [];
    if (b && cells.length) {
      const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxZ - b.minZ);
      const k = Math.min((w - 14) / bw, (h - 22) / bh);
      const ox = x + w / 2 - (b.minX + b.maxX) * .5 * k;
      const oy = y + 17 + (h - 20) / 2 - (b.minZ + b.maxZ) * .5 * k;
      c.fillStyle = 'rgba(145,180,158,.20)';
      for (const p of cells) c.fillRect(ox + p.x * k, oy + p.z * k, 1.4, 1.4);
    } else {
      c.font = '9px DM Mono, monospace'; c.fillStyle = 'rgba(217,221,226,.07)';
      c.fillText('NO DATA', x + 7, y + h - 7);
    }
  }

  draw(v, now) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const mx = 12, my = 50, mw = W - 24, mh = H - 124;
    const cx = mx + mw / 2, cy = my + mh / 2, k = mw / this.span;
    const to = p => [cx + (p.x - v.x) * k, cy + (p.z - v.z) * k];
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(5,5,6,.76)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(217,221,226,.07)'; c.strokeRect(.5, .5, W - 1, H - 1);
    c.font = '15px DM Mono, monospace'; c.fillStyle = 'rgba(177,230,197,.34)';
    c.fillText('LOCAL SURVEY ATLAS', 12, 19);
    c.font = '10px DM Mono, monospace'; c.fillStyle = 'rgba(217,221,226,.16)';
    c.fillText(`${this.id} · ${this.label} · ${this.cell} M CELL`, 12, 38);

    c.fillStyle = 'rgba(2,3,4,.965)'; c.fillRect(mx, my, mw, mh);
    c.strokeStyle = 'rgba(217,221,226,.065)'; c.strokeRect(mx + .5, my + .5, mw - 1, mh - 1);
    c.save(); c.beginPath(); c.rect(mx, my, mw, mh); c.clip();
    const scale = 1 - this.transfer * .84, alpha = 1 - this.transfer * .88;
    c.translate(cx, cy); c.scale(scale, scale); c.translate(-cx, -cy); c.globalAlpha = alpha;

    /* 128 m reference grid. It states scale without pretending to know land. */
    c.lineWidth = .6; c.strokeStyle = 'rgba(217,221,226,.028)';
    const grid = 128, gx = ((v.x % grid) + grid) % grid, gz = ((v.z % grid) + grid) % grid;
    const step = grid * k;
    let gridX = cx - gx * k; while (gridX > mx) gridX -= step;
    let gridY = cy - gz * k; while (gridY > my) gridY -= step;
    for (let x = gridX; x < mx + mw; x += step) { c.beginPath(); c.moveTo(x, my); c.lineTo(x, my + mh); c.stroke(); }
    for (let y = gridY; y < my + mh; y += step) { c.beginPath(); c.moveTo(mx, y); c.lineTo(mx + mw, y); c.stroke(); }

    const paintCell = (p, size, base) => {
      const [x, y] = to(p); if (x < mx - size || x > mx + mw || y < my - size || y > my + mh) return;
      const relief = Math.max(-1, Math.min(1, (p.h - v.ground) / 14));
      const a = base * (0.55 + 0.45 * (p.confidence ?? 1)) * (0.72 + Math.abs(relief) * .28);
      c.fillStyle = relief >= 0 ? `rgba(168,184,176,${a})` : `rgba(103,132,119,${a})`;
      c.fillRect(x - size / 2, y - size / 2, size, size);
    };
    this.coarse.forEach(p => paintCell(p, Math.max(1.2, this.coarseCell * k), .055));
    this.cells.forEach(p => paintCell(p, Math.max(1.1, this.cell * k), .16));

    /* Quantised contour boundaries only where both neighbouring cells were
       measured. No line crosses the unknown region. */
    c.lineWidth = .55; c.strokeStyle = 'rgba(190,210,199,.10)';
    for (const p of this.cells.values()) {
      const band = Math.floor(p.h / 2.5), right = this.cells.get(this.cellKey(p.ix + 1, p.iz));
      const down = this.cells.get(this.cellKey(p.ix, p.iz + 1));
      const [x, y] = to(p), d = this.cell * k * .5;
      if (right && Math.floor(right.h / 2.5) !== band) { c.beginPath(); c.moveTo(x + d, y - d); c.lineTo(x + d, y + d); c.stroke(); }
      if (down && Math.floor(down.h / 2.5) !== band) { c.beginPath(); c.moveTo(x - d, y + d); c.lineTo(x + d, y + d); c.stroke(); }
    }

    const visibleTrail = this.trail.slice(Math.floor(this.trail.length * this.transfer));
    if (visibleTrail.length > 1) {
      c.lineWidth = 1.05;
      for (let i = 1; i < visibleTrail.length; i++) {
        const a = to(visibleTrail[i - 1]), b = to(visibleTrail[i]), age = i / (visibleTrail.length - 1);
        c.beginPath(); c.moveTo(...a); c.lineTo(...b);
        c.strokeStyle = `rgba(217,221,226,${.025 + age * .15})`; c.stroke();
      }
    }
    const pulse = .5 + .5 * Math.sin(now / 720), glow = 1 - this.transfer * .72;
    c.beginPath(); c.arc(cx, cy, 5.0 + 2.2 * pulse, 0, Math.PI * 2);
    c.fillStyle = `rgba(105,224,145,${(.025 + .05 * pulse) * glow})`; c.fill();
    c.beginPath(); c.arc(cx, cy, 2.15, 0, Math.PI * 2);
    c.fillStyle = `rgba(136,190,154,${.30 * glow})`; c.fill();
    c.restore(); c.globalAlpha = 1;

    const st = this.stats;
    c.font = '10px DM Mono, monospace'; c.fillStyle = 'rgba(177,230,197,.18)';
    c.fillText(`MEASURED ${st.detail + st.coarse} CELLS · ${(st.area / 1000).toFixed(1)}K M²`, 12, H - 61);
    const slots = 2, gap = 6, sw = (W - 24 - gap) / slots, sy = H - 52, sh = 42;
    const memories = this.archives.slice(-slots);
    for (let i = 0; i < slots; i++) {
      const memory = memories[i];
      if (memory) this.drawArchive(c, memory, 12 + i * (sw + gap), sy, sw, sh);
      else {
        c.strokeStyle = 'rgba(217,221,226,.035)'; c.strokeRect(12.5 + i * (sw + gap), sy + .5, sw - 1, sh - 1);
        c.font = '9px DM Mono, monospace'; c.fillStyle = 'rgba(217,221,226,.055)';
        c.fillText(`MEM ${String(i + 1).padStart(2, '0')} · EMPTY`, 19 + i * (sw + gap), sy + 24);
      }
    }
  }

  update(v, now, charge = 1, record = true) {
    if (record) this.record(v, now, charge);
    this.draw(v, now);
  }
}

export class Optics { constructor(){this.fov=null} update(now,v,camera){const g=1-Math.min(1,v.lapse??1), b=Math.sin(now*.00135); this.fov??=camera.fov; camera.fov=this.fov+b*(.035+g*.055); camera.updateProjectionMatrix(); camera.position.y+=Math.sin(now*.0031)*(.0015+g*.0035); document.body.classList.toggle('sensor-stutter',g>.52&&Math.sin(now*.021)>.975);} }

export class Survey {
  constructor(heightAt, objectives = []) { this.heightAt=heightAt; this.group=new THREE.Group(); this.rings=[]; for(let k=0;k<3;k++){const n=72,g=new THREE.BufferGeometry(),p=new Float32Array(n*6),i=new Uint16Array(n*6); for(let q=0;q<n;q++){const a=q*2,b=(q+1)%n,c=a+2,d=(b+2)%(n*2),o=q*6;i.set([a,c,b,b,c,d],o)} g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(new THREE.BufferAttribute(i,1));const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});m.colorNode=vec4(vec3(.46,.68,.54),.18);const mesh=new THREE.Mesh(g,m);mesh.visible=false;this.group.add(mesh);this.rings.push({mesh,m,p,n});} this.log=document.getElementById('survey-log'); this.reset(objectives); }
  get complete(){return this.objectives.length>0&&this.seen.size>=this.objectives.length&&this.queue.length===0}
  get completion(){return this.objectives.length?Math.min(1,this.logged/this.objectives.length):0}
  snapshot(){return{completion:this.completion,records:[...this.records],total:this.objectives.length,complete:this.complete,seen:[...this.seen],queue:[...this.queue],logged:this.logged}}
  restore(snapshot){if(!snapshot)return;this.records=[...(snapshot.records??[])];this.seen=new Set(snapshot.seen??[]);this.queue=[...(snapshot.queue??[])];this.logged=Math.min(this.objectives.length,snapshot.logged??this.records.length);this.completedAt=snapshot.complete?performance.now():0;if(!this.log)return;for(const msg of this.records.slice(-2).reverse()){const row=document.createElement('div');row.textContent=msg;this.log.appendChild(row)}}
  inherit(snapshot){this.inherited={records:[...(snapshot.records??[])],trail:[...(snapshot.trail??[])]};if(!this.log)return;const row=document.createElement('div');const atlas=snapshot.atlas;row.textContent=`${atlas?.id??'MEMORY 01'} ARCHIVE · ${this.inherited.records.length}/${snapshot.total??0} RECORDS · ${atlas?.cells?.length??0} LOCAL CELLS`;this.log.prepend(row)}
  collapse(amount){this.transfer=Math.max(0,Math.min(1,amount))}
  reset(objectives=this.objectives??[]){this.objectives=objectives.map(o=>Array.isArray(o)?{r:o[0],msg:o[1]}:o);this.phase=-1;this.last=performance.now();this.lastRecord=performance.now();this.seen=new Set;this.queue=[];this.records=[];this.logged=0;this.completedAt=0;this.transfer=0;this.inherited=null;this.rings?.forEach(r=>r.mesh.visible=false);if(this.log)this.log.replaceChildren()}
  record(v,now,charge){for(const {r,msg} of this.objectives)if(v.radius<=r&&!this.seen.has(r)){this.seen.add(r);this.queue.push(msg)} const interval=2400+Math.round((1-charge)*6500);if(this.queue.length&&now-this.lastRecord>interval){const msg=this.queue.shift(),row=document.createElement('div');row.textContent=msg;this.log.prepend(row);if(this.log.children.length>2)this.log.lastElementChild.remove();this.lastRecord=now;this.records.push(msg);this.logged++;if(this.complete)this.completedAt=now;} }
  update(v,now,charge){this.record(v,now,charge);const period=11000+(1-charge)*25000;if(this.phase<0&&v.speed<.035&&now-this.last>period){this.phase=0;this.t0=now;this.last=now;this.cx=v.x;this.cz=v.z}if(this.phase<0)return;const t=(now-this.t0)/6400;if(t>=1){this.phase=-1;this.rings.forEach(r=>r.mesh.visible=false);return}const range=5+9*charge;this.rings.forEach((it,j)=>{const u=t-j*.24;if(u<0){it.mesh.visible=false;return}const r=.8+u*range,w=.012;for(let q=0;q<it.n;q++){const a=q/it.n*Math.PI*2;for(let side=0;side<2;side++){const rr=r+(side?.5:-.5)*w,x=this.cx+Math.cos(a)*rr,z=this.cz+Math.sin(a)*rr,o=(q*2+side)*3;it.p[o]=x;it.p[o+1]=this.heightAt(x,z)+.024;it.p[o+2]=z}}it.mesh.geometry.attributes.position.needsUpdate=true;it.mesh.visible=true;it.m.opacity=(.024-j*.005)*(1-u)*(1-u)*(1-this.transfer)}) }
}
