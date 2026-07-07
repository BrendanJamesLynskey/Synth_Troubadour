/**
 * Troubadour Song Synthesis Engine — Subtractive (Analog-Style) Synthesis
 *
 * The troubadours and trouvères sang a monophonic, expressive lyric line over
 * a sustained drone. This engine voices that with the classic subtractive
 * chain — a harmonically rich oscillator, carved by a moving resonant filter,
 * shaped by an amplifier envelope:
 *
 *   - SOURCE   : one or two slightly detuned SAWTOOTH oscillators (rich in
 *                harmonics, like a bowed vielle/rebec string) plus an optional
 *                sub-oscillator for body.
 *   - FILTER   : a resonant low-pass BiquadFilter whose cutoff is swept by a
 *                per-note filter envelope (ADSR on filter.frequency) with a
 *                singing resonance (Q). A slow filter LFO adds a vocal, formant-
 *                like "wah" — the heart of subtractive synthesis.
 *   - AMPLIFIER: an amp-envelope gain shapes each note's loudness.
 *
 * Beneath the lyric line a DRONE holds an open fifth (tonic + fifth), also made
 * subtractively — saw oscillators through a gently resonant low-pass pad, as a
 * vielle or citole would drone beneath a sung canso.
 *
 * On top: the 8 medieval church modes, phrase-based arch-shaped melodies (the
 * canso) with breathing between phrases, light vibrato, a schola of detuned
 * voices, and a warm great-chamber convolution reverb.
 */

class TroubadourEngine {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.currentMode = 1;
        this.numVoices = 1;
        this.tempo = 66;                // lyric pace, syllables-per-minute-ish
        this.voiceVolume = 0.75;        // melody / lyric line
        this.droneVolume = 0.4;         // sustained fifth beneath
        this.brightness = 0.5;          // maps to filter cutoff (0..1)
        this.resonance = 8.5;           // filter Q, folded into the note envelope
        this.reverbMix = 0.55;

        this.voices = [];               // persistent per-singer melody chains
        this.droneNodes = [];           // sustained drone oscillators
        this.droneFilter = null;
        this.droneBus = null;
        this.phraseTimeout = null;
        this.activeNotes = [];

        this.masterGain = null;
        this.mixBus = null;
        this.melodyBus = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.convolver = null;
        this.analyser = null;

        // G3 — a lyric vielle/voice register for the canso.
        this.basePitch = 196;

        // === The 8 medieval church modes ===
        // intervals: cents from the finalis; tenor: reciting-tone scale degree.
        this.modes = {
            1: { name: "Dorian",        intervals: [0,200,300,500,700,900,1000,1200], finalis: 0, tenor: 4, up: 5 },
            2: { name: "Hypodorian",    intervals: [0,200,300,500,700,900,1000,1200], finalis: 0, tenor: 2, up: 4 },
            3: { name: "Phrygian",      intervals: [0,100,300,500,700,800,1000,1200], finalis: 0, tenor: 5, up: 6 },
            4: { name: "Hypophrygian",  intervals: [0,100,300,500,700,800,1000,1200], finalis: 0, tenor: 3, up: 5 },
            5: { name: "Lydian",        intervals: [0,200,400,600,700,900,1100,1200], finalis: 0, tenor: 4, up: 6 },
            6: { name: "Hypolydian",    intervals: [0,200,400,600,700,900,1100,1200], finalis: 0, tenor: 2, up: 4 },
            7: { name: "Mixolydian",    intervals: [0,200,400,500,700,900,1000,1200], finalis: 0, tenor: 4, up: 6 },
            8: { name: "Hypomixolydian",intervals: [0,200,400,500,700,900,1000,1200], finalis: 0, tenor: 3, up: 5 }
        };

