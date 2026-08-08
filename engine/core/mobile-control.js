/**
 * Mobile rover controls.
 *
 * The vehicle remains autonomous: device orientation bends the route, while
 * its elevation is a simple two-state run / park control. A phone held
 * upright parks the rover; laid forward it releases a modest cruise gain.
 */
export class MobileControl {
  constructor(rover) {
    this.rover = rover;
    this.active = navigator.maxTouchPoints > 0
      && (matchMedia('(pointer:coarse)').matches || matchMedia('(hover:none)').matches);
    this.root = document.getElementById('ti-mobile-drive');
    this.start = document.getElementById('ti-mobile-start');
    this.tilt = document.getElementById('ti-mobile-tilt');
    this.toggle = document.getElementById('ti-mobile-toggle');
    this.sensorLabel = document.getElementById('ti-mobile-sensor');
    this.driveLabel = document.getElementById('ti-mobile-state');
    this.driveHint = document.getElementById('ti-mobile-hint');
    this.signal = document.getElementById('ti-mobile-signal');

    this.permission = 'idle';
    this.listening = false;
    this.calibrating = false;
    this.samples = [];
    this.neutral = 0;
    this.rawSteer = 0;
    this.filteredSteer = 0;
    this.rawThrottle = 1;
    this.filteredThrottle = 1;
    this.tiltParked = false;
    this.lastSample = -Infinity;
    this.lastUi = '';
    this.longPress = false;
    this.pressTimer = 0;

    this.onOrientation = e => this._orientation(e);
    this.onScreenChange = () => this.recalibrate();
    this.onVisibility = () => {
      if (document.visibilityState === 'hidden') this._zero();
      else if (this.permission === 'granted') this.recalibrate();
    };

    if (!this.active) return;
    document.body.classList.add('ti-mobile');
    rover.setMobileMode(true);
    this._bindControls();
    screen.orientation?.addEventListener?.('change', this.onScreenChange);
    addEventListener('orientationchange', this.onScreenChange);
    document.addEventListener('visibilitychange', this.onVisibility);
    addEventListener('pagehide', () => this._zero());
    addEventListener('pageshow', () => this.recalibrate());
    this._syncUi(false, false, false);
  }

