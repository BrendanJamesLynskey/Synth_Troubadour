/**
 * Troubadour Song Synthesis Engine — a SUNG melody over an instrumental drone
 *
 * Historically the troubadour or trouvère SANG the canso; the vielle or citole
 * only accompanied. So the melodic lead here is a human VOICE, sung with the
 * shared `vocal-voices.js` vocal-synthesis library, while the drone beneath
 * stays an instrument, made subtractively.
 *
 *   - VOICE (the sung lyric line) : the `vocal-voices.js` library (default
 *                technique FOF — Fonction d'Onde Formantique, the IRCAM CHANT
 *                method): a burst of overlapping formant grains per glottal
 *                period reconstructs a true sung vocal spectrum with real vowel
 *                formants (a e i o u). Each singer is a persistent library voice;
 *                only the pitch and vowel change note to note, exactly as in real
 *                singing. Held notes bloom with vibrato and neighbouring pitches
 *                glide legato, for an expressive, haunting solo canso line. The
 *                Ensemble control (Solo / Duo / Ensemble) layers extra detuned,
 *                jittered singers.
 *
 *   - DRONE (the accompaniment)   : a sustained open fifth (tonic + fifth) held
 *                SUBTRACTIVELY — detuned sawtooth oscillators through a gently
 *                resonant, breathing low-pass pad, as a vielle or citole would
 *                drone beneath a sung canso.
 *
 * On top: the 8 medieval church modes, phrase-based arch-shaped melodies (the
 * canso) with breathing between phrases, and a warm great-chamber convolution
 * reverb.
 */

class TroubadourEngine {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.currentMode = 1;
        this.numVoices = 1;
        this.tempo = 66;                // lyric pace, syllables-per-minute-ish
        this.voiceVolume = 0.75;        // melody / lyric line (the singer)
        this.droneVolume = 0.4;         // sustained fifth beneath
        this.brightness = 0.5;          // vocal brightness / vowel openness (0..1)
        this.breath = 0.3;              // air on the sung tone
        this.reverbMix = 0.55;

        this.voices = [];               // persistent per-singer vocal tracts
        this.droneNodes = [];           // sustained drone oscillators
        this.droneFilter = null;
        this.droneBus = null;
        this.phraseTimeout = null;
        this.activeNotes = [];

        this.masterGain = null;
        this.limiter = null;
        this.mixBus = null;
        this.melodyBus = null;
        this.voiceTone = null;          // high-shelf: vocal "brightness"
        this.reverbGain = null;
        this.dryGain = null;
        this.convolver = null;
        this.analyser = null;

        // G3 — a lyric voice register for the sung canso.
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

        // === Sung-vowel formant tables (F1..F4 centre frequencies, Hz) ===
        // The singer's vocal tract morphs between these vowels.
        this.vowels = {
            a: [700, 1220, 2600, 3300],
            e: [530, 1840, 2480, 3300],
            i: [270, 2300, 3000, 3400],
            o: [430,  820, 2700, 3300],
            u: [350,  600, 2700, 3300]
        };
        // Occitan lyric is vowel-rich; weight toward open a/e/o for a ringing line.
        this.vowelSequence = ['a','e','a','o','i','e','a','o','u','e','a'];
        this.vowelPos = 0;

        this.phrasePos = 0;
        this.phrase = [];
        this.lastFreq = null;           // for legato glides between neighbours
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;

