# Synth Troubadour — Courtly Song Synthesizer

A web-based synthesizer that sings the **courtly songs of the troubadours** in real time in the browser. No samples, no libraries — the expressive lyric line is synthesized with classic **subtractive (analog-style) synthesis** using only the Web Audio API.

**[Launch the app](https://brendanjameslynskey.github.io/Synth_Troubadour/)** — auto-detects your device and recommends desktop or mobile.

---

## The style

**Troubadour song** is the secular, vernacular art of the poet-composers of 12th–13th-century Occitania — and, in the north of France, the trouvères. Where Gregorian chant sang scripture in Latin for the abbey, the troubadours sang in Occitan and Old French for the court: the great repertoire of *fin'amor*, courtly love, prizing the lady, longing and desire.

Their songs took shape as the **canso** (love-song), the **dansa** and the lively **estampida** — each a single monophonic melody, flexible in rhythm, sung to the bowed *vielle* over a drone. Figures such as **Bernart de Ventadorn**, the Comtessa **Beatriz de Dia** and the northern **Adam de la Halle** left melodies that still survive. It is the secular, vernacular counterpart to sacred chant — a parallel monophonic tradition of the garden rather than the cloister.

## How it sounds high quality

Rather than pure tones, the engine builds each note through the classic **subtractive chain** — oscillator → resonant filter → amplifier:

- **Source** — one or two slightly detuned **sawtooth** oscillators (rich in harmonics, like a bowed vielle/rebec string) plus a sub-oscillator for body.
- **Filter** — a **resonant low-pass** `BiquadFilter` whose cutoff is swept by a per-note **filter envelope** (ADSR on `filter.frequency`) with a singing resonance (Q). A slow **filter LFO** adds a vocal, formant-like "wah" — the heart of subtractive synthesis and what gives the vielle its singing quality.
- **Amplifier** — an amp-envelope gain shapes each note's attack, sustain and release, with light vibrato blooming on held notes.
- **Drone** — a sustained open fifth (tonic + fifth), also made subtractively (saw oscillators through a gently resonant low-pass pad with a breathing cutoff), holds beneath the melody as a vielle or citole would drone beneath a sung *canso*.
- **Ensemble** — a schola of detuned, jittered voices layering the lyric line, plus a warm **great-chamber convolution reverb** (~3.5 s tail with early reflections).

The melody itself is generated as an arch-shaped **canso** phrase in the chosen mode: it lifts from the finalis to a high point, dwells at the apex, then descends by step to cadence home — breathing between phrases, with occasional dance-song (*dansa*) lilt.

## Where it sits — the lineage of early Western music

Troubadour song is the **secular, vernacular** branch that runs alongside sacred chant. Its songs and dances fed directly into instrumental forms like the **estampie**:

```
Plainsong ──► Organum ──► Ars Nova ──► (Renaissance polyphony)
   │  (a 2nd voice   (rhythmic
   │   is added)      sophistication)
   │
   └── a parallel secular branch: Troubadour song ──► instrumental Estampie dances
```

| App | Style | Synthesis technique |
|---|---|---|
| [Synth Gregorian](https://github.com/BrendanJamesLynskey/Synth_Gregorian) | Plainsong | Source–filter formant vocal synthesis |
| [Synth Organum](https://github.com/BrendanJamesLynskey/Synth_Organum) | Notre-Dame polyphony | Additive synthesis in Pythagorean just intonation |
| [Synth Ars Nova](https://github.com/BrendanJamesLynskey/Synth_ArsNova) | 14th-c. isorhythm | FM synthesis |
| **Synth Troubadour** (this) | Secular monophony | Subtractive synthesis |
| [Synth Estampie](https://github.com/BrendanJamesLynskey/Synth_Estampie) | Medieval dance | Physical modelling |

## Quick start

```bash
git clone https://github.com/BrendanJamesLynskey/Synth_Troubadour.git
cd Synth_Troubadour
python3 -m http.server 8080
```

Open <http://localhost:8080> and press **Begin Song**. Any static file server works — there is no build step or dependency.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page — detects device, links to desktop or mobile |
| `desktop.html` | Desktop web app |
| `style.css` | Courtly-themed styles (rose, wine-red, gold) |
| `troubadour-engine.js` | Subtractive synthesis engine (Web Audio API) |
| `app.js` | UI controller, stave visualizer, rose petals |
| `troubadour_mobile.html` | Self-contained mobile version (single file) |

## Controls

| Control | Description |
|---|---|
| **Mode** | One of the 8 church tones (Dorian → Hypomixolydian) |
| **Voice** | Volume of the melody / lyric line |
| **Drone** | Volume of the sustained open-fifth drone |
| **Brightness** | Filter cutoff — from dark and veiled to open and singing |
| **Chamber Reverb** | Wet/dry mix of the warm great-chamber convolution reverb |
| **Pace** | Speed of the song |
| **Ensemble** | Solo (1), Duo (2), or Ensemble (3) layered voices |

## License

MIT
