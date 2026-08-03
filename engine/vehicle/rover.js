/**
 * ROVER — an unmanned surface probe.
 *
 * WHY NOT A WALKER
 *   A floating eye at 1.72 m reads the ground as a picture. A machine on six
 *   wheels reads it as terrain, because the terrain answers back: the horizon
 *   tilts when a wheel climbs a rock, and a slope can refuse to be climbed.
 *   Everything below follows from taking that seriously.
 *
 * ATTITUDE FROM THE WHEELS
 *   Eight contact points are sampled on the CPU height mirror each frame.
 *   Pitch comes from the front/rear mean over the wheelbase, roll from the
 *   left/right mean over the track, and deck height from the mean of all
 *   eight. That is a plane fit in everything but name, and it means the body
 *   cannot be level on ground that is not.
 *
 * WHAT THE SUSPENSION IS AND IS NOT FOR
 *   It was measured, and the measurement corrected an assumption. Independent
 *   springs do NOT reduce chassis pitch here — 1 % at cruise, and lowering the
 *   body's natural frequency from 0.90 Hz to 0.18 Hz bought 2 % and then went
 *   negative. The reason is structural: a plane fit across a 2.30 m wheelbase
 *   is already a spatial low-pass, and what survives it is the real shape of
 *   the ground at the machine's own scale. A suspension that filtered that out
 *   would be lying about the terrain.
 *
 *   What it is for is CONTACT. A rigid eight-wheel chassis can rest on three
 *   points; the other five float above the ground or pass through it. The
 *   stroke is what puts all eight down, and it is the difference between a
 *   machine crossing terrain and a box sliding over a heightfield.
 *
 * TRACTION IS A REAL LIMIT, NOT A RULE
 *   Real rovers have a grade limit and a tilt limit. Traction falls to zero
 *   between `gradeLimit` and `gradeMax`, in both directions — a machine will
 *   not descend a forty-degree slope any more than it will climb one.
 *
 *   MEASURED, NOT ASSERTED. On the open plain the probe holds 100 % traction
 *   at a mean pitch of 4.6°. The angular-momentum rampart is a drag, not a
 *   wall: traction dips to the crawl floor on its flank and the probe crests
 *   it slowly. What genuinely stops it is the inner cliff, where the potential
 *   reaches 87°. Driven flat out from r = 95 m for two minutes it halts at
 *   r = 42.75 m doing 0.112 m/s, with the lapse at 0.254 — asymptotically, and
 *   for two independent reasons at once. The horizon is not reachable, and
 *   nothing had to be scripted to make that true.
 *
 * TWO TRACKS
 *   The wake is stamped at the left and right wheel lines, not at a point.
 *   The undisturbed strip between them is what makes a trail read as a trail.
 *
 * If `cfg().metric` is set, coordinate speed also scales by the lapse
 * √(1 − rs/r): approaching a horizon takes longer and longer, and never
 * finishes, because that is what the metric says — not because anything
 * blocks the way.
 */

import * as THREE from 'three';
import { Fn, float, vec3, vec4, normalize, dot, abs, mix, exp, smoothstep as ss,
         normalWorld, positionView } from 'three/tsl';
import { cfg } from '../config.js';
import { lapseAt } from '../cpu/metric.js';
import { uLampA, uLampB, uLampDir } from '../tsl/headlight.js';

/* Chassis geometry lives in cfg().vehicle.chassis so that `npm run terrain`
   can measure grade across the real wheelbase. Everything below is BEHAVIOUR,
   which the terrain report has no business knowing about. */
const B = {
  turnRate: 1.15,         // rad/s at full steer
  gradeLimit: 0.48,       // 27.5° — traction starts to go
  gradeMax: 0.70,         // 40° — traction is gone
  tiltLimit: 0.62,        // 35.5° roll — the probe refuses to press on
  crawl: 0.10,            /* traction never reaches zero. A machine pinned at
                             exactly zero on a slope it drove onto is a dead
                             end with no story — the visitor cannot tell a
                             design limit from a broken build. A floor of ten
                             per cent leaves it able to creep off, slowly and
                             visibly. Steering authority is deliberately NOT
                             gated by traction, so the way out is to turn
                             across the slope — the same thing a real probe
                             does, and the reason a derived landform becomes a
                             route rather than a wall. */

  /* ── the bump stops bite ───────────────────────────────────────────────
     Past ±travel the arm is rigid: the wheel is being slammed rather than
     sprung, and for the instant it is unloaded it is not driving. Traction
     falls with the fraction of wheels on their stops, and the drive draws
     extra current fighting it. This is the physical cost of speed — a rover
     that is driven too fast for its suspension stops going anywhere useful,
     which is what actually happens. */
  slamGrip: 0.55,         // traction lost with all eight on the stops
                          // (the matching power draw is cfg().power.slam)

  bodyHz: 0.90,           // the sprung mass
  bodyZeta: 0.85,
  camClear: 0.85,         // minimum chase-eye height above the ground
  camDamp: 6.5,
  orbitPitch: [-0.16, 1.10],
  orbitDist: [2.6, 34.0],
  settle: 2.6,
};

/** Filled from cfg() on first construction — see the note above. */
let D = null;


