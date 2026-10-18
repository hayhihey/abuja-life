// ============================================================================
// ABUJA LIFE: AUTHENTIC NIGERIAN AFROBEATS & CAMPAIGN PARTY SYNTHESIZER
// High-energy procedural Afrobeats rhythm, log-drums, shekere, and party brass
// ============================================================================

export class AbujaAfrobeatsEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.tempo = 112; // Standard infectious Afrobeats BPM
    this.step = 0;
    this.timerId = null;
    this.volume = 0.28;
    this.stationIndex = 0;
    this.stations = [
      { name: 'WAZOBIA 99.5 FM ABUJA', style: 'Afrobeats Street Anthem', bassFreq: 55 },
      { name: 'COOL 96.9 FM FCT', style: 'Amapiano Gbedu Fusion', bassFreq: 48 },
      { name: 'RAYPOWER 100.5 FM', style: 'Owambe Party Highlife', bassFreq: 65 },
      { name: 'ELECTION CAMPAIGN LIVE RADIO', style: 'Democracy Victory Jam', bassFreq: 52 }
    ];
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this._initContext();
    if (!this.ctx) return false;

    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  cycleStation() {
    this.stationIndex = (this.stationIndex + 1) % this.stations.length;
    return this.stations[this.stationIndex];
  }

  currentStation() {
    return this.stations[this.stationIndex];
  }

  getCurrentStation() {
    return this.currentStation();
  }

  play() {
    this._initContext();
    if (!this.ctx || this.isPlaying) return;
    this.isPlaying = true;
    this.step = 0;
    const intervalMs = (60 / this.tempo / 4) * 1000; // 16th note step
    this.timerId = setInterval(() => this._tick(), intervalMs);
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  _tick() {
    if (!this.ctx || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    const s = this.step % 16;
    const station = this.stations[this.stationIndex];

    // 1. Nigerian Afrobeats Kick / Log Drum Bass
    // Syncopated 3:2 clave pattern: steps 0, 3, 6, 10, 12
    if ([0, 3, 6, 10, 12].includes(s)) {
      this._playKick(now, station.bassFreq);
    }

    // 2. Shekere / Hi-Hat shaker (continuous 16th-note swing)
    this._playShaker(now, s % 2 === 0 ? 0.08 : 0.04);

    // 3. Snare / Rimshot on steps 4, 12 (Afrobeats backbeat)
    if (s === 4 || s === 12) {
      this._playSnare(now);
    }

    // 4. Afro-Soul Rhodes Chords (steps 0, 6, 10)
    if (s === 0 || s === 6 || s === 10) {
      const chordIndex = Math.floor(this.step / 16) % 4;
      const chords = [
        [220, 261.63, 329.63], // Am
        [174.61, 220, 261.63], // F
        [261.63, 329.63, 392], // C
        [196, 246.94, 293.66]  // G
      ];
      this._playChord(now, chords[chordIndex]);
    }

    // 5. Party Celebration Horn / Vuvuzela Stabs (occasional syncopation)
    if (this.stationIndex === 3 && (s === 8 || s === 14) && (this.step % 32 < 16)) {
      this._playHorn(now);
    }

    this.step++;
  }

  _playKick(time, freq = 55) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2.2, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, time + 0.18);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.23);
  }

  _playShaker(time, vol = 0.06) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(4500 + Math.random() * 800, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  _playSnare(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.12);

    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  _playChord(time, freqs) {
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, time);

      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.36);
    }
  }

  _playHorn(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, time);
    osc.frequency.setValueAtTime(523.25, time + 0.08);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.23);
  }
}