        this.phrasePos = 0;
        this.phrase = [];
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.ctx.destination);

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;
        this.masterGain.connect(this.analyser);

        await this.createReverb();

        // Shared reverb send: mixBus → dry + convolver → master.
        this.mixBus = this.ctx.createGain();
        this.mixBus.gain.value = 1.0;

        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.value = 1 - this.reverbMix * 0.5;

        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = this.reverbMix;

        this.mixBus.connect(this.dryGain);
        this.mixBus.connect(this.convolver);
        this.dryGain.connect(this.masterGain);
        this.convolver.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        // Melody line bus (lyric voice volume) feeds the reverb send.
        this.melodyBus = this.ctx.createGain();
        this.melodyBus.gain.value = this.voiceVolume;
        this.melodyBus.connect(this.mixBus);

        // Drone bus feeds the same send, under the melody.
        this.droneBus = this.ctx.createGain();
        this.droneBus.gain.value = 0;
        this.droneBus.connect(this.mixBus);
    }

    /** Warm great-chamber / hall — ~3.5 s tail with early reflections. */
    async createReverb() {
        const sr = this.ctx.sampleRate;
        const length = Math.floor(sr * 3.5);
        const impulse = this.ctx.createBuffer(2, length, sr);
        const reflections = [0.009, 0.019, 0.031, 0.047, 0.063, 0.083, 0.107, 0.133];
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 1.0) * 0.4 + Math.exp(-t * 0.45) * 0.4 + Math.exp(-t * 0.22) * 0.2;
                data[i] = (Math.random() * 2 - 1) * env;
                if (i < sr * 0.16) {
                    for (const d of reflections) {
                        if (i === Math.floor(d * sr)) data[i] += (Math.random() * 2 - 1) * 0.3;
                    }
                }
            }
        }
        this.convolver = this.ctx.createConvolver();
        this.convolver.buffer = impulse;
    }

    centsToFreq(cents) { return this.basePitch * Math.pow(2, cents / 1200); }
    clampFreq(f) { const nyq = this.ctx.sampleRate / 2; return Math.max(40, Math.min(nyq * 0.9, f)); }

    // === Drone: a sustained open fifth made subtractively ===

    startDrone() {
        this.teardownDrone();
        const now = this.ctx.currentTime;

        // A gently resonant low-pass pad shared by the drone oscillators.
        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.Q.value = 4;
        this.droneFilter.frequency.value = this.clampFreq(this.basePitch * (3 + this.brightness * 4));
        this.droneFilter.connect(this.droneBus);

        // Slow cutoff LFO so the drone breathes.
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.12;
        const lfoDepth = this.ctx.createGain();
        lfoDepth.gain.value = this.basePitch * 0.6;
        lfo.connect(lfoDepth); lfoDepth.connect(this.droneFilter.frequency);
        lfo.start(now);
        this.droneNodes.push({ osc: lfo });

        // Tonic + perfect fifth, each a pair of detuned saws for warmth.
        const fifth = this.basePitch * Math.pow(2, 700 / 1200);
        const partials = [
            { f: this.basePitch,     g: 0.5 },
            { f: this.basePitch * 2, g: 0.18 },
            { f: fifth,              g: 0.34 }
        ];
        for (const p of partials) {
            for (const det of [-5, 5]) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = p.f;
                osc.detune.value = det;
                const g = this.ctx.createGain();
                g.gain.value = p.g * 0.5;
                osc.connect(g); g.connect(this.droneFilter);
                osc.start(now);
                this.droneNodes.push({ osc });
            }
        }

        // Fade the drone in under the melody.
        this.droneBus.gain.cancelScheduledValues(now);
        this.droneBus.gain.setValueAtTime(0, now);
        this.droneBus.gain.linearRampToValueAtTime(this.droneVolume, now + 2.2);
    }

    teardownDrone() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        if (this.droneBus) {
            this.droneBus.gain.cancelScheduledValues(now);
            this.droneBus.gain.setValueAtTime(this.droneBus.gain.value, now);
            this.droneBus.gain.linearRampToValueAtTime(0, now + 1.5);
        }
        const nodes = this.droneNodes;
        this.droneNodes = [];
        setTimeout(() => {
            for (const n of nodes) { try { n.osc.stop(); } catch (e) {} }
        }, 1800);
    }

    // === Melody voices (the lyric line) ===

    /**
     * One singer's persistent chain: an output gain into the melody bus and a
     * slow filter LFO that every note of this voice taps for expressivity.
     *   note oscillators → resonant low-pass (per note) → amp env → outGain
     */
    createVoice(index, total) {
        const now = this.ctx.currentTime;

        const outGain = this.ctx.createGain();
        const perVoice = [0.55, 0.4, 0.32, 0.28];
        const vol = perVoice[Math.min(index, perVoice.length - 1)];
        outGain.gain.setValueAtTime(0, now);
        outGain.gain.linearRampToValueAtTime(vol, now + 1.2 + index * 0.4);
        outGain.connect(this.melodyBus);

        // Shared filter LFO — a slow cutoff wobble giving a vocal, singing quality.
        const filterLFO = this.ctx.createOscillator();
        filterLFO.type = 'sine';
        filterLFO.frequency.value = 3.4 + Math.random() * 1.2;
        const lfoDepth = this.ctx.createGain();
        lfoDepth.gain.value = 220 + Math.random() * 120;   // Hz of cutoff swing
        filterLFO.connect(lfoDepth);
        filterLFO.start(now);

        // Per-singer detune so a unison ensemble shimmers.
        const detuneCents = (index - (total - 1) / 2) * 8 + (Math.random() - 0.5) * 4;

        return { outGain, filterLFO, lfoDepth, detuneCents };
    }

    setupVoices() {
        this.teardownVoices();
        for (let v = 0; v < this.numVoices; v++) {
            this.voices.push(this.createVoice(v, this.numVoices));
        }
    }

    teardownVoices() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        for (const voice of this.voices) {
            try {
                voice.outGain.gain.cancelScheduledValues(now);
                voice.outGain.gain.setValueAtTime(voice.outGain.gain.value, now);
                voice.outGain.gain.linearRampToValueAtTime(0, now + 1.5);
                setTimeout(() => { try { voice.filterLFO.stop(); } catch (e) {} }, 1800);
            } catch (e) {}
        }
        this.voices = [];
    }

    // === Melody generation: arch-shaped canso phrase ===

    start() {
        this.isPlaying = true;
        this.phrasePos = 0;
        this.buildPhrase();
        this.scheduleNote();
    }

    stop() {
        this.isPlaying = false;
        if (this.phraseTimeout) { clearTimeout(this.phraseTimeout); this.phraseTimeout = null; }
        const now = this.ctx ? this.ctx.currentTime : 0;
        for (const n of this.activeNotes) {
            try {
                n.gain.gain.cancelScheduledValues(now);
                n.gain.gain.setValueAtTime(n.gain.gain.value, now);
                n.gain.gain.linearRampToValueAtTime(0, now + 1.0);
                const oscs = n.oscs;
                setTimeout(() => { for (const o of oscs) { try { o.stop(); } catch (e) {} } }, 1300);
            } catch (e) {}
        }
        this.activeNotes = [];
        this.teardownVoices();
        this.teardownDrone();
    }

    /**
     * Compose a lyrical, arch-shaped canso phrase in the current mode: lift up
     * from around the finalis toward a high point near the modal ceiling, then
     * descend by step to cadence home. Flexible rhythm with an occasional
     * dansa-like lilt and small slurred ornaments. Values are scale degrees.
     */
    buildPhrase() {
        const m = this.modes[this.currentMode];
        const top = Math.max(m.tenor + 1, m.up + 1);
        const phrase = [];
        const dansa = Math.random() < 0.4;   // some songs lilt like a dance

        // Ascent: rise toward the phrase peak with light steps and a small leap.
        let deg = 0;
        phrase.push({ deg: 0, len: dansa ? 0.7 : 1.0 });
        while (deg < top) {
            const step = (Math.random() < 0.75) ? 1 : 2;
            deg = Math.min(top, deg + step);
            const len = dansa ? (phrase.length % 2 ? 0.5 : 0.9) : (0.7 + Math.random() * 0.4);
            if (Math.random() < 0.28) {
                phrase.push({ deg, len, neume: [deg, deg + 1, deg] });   // upper turn
            } else {
                phrase.push({ deg, len });
            }
        }
        // Dwell on the peak — the emotional apex of the canso.
        phrase.push({ deg: top, len: dansa ? 1.0 : 1.5 });

        // Descent: mostly stepwise fall back to the finalis, breathing wider.
        for (let d = top - 1; d >= 0; d--) {
            if (Math.random() < 0.22 && d < top - 1) {
                phrase.push({ deg: d, len: 0.8, neume: [d + 1, d] });    // slurred fall
            } else {
                phrase.push({ deg: d, len: dansa ? (d % 2 ? 0.6 : 0.9) : (0.8 + Math.random() * 0.4) });
            }
        }
        phrase[phrase.length - 1].len = 2.4;   // lengthened final on the finalis

        this.phrase = phrase;
        this.phrasePos = 0;
    }

    scheduleNote() {
        if (!this.isPlaying) return;
        const m = this.modes[this.currentMode];
        const item = this.phrase[this.phrasePos];
        const beat = 60 / this.tempo;

        const degToFreq = (deg) => {
            const idx = ((deg % 8) + 8) % 8;
            const oct = Math.floor(deg / 8);
            return this.centsToFreq(m.intervals[idx]) * Math.pow(2, oct);
        };

        // A syllable may carry a small slur (several notes on one breath).
        const notes = item.neume
            ? item.neume.map(d => degToFreq(d))
            : [degToFreq(item.deg)];
        const syllableDur = beat * item.len;
        const noteDur = syllableDur / notes.length;

        notes.forEach((freq, i) => {
            this.playMelodyNote(freq, noteDur, i * noteDur);
        });

        this.phrasePos++;
        const phraseEnd = this.phrasePos >= this.phrase.length;
        // Breathe at the end of a phrase; small lift between notes.
        const pause = phraseEnd ? beat * 1.4 : beat * 0.06;
        if (phraseEnd) this.buildPhrase();

        this.phraseTimeout = setTimeout(() => this.scheduleNote(), (syllableDur + pause) * 1000);
    }

    /** One subtractively-synthesised note across every voice in the ensemble. */
    playMelodyNote(freq, duration, delay) {
        const t0 = this.ctx.currentTime + (delay || 0);
        for (const voice of this.voices) {
            // --- SOURCE: two detuned saws + a sub-oscillator for body ---
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
            osc1.frequency.value = freq;
            osc2.frequency.value = freq;
            const jitter = (Math.random() - 0.5) * 4;
            osc1.detune.value = voice.detuneCents - 6 + jitter;
            osc2.detune.value = voice.detuneCents + 6 + jitter;

            const sub = this.ctx.createOscillator();
            sub.type = 'sine';
            sub.frequency.value = freq / 2;

            const oscMix = this.ctx.createGain();
            oscMix.gain.value = 0.5;
            osc1.connect(oscMix); osc2.connect(oscMix);
            const subGain = this.ctx.createGain();
            subGain.gain.value = 0.22;
            sub.connect(subGain);

            // --- FILTER: resonant low-pass swept by a filter envelope ---
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = this.resonance;
            const baseCut = this.clampFreq(freq * (1.5 + this.brightness * 2.5));
            const peakCut = this.clampFreq(freq * (4 + this.brightness * 9));
            const susCut  = this.clampFreq(freq * (2.2 + this.brightness * 4));
            const fa = Math.min(0.11, duration * 0.3);
            const fd = Math.min(0.22, duration * 0.5);
            filter.frequency.setValueAtTime(baseCut, t0);
            filter.frequency.linearRampToValueAtTime(peakCut, t0 + fa);
            filter.frequency.linearRampToValueAtTime(susCut, t0 + fa + fd);
            // Tap the voice's shared filter LFO for a singing "wah".
            voice.lfoDepth.connect(filter.frequency);

            // --- AMPLIFIER: ADSR amp envelope ---
            const amp = this.ctx.createGain();
            const attack = Math.min(0.08, duration * 0.3);
            const release = Math.max(0.18, duration * 0.5);
            const peak = 0.5;
            amp.gain.setValueAtTime(0, t0);
            amp.gain.linearRampToValueAtTime(peak, t0 + attack);
            amp.gain.setValueAtTime(peak * 0.85, t0 + Math.max(attack, duration * 0.7));
            amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration + release);

            oscMix.connect(filter);
            filter.connect(amp);
            subGain.connect(amp);
            amp.connect(voice.outGain);

            // Light vibrato blooms on sustained notes.
            let vib = null;
            if (duration > 0.5) {
                vib = this.ctx.createOscillator();
                vib.type = 'sine';
                vib.frequency.value = 5.0 + Math.random() * 1.0;
                const vibDepth = this.ctx.createGain();
                vibDepth.gain.value = freq * 0.008;
                vib.connect(vibDepth);
                vibDepth.connect(osc1.frequency);
                vibDepth.connect(osc2.frequency);
                vib.start(t0 + attack);
                vib.stop(t0 + duration + release);
            }

            osc1.start(t0); osc2.start(t0); sub.start(t0);
            const stopT = t0 + duration + release + 0.1;
            osc1.stop(stopT); osc2.stop(stopT); sub.stop(stopT);

            const node = {
                oscs: [osc1, osc2, sub],
                gain: amp,
                releaseLfo: () => { try { voice.lfoDepth.disconnect(filter.frequency); } catch (e) {} }
            };
            this.activeNotes.push(node);
            setTimeout(() => {
                node.releaseLfo();
                const idx = this.activeNotes.indexOf(node);
                if (idx > -1) this.activeNotes.splice(idx, 1);
            }, (duration + release + 0.2) * 1000);
        }
    }

    // === Public transport / control ===

    async begin() {
        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.setupVoices();
        this.startDrone();
        setTimeout(() => { if (!this.isPlaying) this.start(); }, 1500);
    }

    end() { this.stop(); }

    setMode(mode) {
        this.currentMode = mode;
        if (this.isPlaying) { this.buildPhrase(); }
    }

    setVoices(count) {
        this.numVoices = count;
        if (this.voices.length) { this.setupVoices(); }
    }

    setVoiceVolume(v) {
        this.voiceVolume = v;
        if (this.melodyBus) this.melodyBus.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.2);
    }

    setDroneVolume(v) {
        this.droneVolume = v;
        if (this.droneBus && this.droneNodes.length) {
            this.droneBus.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.3);
        }
    }

    setBrightness(v) {
        this.brightness = v;
        if (this.droneFilter) {
            const cut = this.clampFreq(this.basePitch * (3 + v * 4));
            this.droneFilter.frequency.linearRampToValueAtTime(cut, this.ctx.currentTime + 0.3);
        }
    }

    setReverbMix(v) {
        this.reverbMix = v;
        if (this.reverbGain && this.dryGain) {
            const now = this.ctx.currentTime;
            this.reverbGain.gain.linearRampToValueAtTime(v, now + 0.2);
            this.dryGain.gain.linearRampToValueAtTime(1 - v * 0.5, now + 0.2);
        }
    }

    setTempo(bpm) { this.tempo = bpm; }

    getAnalyserData() {
        if (!this.analyser) return null;
        const d = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(d);
        return d;
    }
    getFrequencyData() {
        if (!this.analyser) return null;
        const d = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(d);
        return d;
    }
}