export class Rover {
  constructor(camera, dom, heightAt) {
    D = { ...cfg().vehicle.chassis, ...B };
    this.camera = camera;
    this.h = heightAt;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;                    // 0 → forward is (0,−1)
    this.lookYaw = 0;
    this.lookPitch = -0.04;
    this.pitch = 0; this.roll = 0; this.deckY = 0;
    /* eight independent springs: extension and its rate, in metres */
    this.sus = new Float64Array(8);
    this.susV = new Float64Array(8);
    this.slam = 0; this.stops = 0;
    this.speed = 0; this.odometer = 0;
    this.traction = 1; this.grade = 0;
    this.chase = false;
    this.orbitYaw = 0;              // around the probe, relative to its heading
    this.orbitPitch = 0.30;
    this.orbitDist = 6.4;
    this.camAt = new THREE.Vector3();
    this._aim = new THREE.Vector3();      // preallocated: placeChase runs every
    this._want = new THREE.Vector3();     // frame and must not churn the heap
    this.lamps = true;
    this.lidTilt = 0;           // radians; the array's own pitch, hinged at the nose
    this.disabled = false;      // set when the cell is empty
    this.transmitting = false;  // motion lock; unlike a dead cell, lamps may decay naturally
    this.metricEnabled = true;  // the same rover may continue on a non-relativistic world
    /* Exhibition default: the rover must continue even when nobody is at the
       MacBook. Any driving key is a deliberate remote override; Space hands
       the route back to the autonomous mission. */
    this.auto = true;
    this.missionHold = false;       // long autonomous survey pauses
    this.keys = new Set();
    this.settled = false;

    const built = buildRover();
    this.group = built.group;
    this.chassis = built.chassis;
    this.head = built.head;
    this.wheels = built.wheels;
    this.lid = built.lid;
    this.wings = built.wings;
    this.wheelSpin = 0;

    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('pointercancel', () => { dragging = false; });
    dom.addEventListener('pointermove', e => {
      if (!dragging) return;
      const s = cfg().vehicle.lookSpeed;
      if (this.chase) {
        /* in chase the drag orbits the probe rather than panning the mast —
           the point of the view is to see the machine from any side while it
           is moving, and a fixed rear pole only ever shows its back */
        this.orbitYaw -= (e.clientX - lx) * s * 1.6;
        this.orbitPitch = clamp(this.orbitPitch + (e.clientY - ly) * s * 1.2, D.orbitPitch[0], D.orbitPitch[1]);
      } else {
        this.lookYaw -= (e.clientX - lx) * s;
        this.lookPitch = clamp(this.lookPitch - (e.clientY - ly) * s, -0.65, 0.45);
      }
      lx = e.clientX; ly = e.clientY;
    }, { passive: true });

    dom.addEventListener('wheel', e => {
      if (!this.chase) return;
      this.orbitDist = clamp(this.orbitDist * (1 + Math.sign(e.deltaY) * 0.10), D.orbitDist[0], D.orbitDist[1]);
    }, { passive: true });

    addEventListener('keydown', e => {
      if (e.code === 'Space') { this.auto = !this.auto; e.preventDefault(); }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.auto = false;
      if (e.code === 'KeyC') this.chase = !this.chase;
      if (e.code === 'KeyL' && !this.disabled) this.lamps = !this.lamps;
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /**
   * Wheel contact points in world space, front→rear, left→right.
   *
   * A WHEEL IS NOT A POINT. Sampling the height field at the axle centre makes
   * the body fall into every depression narrower than the wheel, and on a
   * surface with metre-scale rubble that produced a mean pitch of 21° and a
   * mean roll of 22° — measured, not guessed. A rolling cylinder of radius R
   * bridges what it cannot enter, so the contact height is the MAXIMUM over a
   * short footprint along the direction of travel, not the height beneath the
   * axle. Three samples per wheel; the ride settles to something a machine
   * could survive and a camera can look through.
   */
  contacts() {
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    /* the spine's RIGHT hand. It was (fz, −fx), which is the left — for a
       machine facing −Z that puts +track on the near side and silently
       inverted the roll sign against the model's own +X. Symmetric users (the
       two wake tracks, the lamp pair) never noticed; the suspension did. */
    const sx = -fz, sz = fx;
    const foot = D.wheelR * 0.85;
    const out = [];
    for (const dz of D.axles) {
      for (const dx of [-D.track, D.track]) {
        const x = this.pos.x + fx * dz + sx * dx;
        const z = this.pos.z + fz * dz + sz * dx;
        const y = Math.max(
          this.h(x - fx * foot, z - fz * foot),
          this.h(x, z),
          this.h(x + fx * foot, z + fz * foot));
        out.push({ x, z, y });
      }
    }
    return out;
  }

  update(dt) {
    const V = cfg().vehicle;
    const k = this.keys;

    let throttle = 0, steer = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) throttle += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) throttle -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer += 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer -= 1;
    if (this.auto && throttle === 0 && !this.missionHold) throttle = 1;
    let boosting = k.has('ShiftLeft') || k.has('ShiftRight');

    /* A dead probe is not a slowed probe. No drive, no steering, no lamps —
       the mast camera still works because looking costs nothing. */
    if (this.disabled || this.transmitting) { throttle = 0; steer = 0; boosting = false; }
    if (this.disabled) this.lamps = false;

    /* ── the solar lid ────────────────────────────────────────────────
       A real control with a real consequence, not an animation: the hinge
       angle IS the array's pitch in the power budget, and the panel visibly
       moves to the angle being used. Hinged at the nose, so lifting the rear
       edge aims the array forward — a probe driving toward the sun can catch
       it, and one driving away cannot. */
    if (!this.disabled && !this.transmitting) {
      const lidIn = (k.has('BracketRight') ? 1 : 0) - (k.has('BracketLeft') ? 1 : 0);
      if (lidIn) this.lidTilt = clamp(this.lidTilt + lidIn * D.lidRate * dt, 0, D.lidMax);
    }
    if (this.lid) this.lid.rotation.x = -this.lidTilt;
    /* The panels are not decorative wings: they fold upward as the charging
       lid seeks the sun, keeping the crawler's silhouette compact on slopes. */
    if (this.wings) for (const wing of this.wings)
      wing.rotation.z = wing.userData.side * this.lidTilt * 0.78;

    /* ── suspension, then attitude ─────────────────────────────────────
       A sprung body over eight wheels that stay on the ground.

       The separation is entirely one of FREQUENCY, and that is the whole
       mechanism: the body is a 0.42 Hz oscillator chasing the mean and tilt of
       the contacts, while the wheels sit exactly on the ground at whatever
       rate the ground demands. The stroke is the difference between the two.
       So a rock under one wheel appears as 4 cm of that wheel's travel and
       almost nothing at the chassis, while a hill — which moves all eight the
       same way — moves the mean, and the body follows it.

       A FIRST VERSION OF THIS OSCILLATED ITSELF ONTO THE BUMP STOPS. It gave
       each wheel its own spring AND computed the body target from
       (contact − extension), which is a positive feedback loop: extending a
       wheel lowered the body, which raised the demanded extension, which
       lowered the body again. Measured 82 % of the drive with every wheel
       pinned at full travel. The body target now reads the RAW contacts, and
       extension is a consequence of the body's position rather than an input
       to it — so the loop does not exist rather than being damped away.

       The bump stops are real. Beyond ±travel the arm is rigid and the force
       must reach the chassis, so the excess is applied to the body in the same
       frame: one iteration of a constraint solve, and the reason driving into
       a boulder still shakes the machine. */
    const c = this.contacts();
    const rest = D.wheelR + D.clearance;

    const mean = a => a.reduce((t, i) => t + c[i].y, 0) / a.length;
    const front = mean([0, 1]), rear = mean([6, 7]);
    const left = mean([0, 2, 4, 6]), right = mean([1, 3, 5, 7]);

    const tDeck = mean([0, 1, 2, 3, 4, 5, 6, 7]) + rest;
    const tPitch = Math.atan2(front - rear, D.wheelBase * 2);
    const tRoll = Math.atan2(right - left, D.track * 2);

    if (!this.settled) {
      this.deckY = tDeck; this.pitch = tPitch; this.roll = tRoll;
      this.deckV = 0; this.pitchV = 0; this.rollV = 0;
      this.sus.fill(0); this.susV.fill(0); this.slam = 0; this.stops = 0;
      this.settled = true;
    } else {
      /* semi-implicit: velocity first, then position. Unconditionally stable
         for a spring at these rates, so the timestep needs no special care. */
      const bw = 2 * Math.PI * D.bodyHz;
      const bk = bw * bw, bc = 2 * D.bodyZeta * bw;
      this.deckV += (bk * (tDeck - this.deckY) - bc * this.deckV) * dt;
      this.pitchV += (bk * (tPitch - this.pitch) - bc * this.pitchV) * dt;
      this.rollV += (bk * (tRoll - this.roll) - bc * this.rollV) * dt;
      this.deckY += this.deckV * dt;
      this.pitch += this.pitchV * dt;
      this.roll += this.rollV * dt;
    }

    /* stroke, and whatever the stops could not absorb */
    let exDeck = 0, exF = 0, exR = 0, exL = 0, exRt = 0;
    for (let i = 0; i < 8; i++) {
      const dz = D.axles[i >> 1], dx = (i & 1) ? D.track : -D.track;
      const mount = this.deckY - rest + dz * Math.sin(this.pitch) + dx * Math.sin(this.roll);
      const raw = c[i].y - mount;
      this.sus[i] = clamp(raw, -D.travel, D.travel);
      const ex = raw - this.sus[i];
      exDeck += ex / 8;
      if (dz > 0.7) exF += ex / 2; else if (dz < -0.7) exR += ex / 2;
      if (dx < 0) exL += ex / 4; else exRt += ex / 4;
    }
    if (exDeck || exF || exR || exL || exRt) {
      this.deckY += exDeck;
      this.pitch += Math.atan2(exF - exR, D.wheelBase * 2);
      this.roll += Math.atan2(exRt - exL, D.track * 2);
      this.deckV += exDeck / Math.max(dt, 1e-3) * 0.25;   // the jolt, damped
      for (let i = 0; i < 8; i++) {
        const dz = D.axles[i >> 1], dx = (i & 1) ? D.track : -D.track;
        const mount = this.deckY - rest + dz * Math.sin(this.pitch) + dx * Math.sin(this.roll);
        this.sus[i] = clamp(c[i].y - mount, -D.travel, D.travel);
      }
    }
    this.artic = Math.max(...Array.from(this.sus, Math.abs));

    /* How much of the machine is being slammed rather than sprung — and how
       hard. The first version counted only the geometry, which made a crawl
       down the inner cliff as expensive as a sprint across the plain and
       erased the lamp decision entirely. A bump stop met at 1 m/s is a nudge;
       met at high speed it is an impact, because the vertical velocity the arm has
       to arrest scales with the forward speed. So severity carries the speed,
       and slow careful driving over broken ground costs almost nothing —
       which is exactly the trade a real rover driver is making. */
    let onStop = 0;
    for (let i = 0; i < 8; i++) if (Math.abs(this.sus[i]) >= D.travel - 1e-6) onStop++;
    this.stops = onStop / 8;
    this.slam = this.stops * Math.min(1, Math.abs(this.speed) / cfg().vehicle.cruise);

    /* ── traction ──────────────────────────────────────────────────────
       The gate is |pitch|, not the climb alone. A rover will not drive DOWN a
       forty-degree slope either — it brakes, or it does not go. Gating only
       ascent let the probe fall off the inner cliff at full speed, which was
       both wrong and the difference between a horizon that cannot be reached
       and one that can be driven into. */
    this.grade = this.pitch;
    const climb = Math.abs(this.pitch);
    const gradeFall = 1 - smoothstep(D.gradeLimit, D.gradeMax, climb);
    const tiltFall = 1 - smoothstep(D.tiltLimit * 0.72, D.tiltLimit, Math.abs(this.roll));
    /* a wheel on its stop is being slammed, and for that instant it is
       unloaded rather than driving — so speed costs grip, physically */
    const slamFall = 1 - this.slam * D.slamGrip;
    this.traction = D.crawl + (1 - D.crawl) * gradeFall * tiltFall * slamFall;

    /* ── the metric, if the work has one ──────────────────────────────── */
    this.radius = Math.hypot(this.pos.x, this.pos.z);
    this.lapse = this.metricEnabled ? lapseAt(this.radius) : 1;

    const target = (boosting ? V.boost : V.cruise) * throttle
                 * this.traction * Math.max(0.004, this.lapse);
    this.speed += (target - this.speed) * Math.min(1, dt * 3.2);
    if (Math.abs(this.speed) < 1e-4) this.speed = 0;

    /* steering authority is mostly, but not entirely, a function of motion:
       a skid-steer probe can pivot slowly while stationary */
    const authority = 0.30 + 0.70 * Math.min(1, Math.abs(this.speed) / Math.max(V.cruise, 1e-3));
    this.heading += steer * D.turnRate * authority * dt;

    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.odometer += Math.abs(this.speed) * dt;

    /* ── place the body, then the camera ──────────────────────────────── */
    this.group.position.set(this.pos.x, this.deckY, this.pos.z);
    this.group.rotation.set(0, this.heading, 0);
    this.chassis.rotation.set(this.pitch, 0, this.roll);
    this.wheelSpin += this.speed * dt / D.wheelR;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.rotation.x = this.wheelSpin;
      /* the stroke is visible, and it is the same number the physics used */
      w.position.y = w.userData.restY + this.sus[i];
      const u = w.userData;
      /* the strut takes up half the stroke in position and all of it in
         length, so it stays attached at both ends */
      u.arm.position.y = u.armY + this.sus[i] * 0.5;
      u.arm.scale.y = Math.max(0.05, 1 + this.sus[i] / 0.30);
      u.hub.position.y = u.restY + this.sus[i];
      u.spring.position.y = u.springY + this.sus[i] * 0.5;
      u.spring.scale.y = Math.max(0.24, 1 + this.sus[i] / 0.34);
      u.shock.position.y = u.springY + this.sus[i] * 0.5;
      u.shock.scale.y = Math.max(0.24, 1 + this.sus[i] / 0.34);
    }
    this.group.updateMatrixWorld(true);

    if (this.chase) {
      this.placeChase(dt);
      this.group.visible = true;
    } else {
      this.camera.position.setFromMatrixPosition(this.head.matrixWorld);
      this.camera.quaternion.setFromRotationMatrix(this.head.matrixWorld);
      this.camera.rotateY(this.lookYaw);
      this.camera.rotateX(this.lookPitch);
      this.group.visible = false;      // the mast cannot see its own deck
    }

    const sx = -fz, sz = fx;

    /* ── lamps ────────────────────────────────────────────────────────
       Body-mounted, so they inherit the chassis pitch: nose up and the beam
       goes up the slope, which is exactly what a real probe's lights do and
       exactly why cresting a rise briefly blinds it. */
    const H = cfg().headlight;
    if (H && H.count) {
      const lampY = this.deckY + H.rise;
      const bx = this.pos.x + fx * H.ahead, bz = this.pos.z + fz * H.ahead;
      uLampA.value.set(bx + sx * H.offset, lampY, bz + sz * H.offset);
      uLampB.value.set(bx - sx * H.offset, lampY, bz - sz * H.offset);
      const a = H.tilt - this.pitch;              // down from the deck plane
      const ca = Math.cos(a);
      uLampDir.value.set(fx * ca, -Math.sin(a), fz * ca);
      /* the SWITCH is here; the SUPPLY is not. main.js multiplies this by the
         bus level, so the lamps sag and chatter with the load the suspension
         is generating. One writer for uLampPower, and it is not this file. */
    }

    return {
      speed: Math.abs(this.speed), ground: this.deckY - D.wheelR - D.clearance,
      lamps: this.lamps,
      radius: this.radius, lapse: this.lapse,
      x: this.pos.x, z: this.pos.z, heading: this.heading,
      pitch: this.pitch, roll: this.roll, traction: this.traction,
      grade: climb, odometer: this.odometer, chase: this.chase, boosting,
      lidTilt: this.lidTilt, lidMax: D.lidMax,
      artic: this.artic, travel: D.travel, slam: this.slam, stops: this.stops,
      stroke: this.sus,                   // the eight extensions, metres
      chaseDist: this.chaseDist ?? this.orbitDist,
      wheelContacts: c,
      trackA: [this.pos.x + sx * D.track, this.pos.z + sz * D.track],
      trackB: [this.pos.x - sx * D.track, this.pos.z - sz * D.track],
    };
  }

