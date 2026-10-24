// ============================================================================
// ABUJA LIFE: AUTHENTIC NIGERIAN AFROBEATS & CAMPAIGN PARTY SYNTHESIZER
// High-energy procedural Afrobeats rhythm, log-drums, shekere, party brass,
// and procedural Nigerian street sound effects (UP NEPA, Gen, Suya, Horns, Cash Spray)
// ============================================================================

export class AbujaAfrobeatsEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.tempo = 114; // Vibrant infectious Afrobeats BPM
    this.step = 0;
    this.timerId = null;
    this.volume = 0.28;
    this.stationIndex = 0;
    this.stations = [
      { name: 'WAZOBIA 99.5 FM ABUJA', style: 'Afrobeats Street Anthem', bassFreq: 55, tempo: 114, vibe: '🔥 Street Banger' },
      { name: 'COOL 96.9 FM FCT', style: 'Amapiano Gbedu Fusion', bassFreq: 46, tempo: 112, vibe: '🎹 Log-Drum Piano' },
      { name: 'OWAMBE PARTY FM', style: 'Live Highlife & Juju Celebration', bassFreq: 64, tempo: 118, vibe: '🎉 Owambe Vibes' },
      { name: 'STREET GBEDU 101.3 FM', style: 'Lagos-Abuja Fast Rave', bassFreq: 58, tempo: 122, vibe: '⚡ High Energy' },
      { name: 'PALMWINE CHILL 88.5 FM', style: 'Calm Acoustic Highlife & Shekere', bassFreq: 50, tempo: 104, vibe: '🌴 Chill Steeze' }
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

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.45;
        this.sfxGain.connect(this.ctx.destination);
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
    const st = this.stations[this.stationIndex];
    this.tempo = st.tempo || 114;
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
    this.playSfx('radio_tune');
    return st;
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

    // 1. Nigerian Afrobeats Kick / Amapiano Log Drum Bass
    // Syncopated clave pattern: 0, 3, 6, 10, 12
    if ([0, 3, 6, 10, 12].includes(s)) {
      this._playKick(now, station.bassFreq);
    }

    // 2. Shekere / Hi-Hat shaker (continuous 16th-note swing)
    this._playShaker(now, s % 2 === 0 ? 0.08 : 0.04);

    // 3. Talking drum / Woodblock accent
    if (s === 2 || s === 7 || s === 11) {
      this._playTalkingDrum(now, s === 2 ? 280 : 340);
    }

    // 4. Snare / Rimshot on steps 4, 12 (Afrobeats backbeat)
    if (s === 4 || s === 12) {
      this._playSnare(now);
    }

    // 5. Afro-Soul Rhodes Chords (steps 0, 6, 10)
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

    // 6. Party Celebration Horn / Vuvuzela Stabs
    if ((this.stationIndex === 2 || this.stationIndex === 0) && (s === 8 || s === 14) && (this.step % 32 < 16)) {
      this._playHorn(now);
    }

    this.step++;
  }

  _playKick(time, freq = 55) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2.4, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, time + 0.18);

    gain.gain.setValueAtTime(0.75, time);
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

  _playTalkingDrum(time, pitch = 300) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, time);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.35, time + 0.06);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.8, time + 0.14);

    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  _playSnare(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, time);
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

  // ==========================================================================
  // PROCEDURAL NIGERIAN STREET SOUND EFFECTS (SFX)
  // Zero external audio files required — ultra-crisp Web Audio synthesis
  // ==========================================================================
  playSfx(type) {
    this._initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    switch (type) {
      // 1. UP NEPA! — Power surge click followed by euphoric celebratory major chord
      case 'up_nepa': {
        const click = this.ctx.createOscillator();
        const cg = this.ctx.createGain();
        click.frequency.setValueAtTime(120, now);
        click.frequency.exponentialRampToValueAtTime(2400, now + 0.06);
        cg.gain.setValueAtTime(0.5, now);
        cg.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
        click.connect(cg).connect(this.sfxGain);
        click.start(now);
        click.stop(now + 0.08);

        // Euphoric brass chime (C major arpeggio)
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + 0.08 + idx * 0.06);
          g.gain.setValueAtTime(0.28, now + 0.08 + idx * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + idx * 0.06);
          osc.connect(g).connect(this.sfxGain);
          osc.start(now + 0.08 + idx * 0.06);
          osc.stop(now + 0.55 + idx * 0.06);
        });
        break;
      }

      // 2. Generator Rumble ("I Pass My Neighbor") — Throaty engine sputter & hum
      case 'generator': {
        const gen = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        gen.type = 'sawtooth';
        gen.frequency.setValueAtTime(52, now);
        g.gain.setValueAtTime(0.3, now);
        g.gain.linearRampToValueAtTime(0.18, now + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        gen.connect(g).connect(this.sfxGain);
        gen.start(now);
        gen.stop(now + 1.3);
        break;
      }

      // 3. Spray Naira Notes — Shimmering note flutter & cash chime
      case 'spray_cash': {
        for (let i = 0; i < 5; i++) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(900 + Math.random() * 1200, now + i * 0.04);
          g.gain.setValueAtTime(0.2, now + i * 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.09);
          osc.connect(g).connect(this.sfxGain);
          osc.start(now + i * 0.04);
          osc.stop(now + i * 0.04 + 0.1);
        }
        break;
      }

      // 4. Suya / Grilling Sizzle — Crackling hot pepper & meat sizzle
      case 'suya_sizzle': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(3200 + Math.random() * 800, now);
        g.gain.setValueAtTime(0.22, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.46);
        break;
      }

      // 5. Taxi Horn ("Pim-Pim!") — Dual-tone classic Abuja cab horn
      case 'taxi_horn': {
        [0, 0.12].forEach((offset) => {
          [440, 554.37].forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + offset);
            g.gain.setValueAtTime(0.18, now + offset);
            g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);
            osc.connect(g).connect(this.sfxGain);
            osc.start(now + offset);
            osc.stop(now + offset + 0.1);
          });
        });
        break;
      }

      // 6. Bank Credit Alert — Two high-pitched chimes (*PING-PING!*)
      case 'bank_alert': {
        [880, 1174.66].forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + idx * 0.1);
          g.gain.setValueAtTime(0.35, now + idx * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.28);
          osc.connect(g).connect(this.sfxGain);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.3);
        });
        break;
      }

      // 7. Radio Tuning Static / Click
      case 'radio_tune': {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }

      // 8. Owambe Party Horn
      case 'party_horn': {
        [587.33, 739.99, 880.00].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);
          g.gain.setValueAtTime(0.25, now + idx * 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          osc.connect(g).connect(this.sfxGain);
          osc.start(now + idx * 0.05);
          osc.stop(now + 0.42);
        });
        break;
      }

      default:
        break;
    }
  }
}