  bindStart(release) {
    if (!this.active || !this.start) return;
    this.start.addEventListener('pointerdown', e => e.stopPropagation());
    this.start.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      /* On iOS this call must happen inside the click's transient activation.
         Do not await it before starting the autonomous mission. */
      this.requestTilt();
      release();
    });
  }

  _bindControls() {
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    this.tilt?.addEventListener('pointerdown', stop);
    this.tilt?.addEventListener('click', e => {
      stop(e);
      if (this.permission === 'granted') this.recalibrate();
      else if (this.permission !== 'denied' && this.permission !== 'unavailable') this.requestTilt();
    });

    this.toggle?.addEventListener('pointerdown', e => {
      stop(e);
      this.longPress = false;
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => {
        this.longPress = true;
        if (this.permission === 'granted') this.recalibrate();
      }, 700);
    });
    const finish = e => {
      stop(e);
      clearTimeout(this.pressTimer);
      if (!this.longPress && !this.toggle?.disabled) {
        this.rover.operatorHold = !this.rover.operatorHold;
        this.rover.mobileSteer = 0;
        this.filteredSteer = 0;
      }
      this.longPress = false;
    };
    this.toggle?.addEventListener('pointerup', finish);
    this.toggle?.addEventListener('pointercancel', e => {
      stop(e); clearTimeout(this.pressTimer); this.longPress = false;
    });
  }

  async requestTilt() {
    if (!this.active || this.permission === 'pending' || this.permission === 'granted') return;
    const Orientation = window.DeviceOrientationEvent;
    if (!Orientation || !isSecureContext) {
      this.permission = 'unavailable';
      this._syncUi(false, false, false);
      return;
    }
    this.permission = 'pending';
    this._syncUi(false, false, false);
    try {
      if (typeof Orientation.requestPermission === 'function') {
        const result = await Orientation.requestPermission();
        if (result !== 'granted') {
          this.permission = 'denied';
          this._syncUi(false, false, false);
          return;
        }
      }
      this.permission = 'granted';
      if (!this.listening) {
        addEventListener('deviceorientation', this.onOrientation, { passive: true });
        this.listening = true;
      }
      this.recalibrate();
    } catch {
      this.permission = 'denied';
      this._zero();
    }
    this._syncUi(false, false, false);
  }

  recalibrate() {
    if (!this.active || this.permission !== 'granted') return;
    this.calibrating = true;
    this.samples.length = 0;
    this._zero();
    this._syncUi(false, false, false);
  }

  _screenRoll(beta, gamma) {
    const degrees = Number(screen.orientation?.angle ?? window.orientation ?? 0);
    const a = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
    /* Canvas screen-right must remain rover-right after rotation. The former
       negative beta term was correct in portrait but mirrored both landscape
       orientations. */
    return gamma * Math.cos(a) + beta * Math.sin(a);
  }

  _screenElevation(beta, gamma) {
    const degrees = Number(screen.orientation?.angle ?? window.orientation ?? 0);
    const a = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
    /* Elevation is unsigned: a device standing on either portrait/landscape
       edge is parked, while a device laid forward is released to drive. */
    return Math.min(90, Math.abs(beta * Math.cos(a) - gamma * Math.sin(a)));
  }

  _orientation(e) {
    const beta = Number(e.beta), gamma = Number(e.gamma);
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const roll = this._screenRoll(beta, gamma);
    if (!Number.isFinite(roll)) return;
    const elevation = this._screenElevation(beta, gamma);
    if (!Number.isFinite(elevation)) return;
    this.lastSample = performance.now();
    if (this.calibrating) {
      this.samples.push(roll);
      if (this.samples.length >= 20) {
        this.samples.sort((a, b) => a - b);
        this.neutral = (this.samples[9] + this.samples[10]) * 0.5;
        this.samples.length = 0;
        this.calibrating = false;
      }
      this.rawSteer = 0;
      return;
    }
    /* Hysteresis prevents a hand-held phone near vertical from chattering
       between PARK and RUN. RUN is intentionally only a small gain over the
       autonomous pace, not a separate manual-driving mode. */
    if (this.tiltParked ? elevation <= 68 : elevation >= 80) {
      this.tiltParked = elevation >= 80;
    }
    this.rawThrottle = this.tiltParked ? 0 : 1.15;
    let delta = roll - this.neutral;
    delta = ((delta + 180) % 360 + 360) % 360 - 180;
    const magnitude = Math.abs(delta);
    if (magnitude <= 5) { this.rawSteer = 0; return; }
    const t = Math.min(1, (magnitude - 5) / 19);
    const response = t * t * (3 - 2 * t);
    /* Rover steer is positive-left, so screen-right tilt is negative. */
    this.rawSteer = -Math.sign(delta) * response * 0.72;
  }

  _zero() {
    this.rawSteer = 0;
    this.filteredSteer = 0;
    this.rover.mobileSteer = 0;
  }

  update(now, dt, { released = false, blocked = false, missionHold = false } = {}) {
    if (!this.active) return;
    const usable = this.permission === 'granted' && !this.calibrating
      && now - this.lastSample <= 700 && released && !blocked
      && !missionHold && !this.rover.operatorHold;
    const target = usable ? this.rawSteer : 0;
    this.filteredSteer += (target - this.filteredSteer) * (1 - Math.exp(-dt / 0.18));
    if (Math.abs(this.filteredSteer) < 0.001) this.filteredSteer = 0;
    this.rover.mobileSteer = this.filteredSteer;
    const throttleTarget = usable ? this.rawThrottle : 1;
    this.filteredThrottle += (throttleTarget - this.filteredThrottle) * (1 - Math.exp(-dt / 0.22));
    if (Math.abs(this.filteredThrottle - throttleTarget) < 0.002) this.filteredThrottle = throttleTarget;
    this.rover.mobileThrottle = this.rover.operatorHold || missionHold || blocked ? 0 : this.filteredThrottle;
    this._syncUi(blocked, missionHold, released);
  }

  syncSignal() {
    if (!this.active || !this.signal) return;
    const level = Math.max(0, Math.min(1, this.rover.beaconLevel || 0));
    this.signal.style.opacity = String(0.18 + level * 0.82);
    this.signal.style.transform = `scale(${(0.88 + level * 0.22).toFixed(3)})`;
  }

  reset() {
    if (!this.active) return;
    this.rover.operatorHold = false;
    this._zero();
    this.rawThrottle = 1;
    this.filteredThrottle = 1;
    this.tiltParked = false;
    this.rover.mobileThrottle = 1;
    if (this.permission === 'granted') this.recalibrate();
    this._syncUi(false, false, false);
  }

  _syncUi(blocked, missionHold, released) {
    if (!this.active) return;
    const sensor = this.permission === 'granted'
      ? (this.calibrating ? 'CALIBRATING · 수평 유지' : 'TILT READY · 기울여 조향 / 세우면 정지')
      : this.permission === 'pending' ? 'REQUESTING SENSOR'
      : this.permission === 'denied' ? 'AUTO COURSE · 센서 거절됨'
      : this.permission === 'unavailable' ? 'AUTO COURSE · 센서 미지원'
      : 'ENABLE TILT · 기울기 조향';
    const state = blocked ? 'LINK SEQUENCE'
      : missionHold ? 'SURVEYING'
      : this.rover.operatorHold ? 'HOLD'
      : this.tiltParked ? 'TILT PARK'
      : released ? 'AUTO DRIVE' : 'STANDBY';
    const hint = blocked ? '원격 몸체 연결 중'
      : missionHold ? '자동 측량 후 주행 재개'
      : this.rover.operatorHold ? '탭하여 탐사 재개'
      : this.tiltParked ? '기울이면 출발'
      : '세우면 정지 · 탭하여 일시 정지';
    const key = `${sensor}|${state}|${hint}|${blocked}`;
    if (key === this.lastUi) return;
    this.lastUi = key;
    if (this.sensorLabel) this.sensorLabel.textContent = sensor;
    if (this.driveLabel) this.driveLabel.textContent = state;
    if (this.driveHint) this.driveHint.textContent = hint;
    if (this.toggle) {
      this.toggle.disabled = blocked || missionHold || !released;
      this.toggle.setAttribute('aria-pressed', String(this.rover.operatorHold));
    }
    if (this.tilt) {
      this.tilt.setAttribute('aria-pressed', String(this.permission === 'granted'));
      this.tilt.disabled = this.permission === 'pending'
        || this.permission === 'denied' || this.permission === 'unavailable';
    }
  }
}