  /**
   * CHASE — an orbit, terrain-aware, damped.
   *
   *   · the drag orbits, so the probe can be seen from any side while moving;
   *   · the boom is pulled in if the ground blocks the line of sight, which is
   *     the difference between a chase camera and a camera inside a hill;
   *   · the eye is floored above the terrain beneath it, for the same reason;
   *   · the whole thing is damped, so it reads as a camera following a machine
   *     rather than one welded to it — and the lag is what makes the motion
   *     legible at all.
   */
  placeChase(dt) {
    const aim = this._aim.setFromMatrixPosition(this.head.matrixWorld);
    aim.y = this.deckY + 0.25;

    /* clamped HERE, not only in the drag handler: whoever sets the orbit —
       a pointer, a scripted sweep, a future shortcut key — must not be able
       to put the camera under the deck or straight overhead. */
    const pitch = clamp(this.orbitPitch, D.orbitPitch[0], D.orbitPitch[1]);
    const want = clamp(this.orbitDist, D.orbitDist[0], D.orbitDist[1]);
    const yaw = this.heading + this.orbitYaw;
    const cp = Math.cos(pitch);
    const dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;

    /* March out along the boom and stop short of anything solid. Starting at
       15 % and stepping finely matters: a coarse first sample lets the eye sit
       inside a bank on steep ground, which is the difference between a chase
       camera and a camera in a hill. */
    let dist = want;
    for (let t = 0.15; t <= 1.0; t += 0.085) {
      const d = want * t;
      if (this.h(aim.x + dx * d, aim.z + dz * d) + D.camClear > aim.y + dy * d) {
        dist = Math.max(D.orbitDist[0], want * (t - 0.085));
        break;
      }
    }

    const p = this._want.set(aim.x + dx * dist, aim.y + dy * dist, aim.z + dz * dist);
    /* and a floor regardless, for the case where the boom was never blocked
       but the ground beneath the eye still rose above it */
    p.y = Math.max(p.y, this.h(p.x, p.z) + D.camClear);

    if (this.camAt.lengthSq() === 0) this.camAt.copy(p);
    this.camAt.lerp(p, Math.min(1, dt * D.camDamp));

    /* THE INVARIANTS BELONG AFTER THE DAMPING, NOT BEFORE IT.
       Clamping only the target is not enough: the eye lags a moving target, so
       a sweep of the whole orbit range measured 0.80 m of clearance against a
       0.85 m floor and a 2.1 m boom against a 2.6 m minimum. Both were the lag,
       not the maths. Enforced on the damped position they cannot be violated
       at all — and the cost is two lines. */
    this.camAt.y = Math.max(this.camAt.y, this.h(this.camAt.x, this.camAt.z) + D.camClear);
    const ax = this.camAt.x - aim.x, ay = this.camAt.y - aim.y, az = this.camAt.z - aim.z;
    const len = Math.hypot(ax, ay, az);
    if (len > 1e-4 && len < D.orbitDist[0]) {
      const k = D.orbitDist[0] / len;
      this.camAt.set(aim.x + ax * k, aim.y + ay * k, aim.z + az * k);
      this.camAt.y = Math.max(this.camAt.y, this.h(this.camAt.x, this.camAt.z) + D.camClear);
    }

    this.camera.position.copy(this.camAt);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(aim);
    this.chaseDist = this.camAt.distanceTo(aim);
  }