        // Soft limiter before the destination keeps voice + drone from clipping.
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -8; this.limiter.knee.value = 8;
        this.limiter.ratio.value = 6; this.limiter.attack.value = 0.004; this.limiter.release.value = 0.25;
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);

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

        // Sung-voice tone shaping: a high-shelf whose gain is the "brightness"
        // (vowel openness) of the singer. melodyBus → voiceTone → mixBus.
        this.voiceTone = this.ctx.createBiquadFilter();
        this.voiceTone.type = 'highshelf';
        this.voiceTone.frequency.value = 2200;
        this.voiceTone.gain.value = -6 + this.brightness * 16;   // -6..+10 dB
        this.voiceTone.connect(this.mixBus);

        // Melody line bus (lyric voice volume) feeds the tone shaper.
        this.melodyBus = this.ctx.createGain();
        this.melodyBus.gain.value = this.voiceVolume;
        this.melodyBus.connect(this.voiceTone);

        // Drone bus feeds the reverb send directly, under the singer.
        this.droneBus = this.ctx.createGain();
        this.droneBus.gain.value = 0;
        this.droneBus.connect(this.mixBus);

        // Load the vocal-synthesis worklets (FOF, vocal tract) once.
        await VocalVoices.init(this.ctx);
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

    // === Drone: a sustained open fifth made subtractively (the vielle) ===

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

        // Fade the drone in under the singer.
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

    // === Singers (the sung lyric line) ===

    /**
     * Build one singer as a persistent FOF library voice:
     *   voice.output → noteGain (per-note envelope) → outGain (fade-in) → melodyBus
     * Only the pitch and vowel change per note — the singer persists.
     */
    createVoice(index, total) {
        const now = this.ctx.currentTime;

        const outGain = this.ctx.createGain();
        const perVoice = [0.55, 0.4, 0.32, 0.28];
        const vol = perVoice[Math.min(index, perVoice.length - 1)];
        outGain.gain.setValueAtTime(0, now);
        outGain.gain.linearRampToValueAtTime(vol, now + 1.2 + index * 0.4);
        outGain.connect(this.melodyBus);

        // Per-note amplitude envelope, shared by this singer across notes.
        const noteGain = this.ctx.createGain();
        noteGain.gain.value = 0.0001;
        noteGain.connect(outGain);

        // Per-singer pitch drift so a unison ensemble shimmers.
        const detuneCents = (index - (total - 1) / 2) * 9 + (Math.random() - 0.5) * 5;

        const voice = VocalVoices.create(this.ctx, {
            technique: 'fof',
            vowel: this.vowelSequence[0],
            detuneCents,
            breath: 0.03 + this.breath * 0.07,
            vibDepth: 0.007
        });
        voice.output.connect(noteGain);

        return { voice, noteGain, outGain, detuneCents, vowel: this.vowelSequence[0] };
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
                const v = voice.voice;
                setTimeout(() => { try { v.dispose(); } catch (e) {} }, 1800);
            } catch (e) {}
        }
        this.voices = [];
    }

    /** Morph a singer's library voice toward a new sung vowel. */
    setVowel(voice, vowel) {
        if (!this.vowels[vowel]) return;
        voice.voice.setVowel(vowel, this.ctx.currentTime);
        voice.vowel = vowel;
    }

    // === Melody generation: arch-shaped canso phrase ===

    start() {
        this.isPlaying = true;
        this.phrasePos = 0;
        this.lastFreq = null;
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
                const osc = n.osc;
                setTimeout(() => { try { osc.stop(); } catch (e) {} }, 1300);
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
        // Advance the syllable vowel each phrase.
        this.vowelPos = (this.vowelPos + 1) % this.vowelSequence.length;
    }

    scheduleNote() {
        if (!this.isPlaying) return;
        const m = this.modes[this.currentMode];
        const item = this.phrase[this.phrasePos];
        const beat = 60 / this.tempo;
        const vowel = this.vowelSequence[(this.vowelPos + this.phrasePos) % this.vowelSequence.length];

        const degToFreq = (deg) => {
            const idx = ((deg % 8) + 8) % 8;
            const oct = Math.floor(deg / 8);
            return this.centsToFreq(m.intervals[idx]) * Math.pow(2, oct);
        };

        // A syllable may carry a small slur (several notes sung on one breath).
        const notes = item.neume
            ? item.neume.map(d => degToFreq(d))
            : [degToFreq(item.deg)];
        const syllableDur = beat * item.len;
        const noteDur = syllableDur / notes.length;

        notes.forEach((freq, i) => {
            const prev = i > 0 ? notes[i - 1] : this.lastFreq;
            let slideFrom = null;
            if (prev && isFinite(prev)) {
                const r = freq / prev;
                // Glide legato between neighbouring pitches (up to ~a whole tone).
                if (r > 0.82 && r < 1.22 && Math.abs(r - 1) > 1e-4) slideFrom = prev;
            }
            this.playMelodyNote(freq, noteDur, i * noteDur, vowel, slideFrom);
        });
        this.lastFreq = notes[notes.length - 1];

        this.phrasePos++;
        const phraseEnd = this.phrasePos >= this.phrase.length;
        // Breathe at the end of a phrase; small lift between notes.
        const pause = phraseEnd ? beat * 1.4 : beat * 0.06;
        if (phraseEnd) { this.buildPhrase(); this.lastFreq = null; }

        this.phraseTimeout = setTimeout(() => this.scheduleNote(), (syllableDur + pause) * 1000);
    }

    /**
     * Sing one note across every singer in the ensemble by steering each singer's
     * persistent FOF library voice (pitch + vowel) and re-shaping its shared
     * per-note amplitude envelope. Neighbouring pitches glide legato; the library
     * adds its own light vibrato and breath.
     */
    playMelodyNote(freq, duration, delay, vowel, slideFrom) {
        if (!isFinite(freq) || freq <= 0) return;
        const t0 = this.ctx.currentTime + (delay || 0);
        for (const voice of this.voices) {
            this.setVowel(voice, vowel);

            const glide = (slideFrom && isFinite(slideFrom)) ? Math.min(0.14, duration * 0.45) : 0;
            if (glide > 0) {
                voice.voice.setFrequency(slideFrom, t0, 0);
                voice.voice.setFrequency(freq, t0, glide);
            } else {
                voice.voice.setFrequency(freq, t0, 0);
            }
            voice.voice.setLevel(1, t0);

            const g = voice.noteGain.gain;
            const attack = Math.min(0.16, duration * 0.35);
            const release = Math.max(0.22, duration * 0.55);
            const peak = 0.9;
            g.cancelScheduledValues(t0);
            g.setValueAtTime(Math.max(0.0001, g.value), t0);
            g.linearRampToValueAtTime(peak, t0 + attack);
            g.setValueAtTime(peak * 0.9, t0 + Math.max(attack, duration * 0.7));
            g.exponentialRampToValueAtTime(0.0008, t0 + duration + release);
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

    /** Brightness now shapes the SUNG voice (vowel openness) and the drone filter. */
    setBrightness(v) {
        this.brightness = v;
        const now = this.ctx ? this.ctx.currentTime : 0;
        if (this.voiceTone) {
            this.voiceTone.gain.linearRampToValueAtTime(-6 + v * 16, now + 0.3);
        }
        if (this.droneFilter) {
            const cut = this.clampFreq(this.basePitch * (3 + v * 4));
            this.droneFilter.frequency.linearRampToValueAtTime(cut, now + 0.3);
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
