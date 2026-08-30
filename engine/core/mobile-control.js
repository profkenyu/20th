export class MobileControl {
  constructor(rover) {
    this.rover = rover;
    this.active = navigator.maxTouchPoints > 0 && (matchMedia("(any-pointer:coarse)").matches || matchMedia("(hover:none)").matches);
    this.root = document.getElementById("ti-mobile-drive");
    this.start = document.getElementById("ti-mobile-start");
    this.tilt = document.getElementById("ti-mobile-tilt");
    this.steer = document.getElementById("ti-mobile-steer");
    this.toggle = document.getElementById("ti-mobile-toggle");
    this.sensorLabel = document.getElementById("ti-mobile-sensor");
    this.driveLabel = document.getElementById("ti-mobile-state");
    this.driveHint = document.getElementById("ti-mobile-hint");
    this.signal = document.getElementById("ti-mobile-signal");
    this.permission = "idle";
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
    this.lastUi = "";
    this.longPress = false;
    this.pressTimer = 0;
    this.explorer = false;
    this.dragging = false;
    this.dragSteer = 0;
    this.onIntent = null;
    this.lastIntentRoll = 0;
    this.lastIntentElevation = 0;
    this.onOrientation = (e) => this._orientation(e);
    this.onScreenChange = () => this.recalibrate();
    this.onVisibility = () => {
      if (document.visibilityState === "hidden") this._zero();
      else if (this.permission === "granted") this.recalibrate();
    };
    if (!this.active) return;
    document.body.classList.add("ti-mobile");
    rover.setMobileMode(true);
    this._bindControls();
    screen.orientation?.addEventListener?.("change", this.onScreenChange);
    addEventListener("orientationchange", this.onScreenChange);
    document.addEventListener("visibilitychange", this.onVisibility);
    addEventListener("pagehide", () => this._zero());
    addEventListener("pageshow", () => this.recalibrate());
    this._syncUi(false, false, false);
  }
  bindStart(release) {
    if (!this.active || !this.start) return;
    this.start.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.start.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      release();
      this.requestTilt();
    });
  }
  _bindControls() {
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this.tilt?.addEventListener("pointerdown", stop);
    this.tilt?.addEventListener("click", (e) => {
      stop(e);
      this._intent("tilt");
      if (this.permission === "granted") this.recalibrate();
      else if (this.permission !== "denied" && this.permission !== "unavailable") this.requestTilt();
    });
    this.steer?.addEventListener("pointerdown", (e) => {
      stop(e);
      if (this.steer.disabled) return;
      this.dragging = true;
      this._intent("drag-steer");
      try {
        this.steer.setPointerCapture?.(e.pointerId);
      } catch {
      }
      this._drag(e);
    });
    this.steer?.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      stop(e);
      this._drag(e);
    });
    const endDrag = (e) => {
      if (!this.dragging) return;
      stop(e);
      this.dragging = false;
      this.dragSteer = 0;
    };
    this.steer?.addEventListener("pointerup", endDrag);
    this.steer?.addEventListener("pointercancel", endDrag);
    this.toggle?.addEventListener("pointerdown", (e) => {
      stop(e);
      this.longPress = false;
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => {
        this.longPress = true;
        if (this.permission === "granted") this.recalibrate();
      }, 700);
    });
    const finish = (e) => {
      stop(e);
      clearTimeout(this.pressTimer);
      if (!this.longPress && !this.toggle?.disabled) {
        const wasExplorer = this.explorer;
        this._intent("drive");
        this.rover.operatorHold = wasExplorer ? !this.rover.operatorHold : false;
        this.rover.mobileSteer = 0;
        this.filteredSteer = 0;
      }
      this.longPress = false;
    };
    this.toggle?.addEventListener("pointerup", finish);
    this.toggle?.addEventListener("pointercancel", (e) => {
      stop(e);
      clearTimeout(this.pressTimer);
      this.longPress = false;
    });
  }
  _intent(kind) {
    this.onIntent?.(kind, performance.now());
  }
  _drag(e) {
    const rect = this.steer?.getBoundingClientRect();
    if (!rect?.width) return;
    const x = (e.clientX - rect.left) / rect.width * 2 - 1;
    this.dragSteer = Math.max(-1, Math.min(1, -x));
    this._intent("drag-motion");
  }
  setExplorer(active) {
    this.explorer = !!active;
    this.rover.mobileInputEnabled = this.explorer;
    if (!this.explorer) {
      this.rover.operatorHold = false;
      this._zero();
      this.dragging = false;
      this.dragSteer = 0;
      this.rawThrottle = 1;
      this.filteredThrottle = 1;
      this.rover.mobileThrottle = 1;
    }
    this.lastUi = "";
    this._syncUi(false, false, true);
  }
  async requestTilt() {
    if (!this.active || this.permission === "pending" || this.permission === "granted") return;
    const Orientation = window.DeviceOrientationEvent;
    if (!Orientation || !isSecureContext) {
      this.permission = "unavailable";
      this._syncUi(false, false, false);
      return;
    }
    this.permission = "pending";
    this._syncUi(false, false, false);
    try {
      if (typeof Orientation.requestPermission === "function") {
        const result = await Orientation.requestPermission();
        if (result !== "granted") {
          this.permission = "denied";
          this._syncUi(false, false, false);
          return;
        }
      }
      this.permission = "granted";
      if (!this.listening) {
        addEventListener("deviceorientation", this.onOrientation, { passive: true });
        this.listening = true;
      }
      this.recalibrate();
    } catch {
      this.permission = "denied";
      this._zero();
    }
    this._syncUi(false, false, false);
  }
  recalibrate() {
    if (!this.active || this.permission !== "granted") return;
    this.calibrating = true;
    this.samples.length = 0;
    this._zero();
    this._syncUi(false, false, false);
  }
  _screenRoll(beta, gamma) {
    const degrees = Number(screen.orientation?.angle ?? window.orientation ?? 0);
    const a = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
    return gamma * Math.cos(a) + beta * Math.sin(a);
  }
  _screenElevation(beta, gamma) {
    const degrees = Number(screen.orientation?.angle ?? window.orientation ?? 0);
    const a = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
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
    if (Math.abs(roll - this.lastIntentRoll) >= 1.5 || Math.abs(elevation - this.lastIntentElevation) >= 2.5) {
      this.lastIntentRoll = roll;
      this.lastIntentElevation = elevation;
      this._intent("tilt-motion");
    }
    if (this.tiltParked ? elevation <= 68 : elevation >= 80) {
      this.tiltParked = elevation >= 80;
    }
    this.rawThrottle = this.tiltParked ? 0 : 1.15;
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
    let delta = roll - this.neutral;
    delta = ((delta + 180) % 360 + 360) % 360 - 180;
    const magnitude = Math.abs(delta);
    if (magnitude <= 8) {
      this.rawSteer = 0;
      return;
    }
    const t = Math.min(1, (magnitude - 8) / 24);
    const response = t * t * (3 - 2 * t);
    this.rawSteer = -Math.sign(delta) * response;
  }
  _zero() {
    this.rawSteer = 0;
    this.filteredSteer = 0;
    this.rover.mobileSteer = 0;
  }
  update(now, dt, { released = false, blocked = false, missionHold = false } = {}) {
    if (!this.active) return;
    const sensorUsable = this.explorer && this.permission === "granted" && !this.calibrating && now - this.lastSample <= 700 && released && !blocked && !missionHold && !this.rover.operatorHold;
    const dragUsable = this.explorer && this.dragging && released && !blocked && !missionHold && !this.rover.operatorHold;
    const usable = sensorUsable || dragUsable;
    const target = dragUsable ? this.dragSteer : sensorUsable ? this.rawSteer : 0;
    this.filteredSteer += (target - this.filteredSteer) * (1 - Math.exp(-dt / 0.34));
    if (Math.abs(this.filteredSteer) < 1e-3) this.filteredSteer = 0;
    const maxWheelAngle = 40 * Math.PI / 180;
    const wheelAngle = this.filteredSteer * maxWheelAngle;
    const steering = wheelAngle / maxWheelAngle * 0.42;
    this.rover.mobileSteer = usable && !this.tiltParked ? steering : 0;
    const sensorOwnsSpeed = this.explorer && this.permission === "granted" && released;
    const throttleTarget = sensorOwnsSpeed ? this.rawThrottle : 1;
    this.filteredThrottle += (throttleTarget - this.filteredThrottle) * (1 - Math.exp(-dt / 0.36));
    if (Math.abs(this.filteredThrottle - throttleTarget) < 2e-3) this.filteredThrottle = throttleTarget;
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
    this.dragging = false;
    this.dragSteer = 0;
    this.rawThrottle = 1;
    this.filteredThrottle = 1;
    this.tiltParked = false;
    this.explorer = false;
    this.rover.mobileInputEnabled = false;
    this.rover.mobileThrottle = 1;
    if (this.permission === "granted") this.recalibrate();
    this._syncUi(false, false, false);
  }
  _syncUi(blocked, missionHold, released) {
    if (!this.active) return;
    const sensor = this.permission === "granted" ? this.calibrating ? "CALIBRATING \xB7 \uC218\uD3C9 \uC720\uC9C0" : "TILT READY \xB7 \uAE30\uC6B8\uC5EC \uC870\uD5A5 / \uC138\uC6B0\uBA74 \uC815\uC9C0" : this.permission === "pending" ? "REQUESTING SENSOR" : this.permission === "denied" ? "DRAG STEER \xB7 \uC13C\uC11C \uAC70\uC808\uB428" : this.permission === "unavailable" ? "DRAG STEER \xB7 \uC13C\uC11C \uBBF8\uC9C0\uC6D0" : "ENABLE TILT \xB7 \uAE30\uC6B8\uAE30 \uC870\uD5A5";
    const state = blocked ? "LINK SEQUENCE" : missionHold ? "SURVEYING" : !this.explorer ? "OBSERVER" : this.rover.operatorHold ? "HOLD" : this.tiltParked ? "TILT PARK" : released ? "EXPLORER" : "STANDBY";
    const hint = blocked ? "\uC6D0\uACA9 \uBAB8\uCCB4 \uC5F0\uACB0 \uC911" : missionHold ? "\uC790\uB3D9 \uCE21\uB7C9 \uD6C4 \uC8FC\uD589 \uC7AC\uAC1C" : !this.explorer ? "\uD0ED\uD558\uC5EC \uC9C1\uC811 \uD0D0\uC0AC" : this.rover.operatorHold ? "\uD0ED\uD558\uC5EC \uD0D0\uC0AC \uC7AC\uAC1C" : this.tiltParked ? "\uAE30\uC6B8\uC774\uBA74 \uCD9C\uBC1C" : this.permission === "granted" ? "\uAE30\uC6B8\uC774\uAC70\uB098 \uB4DC\uB798\uADF8 \xB7 \uD0ED\uD558\uC5EC \uC77C\uC2DC \uC815\uC9C0" : "\uC88C\uC6B0 \uB4DC\uB798\uADF8 \uC870\uD5A5 \xB7 \uD0ED\uD558\uC5EC \uC77C\uC2DC \uC815\uC9C0";
    const key = `${sensor}|${state}|${hint}|${blocked}|${missionHold}|${released}`;
    if (key === this.lastUi) return;
    this.lastUi = key;
    if (this.sensorLabel) this.sensorLabel.textContent = sensor;
    if (this.driveLabel) this.driveLabel.textContent = state;
    if (this.driveHint) this.driveHint.textContent = hint;
    if (this.toggle) {
      this.toggle.disabled = blocked || missionHold || !released;
      this.toggle.setAttribute("aria-pressed", String(this.rover.operatorHold));
    }
    if (this.tilt) {
      this.tilt.setAttribute("aria-pressed", String(this.permission === "granted"));
      this.tilt.disabled = this.permission === "pending";
    }
    if (this.steer) this.steer.disabled = blocked || missionHold || !released;
  }
}