  reset(x, z, heading = 0) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.lookYaw = 0; this.lookPitch = -0.04;
    this.speed = 0; this.odometer = 0;
    this.settled = false;
    this.sus.fill(0); this.susV.fill(0); this.slam = 0; this.stops = 0;
    this.deckV = 0; this.pitchV = 0; this.rollV = 0;
    this.camAt.set(0, 0, 0);
    this.orbitYaw = 0; this.orbitPitch = 0.30;
    this.lidTilt = 0;
    this.transmitting = false;
    this.missionHold = false;
    this.auto = true;
  }
}

/* ── the machine ──────────────────────────────────────────────────────────
   A compact expedition vehicle: armoured modular hull, exposed independent
   suspension, forward navigation cluster, sampling arm and a raised solar
   array. The reference vehicle is six-wheeled; this one keeps the physically
   measured eight contacts that define its ride and translates the reference's
   engineering language rather than copying its axle count.

   There is deliberately no RTG. This mission's only source is sunlight, so
   the rear module is thermal control and avionics. Every visible system still
   belongs to the work's actual model: wheels carry load, the array charges,
   lamps illuminate and the arm marks the machine as a survey instrument.

   Static detail is merged per material while articulated and transfer-stage
   parts stay separate. Shading uses the same raking sun as the ground: this
   world contains no lights, and a lit material would render black besides.
   ───────────────────────────────────────────────────────────────────────── */

