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
 * The melody itself is a REAL troubadour song: "A chantar m'er de so qu'ieu
 * non volria" by the Comtessa de Dia (c. 1175) — the only canso by a
 * trobairitz (woman troubadour) to survive with its music, preserved in the
 * Manuscrit du Roi (BnF fr. 844). It is sung in Mode 1 (Dorian on D) over a
 * D–A vielle drone, mostly syllabically with short melismas, in the free
 * declamatory rhythm of the canso, with breaths between phrases and a warm
 * great-chamber convolution reverb.
 */

class TroubadourEngine {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.currentMode = 1;
        this.numVoices = 1;
        this.tempo = 104;               // syllables/min → ≈0.58 s a syllable (free canso declamation)
        this.voiceVolume = 0.75;        // melody / lyric line (the singer)
        this.droneVolume = 0.25;        // sustained fifth beneath, ~ -10 dB under the voice
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

        // D3 — the drone tonic. The vielle holds the FINAL of Mode 1 (D) plus
        // its fifth (A3 ≈ 220 Hz) beneath the whole song, which cadences on D.
        this.basePitch = 146.83;

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

        // === THE SONG: "A chantar m'er de so qu'ieu non volria" ===
        // Comtessa de Dia, from the Manuscrit du Roi. Mode 1 (Dorian), final D4.
        // Each inner array is ONE SYLLABLE of the lyric; two or three note names
        // together are a short melisma sung legato on that syllable's vowel.
        // The melody spans C4 (the subtonium touched below the final in
        // phrase B) up to the single C5 climax in phrase D.
        this.noteFreq = {
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
            A4: 440.00, Bb4: 466.16, B4: 493.88, C5: 523.25
        };
        this.songPhrases = {
            // Phrase A — cadence on E
            A: [['A4'], ['A4','G4'], ['F4'], ['F4','G4'], ['A4'], ['G4'],
                ['F4','G4'], ['F4','E4'], ['D4'], ['F4','E4','D4'], ['E4']],
            // Phrase B — cadence on D, the final (also closes the stanza)
            B: [['C4'], ['D4'], ['E4'], ['F4','G4'], ['A4','G4'], ['F4','E4','D4'],
                ['C4'], ['D4','E4'], ['F4'], ['E4','D4','C4'], ['D4']],
            // Phrase C — cadence on F; the B is sung soft (B-flat), as the
            // manuscript's mode allows.
            C: [['A4'], ['A4'], ['A4','Bb4'], ['A4'], ['G4'], ['A4'], ['G4'],
                ['F4','E4','D4'], ['E4'], ['F4']],
            // Phrase D — the ONE melodic climax of the stanza (C5); cadence on E
            D: [['F4'], ['F4'], ['A4'], ['C5'], ['B4'], ['A4'], ['G4'],
                ['F4','E4'], ['D4'], ['F4','E4','D4'], ['E4']]
        };
        // Stanza form: frons (A B)(A B) + cauda C D, with the last line
        // reusing B so every stanza ends home on the final, D.
        this.stanzaForm = ['A', 'B', 'A', 'B', 'C', 'D', 'B'];

        this.songSequence = [];         // flattened stanza: one entry per syllable
        this.songPos = 0;
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
            technique: 'sampler',           // real recorded voice (was 'fof')
            voice: 'auto', ensemble: 1,     // a solo trobairitz — treble samples above F#4
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

    // === Melody: "A chantar m'er" — the surviving Comtessa de Dia canso ===

    start() {
        this.isPlaying = true;
        this.buildStanza();
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
     * Lay out one full stanza of the canso as a flat list of syllables.
     *
     * Stanza form (the classic troubadour frons + cauda):
     *
     *     A B  A B  |  C D B
     *
     * — the final line reuses phrase B, so every stanza cadences home on the
     * final, D. The LITERAL return of phrases A and B (exact melodic
     * repetition) is what marks this as a troubadour canso rather than
     * plainchant, so the phrases are quoted verbatim each time. The song is
     * strophic: when the stanza ends, the singer rests a moment and begins
     * the same melody again for the next stanza of the poem.
     */
    buildStanza() {
        const seq = [];
        this.stanzaForm.forEach((name, li) => {
            const phrase = this.songPhrases[name];
            phrase.forEach((notes, si) => {
                seq.push({
                    notes,                               // 1–3 note names: a syllable, maybe a melisma
                    phraseEnd: si === phrase.length - 1, // lengthen the cadence note + breathe after
                    stanzaEnd: li === this.stanzaForm.length - 1 && si === phrase.length - 1
                });
            });
        });
        this.songSequence = seq;
        this.songPos = 0;
    }

    scheduleNote() {
        if (!this.isPlaying) return;
        if (!this.songSequence.length) this.buildStanza();
        const syl = this.songSequence[this.songPos];

        // One sung vowel per syllable, rotating through the Occitan-ish sequence.
        const vowel = this.vowelSequence[this.vowelPos % this.vowelSequence.length];
        this.vowelPos = (this.vowelPos + 1) % this.vowelSequence.length;

        // Free, declamatory canso rhythm — no metronomic grid. `tempo` is
        // syllables per minute (~104 → ≈0.58 s a syllable) with a gentle ±7%
        // humanising jitter; each phrase-final (cadence) note stretches ×1.75.
        let syllableDur = (60 / this.tempo) * (1 + (Math.random() * 2 - 1) * 0.07);
        if (syl.phraseEnd) syllableDur *= 1.75;

        // A melisma splits its syllable's time evenly across the notes, sung
        // legato on the one vowel with a short (10–20 ms) portamento between
        // them. Fresh syllables re-articulate — no glide across syllables.
        const freqs = syl.notes.map((n) => this.noteFreq[n]);
        const noteDur = syllableDur / freqs.length;
        freqs.forEach((freq, i) => {
            const slideFrom = i > 0 ? freqs[i - 1] : null;
            const glideTime = slideFrom ? 0.012 + Math.random() * 0.008 : 0;
            this.playMelodyNote(freq, noteDur, i * noteDur, vowel, slideFrom, glideTime);
        });

        this.songPos++;
        // Breathe after each phrase; rest longer between stanzas; only the
        // tiniest lift between syllables within a phrase.
        let pause = 0.02;
        if (syl.stanzaEnd) {
            pause = 1.0 + Math.random() * 0.5;   // strophic: begin the next stanza
            this.buildStanza();
        } else if (syl.phraseEnd) {
            pause = 0.4 + Math.random() * 0.3;   // a singer's breath
        }

        this.phraseTimeout = setTimeout(() => this.scheduleNote(), (syllableDur + pause) * 1000);
    }

    /**
     * Sing one note across every singer in the ensemble by steering each singer's
     * persistent FOF library voice (pitch + vowel) and re-shaping its shared
     * per-note amplitude envelope. Neighbouring pitches glide legato; the library
     * adds its own light vibrato and breath.
     */
    playMelodyNote(freq, duration, delay, vowel, slideFrom, glideTime) {
        if (!isFinite(freq) || freq <= 0) return;
        const t0 = this.ctx.currentTime + (delay || 0);
        for (const voice of this.voices) {
            this.setVowel(voice, vowel);

            const glide = (slideFrom && isFinite(slideFrom))
                ? (glideTime > 0 ? glideTime : Math.min(0.14, duration * 0.45))
                : 0;
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

    /**
     * The historical melody is fixed in Mode 1 (Dorian on D) — the mode
     * buttons remain for the UI but no longer alter the tune itself.
     */
    setMode(mode) {
        this.currentMode = mode;
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