/** A minimal geometry merger. BufferGeometryUtils would do it, and is an
    addon; this needs about twenty lines of it. */
function Merged() {
  const parts = [];
  return {
    add(geo, matrix) { parts.push(geo.clone().applyMatrix4(matrix)); return this; },
    build() {
      let vc = 0, ic = 0;
      for (const g of parts) {
        vc += g.attributes.position.count;
        ic += g.index ? g.index.count : g.attributes.position.count;
      }
      const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3);
      const idx = new Uint32Array(ic);
      let vo = 0, io = 0;
      for (const g of parts) {
        pos.set(g.attributes.position.array, vo * 3);
        nrm.set(g.attributes.normal.array, vo * 3);
        const n = g.attributes.position.count;
        if (g.index) {
          const gi = g.index.array;
          for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
          io += gi.length;
        } else {
          for (let i = 0; i < n; i++) idx[io + i] = vo + i;
          io += n;
        }
        vo += n;
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      return out;
    },
  };
}

const xf = (p, r = [0, 0, 0], s = [1, 1, 1]) => new THREE.Matrix4().compose(
  new THREE.Vector3(...p),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
  new THREE.Vector3(...s));

/** One wheel, built once and shared by all eight. Axle along local X. */
function buildWheel() {
  const R = D.wheelR, W = D.wheelW;
  const m = Merged();

  /* the drum — open-ended, so it reads as mesh rather than as a solid tyre */
  const drum = new THREE.CylinderGeometry(R * 0.88, R * 0.88, W, 22, 1, true);
  m.add(drum, xf([0, 0, 0], [0, 0, Math.PI / 2]));

  /* recessed sidewalls give the wheel a pneumatic/mesh construction instead
     of the silhouette of a primitive cylinder. */
  const sidewall = new THREE.TorusGeometry(R * 0.76, R * 0.035, 5, 22);
  m.add(sidewall, xf([-W * 0.49, 0, 0], [0, Math.PI / 2, 0]));
  m.add(sidewall, xf([ W * 0.49, 0, 0], [0, Math.PI / 2, 0]));

  /* rim hoops at both edges */
  const hoop = new THREE.TorusGeometry(R * 0.98, R * 0.05, 5, 26);
  m.add(hoop, xf([-W / 2, 0, 0], [0, Math.PI / 2, 0]));
  m.add(hoop, xf([ W / 2, 0, 0], [0, Math.PI / 2, 0]));

  /* grousers — the cleats that do the work in loose regolith */
  const g = new THREE.BoxGeometry(W * 0.96, R * 0.075, R * 0.18);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    /* alternating chevrons shed regolith rather than reading as a smooth tyre */
    m.add(g, xf([0, Math.sin(a) * R * 0.96, Math.cos(a) * R * 0.96], [-a, 0, (i & 1 ? 0.16 : -0.16)]));
  }

  /* hub and spokes */
  m.add(new THREE.CylinderGeometry(R * 0.24, R * 0.24, W * 1.18, 12),
        xf([0, 0, 0], [0, 0, Math.PI / 2]));
  m.add(new THREE.CylinderGeometry(R * 0.11, R * 0.11, W * 1.27, 12),
        xf([0, 0, 0], [0, 0, Math.PI / 2]));
  const spoke = new THREE.BoxGeometry(W * 0.10, R * 0.66, R * 0.055);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m.add(spoke, xf(
        [side * W * 0.54, Math.sin(a) * R * 0.55, Math.cos(a) * R * 0.55],
        [-a, 0, 0]));
    }
  }
  return m.build();
}

/** Low armoured prism: narrow and lowered at the nose, full section aft. */
function wedgeGeometry(width, height, length, frontScale = 0.72) {
  const wb = width * 0.5, wf = wb * frontScale;
  const y0 = -height * 0.5, y1 = height * 0.5, yf = height * 0.12;
  const zf = -length * 0.5, zb = length * 0.5;
  const p = new Float32Array([
    -wf,y0,zf,  wf,y0,zf,  -wf,yf,zf,  wf,yf,zf,
    -wb,y0,zb,  wb,y0,zb,  -wb,y1,zb,  wb,y1,zb,
  ]);
  const i = new Uint16Array([
    0,1,3, 0,3,2,     4,6,7, 4,7,5,
    0,2,6, 0,6,4,     1,5,7, 1,7,3,
    2,3,7, 2,7,6,     0,4,5, 0,5,1,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(new THREE.BufferAttribute(i, 1));
  g.computeVertexNormals();
  return g;
}

/** Compact visible coil around the working damper. */
function buildCoil() {
  const m = Merged();
  const ring = new THREE.TorusGeometry(0.050, 0.007, 5, 12);
  for (let i = 0; i < 7; i++)
    m.add(ring, xf([0, -0.12 + i * 0.04, 0], [Math.PI / 2, 0, 0]));
  return m.build();
}

function cylinderBetween(a, b, radius, material, radial = 9) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const dir = bv.clone().sub(av), len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial), material);
  mesh.position.copy(av).add(bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function buildRover() {
  const C = cfg();
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const L = normalize(vec3(...C.sun));
  const paint = (rgb, emissive = 0) => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = Fn(() => {
      const n = normalize(normalWorld);
      const ndl = abs(dot(n, L));
      const lit = vec3(...rgb).mul(ndl.mul(1.35).add(0.085))
        .add(vec3(...C.color.crimson).mul(emissive));
      const fog = float(1.0).sub(exp(positionView.length().mul(-C.atmosphere.fogDensity)));
      return vec4(mix(lit, vec3(...C.color.horizon), ss(0.0, 1.0, fog)), 1.0);
    })();
    return mat;
  };

  const hull = paint([0.095, 0.101, 0.111]);
  const dark = paint([0.022, 0.023, 0.027]);
  const metal = paint([0.190, 0.198, 0.208]);
  const armour = paint([0.135, 0.139, 0.145]);
  /* cold photovoltaic glass: distinct from the graphite armour without
     introducing a decorative colour outside the work's restrained palette. */
  const cell = paint([0.025, 0.048, 0.068]);
  const mark = paint(C.color.crimson, 0.85);
  const transferTag = (object, part, colour, rig = false) => {
    object.userData.transferPart = part;
    if (colour != null) object.userData.transferColor = colour;
    if (rig) object.userData.transferRig = true;
    return object;
  };
  chassis.userData.transferChassis = true;

  const deck = 0;                       // chassis origin sits at deck level

  /* ── the tub ───────────────────────────────────────────────────────── */
  const W = D.track * 2, LEN = D.wheelBase * 2;
  const tub = Merged();
  tub.add(new THREE.BoxGeometry(W * 0.84, 0.34, LEN * 0.58), xf([0, deck + 0.03, LEN * 0.09]));
  tub.add(wedgeGeometry(W * 0.84, 0.34, LEN * 0.43), xf([0, deck + 0.03, -LEN * 0.35]));
  tub.add(new THREE.BoxGeometry(W * 0.66, 0.10, LEN * 0.94), xf([0, deck - 0.17, 0]));
  /* side armour / payload rails make the body read as replaceable modules. */
  for (const side of [-1, 1]) {
    tub.add(new THREE.BoxGeometry(0.11, 0.24, LEN * 0.48), xf([side * W * 0.455, deck + 0.015, LEN * 0.09]));
    tub.add(new THREE.BoxGeometry(0.055, 0.09, LEN * 1.10), xf([side * D.track * 0.80, deck - 0.19, 0]));
  }
  /* bumpers and side rails break the “single box” silhouette and protect the
     low deck at exactly the points that meet terrain first. */
  tub.add(new THREE.BoxGeometry(W * 0.78, 0.10, 0.10), xf([0, deck - 0.10, -LEN * 0.57]));
  tub.add(new THREE.BoxGeometry(W * 0.70, 0.10, 0.08), xf([0, deck - 0.10, LEN * 0.51]));
  const tubMesh = new THREE.Mesh(tub.build(), hull);
  tubMesh.userData.designRole = 'armoured-hull';
  chassis.add(tubMesh);

  /* Faceted side access plates and ventilation slots. They are shallow
     geometry, not texture, so raking light reveals them at exhibition scale. */
  const access = Merged();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++)
      access.add(new THREE.BoxGeometry(0.014, 0.024, 0.16),
        xf([side * W * 0.515, deck + 0.055 + i * 0.045, LEN * 0.15], [0, 0, 0]));
    access.add(new THREE.BoxGeometry(0.015, 0.18, 0.26),
      xf([side * W * 0.515, deck + 0.02, LEN * 0.35]));
  }
  chassis.add(transferTag(new THREE.Mesh(access.build(), metal), 'body', 0x9aa1a8));

  /* ── suspension and the wheels ─────────────────────────────────────────
     Each wheel is its own mesh with its own vertical stroke, and each carries
     a strut that stretches with it. The order below matches the physics
     array exactly — front→rear, left→right — because `rover.sus[i]` indexes
     straight into `wheels[i]`, and a mismatch would put the near-side stroke
     on the far side without any error at all. */
  const wheelGeo = buildWheel();
  const strutGeo = new THREE.BoxGeometry(0.05, 0.30, 0.07);
  const hubGeo = new THREE.BoxGeometry(D.track * 0.38, 0.05, 0.06);
  const rockerGeo = new THREE.BoxGeometry(D.track * 0.34, 0.055, 0.075);
  const shockGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.34, 9);
  const coilGeo = buildCoil();
  const fenderGeo = new THREE.TorusGeometry(D.wheelR * 1.12, 0.025, 5, 18, Math.PI);
  const wheels = [];
  for (const dz of D.axles) {
    for (const dx of [-D.track, D.track]) {
      /* D.axles measures FORWARD from centre and the nose is local −Z, so the
         mesh sits at −dz. Getting this wrong is invisible on a symmetric
         layout right up until `sus[i]` drives `wheels[i]`, and then the front
         stroke appears on the rear wheels. */
      const lz = -dz;
      const w = new THREE.Mesh(wheelGeo, dark);
      const restY = deck - D.clearance;
      w.position.set(dx, restY, lz);
      chassis.add(w);

      const strut = new THREE.Mesh(strutGeo, hull);
      strut.position.set(dx * 0.84, deck - 0.15, lz);
      chassis.add(strut);

      const hub = new THREE.Mesh(hubGeo, hull);
      hub.position.set(dx * 0.88, restY, lz);
      chassis.add(hub);

      const rocker = new THREE.Mesh(rockerGeo, metal);
      rocker.position.set(dx * 0.86, deck - 0.27, lz);
      chassis.add(rocker);

      const shock = new THREE.Mesh(shockGeo, dark);
      const springY = deck - 0.30;
      shock.position.set(dx * 0.75, springY, lz + (lz < 0 ? 0.10 : -0.10));
      shock.rotation.z = dx < 0 ? -0.28 : 0.28;
      chassis.add(shock);

      const coil = new THREE.Mesh(coilGeo, metal);
      coil.position.copy(shock.position);
      coil.rotation.copy(shock.rotation);
      coil.userData.designRole = 'suspension-coil';
      chassis.add(coil);

      const fender = new THREE.Mesh(fenderGeo, hull);
      fender.position.set(dx, deck - D.clearance + D.wheelR * 0.20, lz);
      fender.rotation.y = Math.PI / 2;
      chassis.add(fender);

      transferTag(w, 'wheel', 0x242529, true);
      transferTag(strut, 'wheel', 0x697079, true);
      transferTag(hub, 'wheel', 0x697079, true);
      transferTag(rocker, 'wheel', 0x9aa1a8, true);
      transferTag(shock, 'wheel', 0x242529, true);
      transferTag(coil, 'wheel', 0x9aa1a8, true);
      transferTag(fender, 'wheel', 0x697079, true);

      Object.assign(w.userData, {
        restY, arm: strut, armY: deck - 0.15, hub,
        spring: coil, shock, springY,
      });
      wheels.push(w);
    }
  }

  /* ── the solar lid ─────────────────────────────────────────────────────
     A child group hinged at the NOSE edge. `rover.lidTilt` drives its
     rotation, and the same angle enters the power budget as the array's
     pitch — the panel you see is the panel being charged. */
  /* Articulated pedestal holds the array above the instrument deck. */
  const panelRig = transferTag(new THREE.Group(), 'panel', 0x9aa1a8, true);
  panelRig.userData.designRole = 'solar-gimbal';
  for (const x of [-0.20, 0.20]) {
    panelRig.add(cylinderBetween([x, deck + 0.18, 0.18], [x, deck + 0.72, -D.lidLen * 0.50], 0.027, metal));
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 12), dark);
    joint.position.set(x, deck + 0.72, -D.lidLen * 0.50);
    joint.rotation.z = Math.PI / 2;
    panelRig.add(joint);
  }
  chassis.add(panelRig);

  const lid = new THREE.Group();
  transferTag(lid, 'panel', null, true);
  lid.userData.designRole = 'solar-array';
  lid.position.set(0, deck + 0.72, -D.lidLen / 2);
  chassis.add(lid);

  const frame = Merged();
  frame.add(new THREE.BoxGeometry(D.lidWidth, 0.035, D.lidLen), xf([0, 0, D.lidLen / 2]));
  lid.add(transferTag(new THREE.Mesh(frame.build(), hull), 'panel', 0x697079));

  const array = Merged();
  for (let i = 0; i < 4; i++)
    array.add(new THREE.BoxGeometry(D.lidWidth * 0.94, 0.011, D.lidLen * 0.205),
              xf([0, 0.024, D.lidLen * (0.135 + i * 0.243)]));
  lid.add(transferTag(new THREE.Mesh(array.build(), cell), 'panel', 0x6b5235));

  /* panel seams and edge rails: small enough to preserve the spare language,
     dense enough that the array reads as engineered rather than painted on. */
  const arrayDetail = Merged();
  for (let i = 1; i < 8; i++)
    arrayDetail.add(new THREE.BoxGeometry(D.lidWidth * 0.94, 0.010, 0.012),
      xf([0, 0.032, D.lidLen * (i / 8)]));
  for (const side of [-1, -0.5, 0, 0.5, 1])
    arrayDetail.add(new THREE.BoxGeometry(0.022, 0.020, D.lidLen * 0.93),
      xf([side * D.lidWidth * 0.47, 0.033, D.lidLen * 0.50]));
  lid.add(transferTag(new THREE.Mesh(arrayDetail.build(), dark), 'panel', 0x242529));

  /* Fold-out solar wings turn the charging surface into a visible mechanism.
     They remain low and broad when deployed, then tuck beside the central lid
     as the operator tilts the array toward the sun. */
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.userData.side = side;
    wing.position.set(side * D.lidWidth * 0.49, 0.020, D.lidLen * 0.50);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(D.lidWidth * 0.50, 0.014, D.lidLen * 0.78), cell);
    panel.position.set(side * D.lidWidth * 0.25, 0, 0);
    wing.add(transferTag(panel, 'panel', 0x6b5235));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.026, D.lidLen * 0.84), dark);
    rail.position.set(side * D.lidWidth * 0.49, 0.012, 0);
    wing.add(transferTag(rail, 'panel', 0x242529));
    lid.add(wing);
    wings.push(wing);
  }

  /* rear thermal-control / avionics pod — explicitly not an RTG. */
  const avionics = new THREE.Mesh(new THREE.BoxGeometry(W * 0.58, 0.25, LEN * 0.25), armour);
  avionics.position.set(0, deck + 0.30, LEN * 0.34);
  avionics.userData.designRole = 'avionics-pod';
  chassis.add(transferTag(avionics, 'body', 0x697079));

  /* thermal radiator at the rear: fins reveal a functional spacecraft
     surface and catch the raking light without adding colour. */
  const radiator = Merged();
  for (let i = 0; i < 8; i++)
    radiator.add(new THREE.BoxGeometry(0.055, 0.13, 0.018),
      xf([-0.23 + i * 0.066, deck + 0.44, LEN * 0.43]));
  chassis.add(transferTag(new THREE.Mesh(radiator.build(), dark), 'body', 0x242529));

  /* deployable sampling arm, asymmetrical by function rather than ornament. */
  const arm = transferTag(new THREE.Group(), 'body', 0x9aa1a8, true);
  arm.userData.designRole = 'sample-arm';
  arm.position.set(-W * 0.44, deck - 0.01, -LEN * 0.18);
  const armPts = [
    [0, 0, 0], [-0.16, 0.08, -0.28], [-0.12, -0.14, -0.58], [-0.03, -0.25, -0.82],
  ];
  for (let i = 0; i < armPts.length - 1; i++) {
    arm.add(cylinderBetween(armPts[i], armPts[i + 1], i === 0 ? 0.038 : 0.030, metal, 10));
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.060 - i * 0.006, 0.060 - i * 0.006, 0.055, 12), dark);
    joint.position.set(...armPts[i]); joint.rotation.z = Math.PI / 2; arm.add(joint);
  }
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.047, 0.10, 10), dark);
  wrist.position.set(...armPts.at(-1)); wrist.rotation.x = Math.PI / 2; arm.add(wrist);
  for (const side of [-1, 1]) {
    const tine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 0.19), metal);
    tine.position.set(armPts.at(-1)[0] + side * 0.034, armPts.at(-1)[1] - 0.015, armPts.at(-1)[2] - 0.08);
    tine.rotation.y = side * 0.16; arm.add(tine);
  }
  chassis.add(arm);

  /* ── forward navigation cluster: stereo cameras + elevated lidar ──── */
  const tower = Merged();
  tower.add(new THREE.BoxGeometry(0.26, D.camY - 0.15, 0.21), xf([0, deck + 0.17 + (D.camY - 0.15) / 2, D.camZ + 0.09]));
  tower.add(new THREE.BoxGeometry(0.46, 0.18, 0.20), xf([0, deck + D.camY, D.camZ]));
  const towerMesh = transferTag(new THREE.Mesh(tower.build(), hull), 'signal', 0x697079, true);
  chassis.add(towerMesh);

  const lidar = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.15), armour);
  lidar.position.set(0, deck + D.camY + 0.16, D.camZ + 0.015);
  lidar.userData.designRole = 'lidar-cluster';
  chassis.add(transferTag(lidar, 'signal', 0x697079, true));

  /* a high-gain dish and instrument canister give the rover a readable
     mission profile in chase view; both are mechanically mounted to the deck. */
  const dishStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.034, 0.36, 10), metal);
  dishStem.position.set(0.28, deck + 0.34, 0.24);
  dishStem.rotation.z = -0.18;
  chassis.add(transferTag(dishStem, 'signal', 0x9aa1a8, true));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), metal);
  dish.position.set(0.24, deck + 0.52, 0.22);
  dish.rotation.x = -0.88;
  chassis.add(transferTag(dish, 'signal', 0x9aa1a8, true));
  const instrument = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.21, 12), dark);
  instrument.position.set(-0.30, deck + 0.29, 0.27);
  instrument.rotation.z = Math.PI / 2;
  chassis.add(transferTag(instrument, 'signal', 0x242529, true));

  const glass = new THREE.MeshBasicNodeMaterial();
  glass.colorNode = vec4(vec3(...C.color.dust).mul(0.55), 1.0);
  const lensGeo = new THREE.CylinderGeometry(0.047, 0.047, 0.04, 14);
  for (const sx of [-0.135, 0.135]) {
    const l = new THREE.Mesh(lensGeo, glass);
    l.rotation.x = Math.PI / 2;
    l.position.set(sx, deck + D.camY, D.camZ - 0.11);
    chassis.add(transferTag(l, 'signal', 0x8793a5, true));
  }
  const lidarLens = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.060, 0.042, 16), glass);
  lidarLens.rotation.x = Math.PI / 2;
  lidarLens.position.set(0, deck + D.camY + 0.16, D.camZ - 0.067);
  chassis.add(transferTag(lidarLens, 'signal', 0x8793a5, true));

  /* short redundant comms whips: quiet silhouette, no unsupported dish-scale
     communication claim. */
  for (const x of [-0.38, 0.38]) {
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.38, 7), dark);
    whip.position.set(x, deck + 0.40, LEN * 0.16);
    whip.rotation.z = x < 0 ? -0.10 : 0.10;
    chassis.add(transferTag(whip, 'signal', 0x242529, true));
  }

  /* ── lamps: low slit housings in the nose, below the camera ────────── */
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = vec4(vec3(...C.headlight.colour).mul(1.9), 1.0);
  const canGeo = new THREE.BoxGeometry(0.16, 0.065, 0.10);
  const lensG = new THREE.PlaneGeometry(0.125, 0.032);
  for (const sgn of [-1, 1]) {
    const can = new THREE.Mesh(canGeo, hull);
    can.position.set(sgn * C.headlight.offset, deck + C.headlight.rise - 0.30, -LEN * 0.46);
    chassis.add(transferTag(can, 'body', 0x697079));
    const le = new THREE.Mesh(lensG, glow);
    le.position.set(sgn * C.headlight.offset, deck + C.headlight.rise - 0.30, -LEN * 0.49);
    le.rotation.y = Math.PI;
    chassis.add(transferTag(le, 'body', 0xd8d5c2));
  }

  /* identity mark — the only crimson on the machine */
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.34), mark);
  stripe.position.set(-W * 0.42, deck + 0.02, -0.26);
  chassis.add(transferTag(stripe, 'body', 0xc0152a));

  /* the camera's own transform. Local −Z is the nose, which is also the
     camera's default forward — no correction needed. */
  const head = new THREE.Object3D();
  head.position.set(0, deck + D.camY, D.camZ - 0.13);
  chassis.add(head);

  group.frustumCulled = false;
  return { group, chassis, head, wheels, lid, wings };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
