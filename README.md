# Synth Troubadour — Courtly Song Synthesizer

A web-based synthesizer that sings the **courtly songs of the troubadours** in real time in the browser. A haunting solo voice sings the melody with **real recorded singing**: the shared [`vocal-voices.js`](vocal-voices.js) library plays actual sung vowels from the [**VocalSet**](https://zenodo.org/records/1193957) corpus (CC BY 4.0), pitch-mapped with **formant-preserving** TD-PSOLA, **over a subtractive-synth vielle drone**. (The earlier pure-synthesis engines, including FOF/*CHANT*, remain available.)

> **Credit:** sampled voices derived from [**VocalSet**](https://zenodo.org/records/1193957) (Wilkins, Seetharaman, Wahl & Pardo, ISMIR 2018), CC BY 4.0.

**[Launch the app](https://brendanjameslynskey.github.io/Synth_Troubadour/)** — auto-detects your device and recommends desktop or mobile.

---

## The style

**Troubadour song** is the secular, vernacular art of the poet-composers of 12th–13th-century Occitania — and, in the north of France, the trouvères. Where Gregorian chant sang scripture in Latin for the abbey, the troubadours sang in Occitan and Old French for the court: the great repertoire of *fin'amor*, courtly love, prizing the lady, longing and desire.

Their songs took shape as the **canso** (love-song), the **dansa** and the lively **estampida** — each a single monophonic melody, flexible in rhythm. Historically the poet *sang* the line while the bowed *vielle* only held a drone beneath it. Figures such as **Bernart de Ventadorn**, the Comtessa **Beatriz de Dia** and the northern **Adam de la Halle** left melodies that still survive. It is the secular, vernacular counterpart to sacred chant — a parallel monophonic tradition of the garden rather than the cloister.

## How it sounds high quality

Because the troubadour *sang*, the melody is a human **voice** built with the shared **FOF vocal-synthesis** library ([`vocal-voices.js`](vocal-voices.js), default technique **FOF** — the IRCAM *CHANT* method), while the drone beneath stays an instrument, made subtractively:

- **Voice — FOF grains** — once per glottal period a burst of overlapping damped formant **grains** is fired, reconstructing a true sung vocal spectrum with real vowel formants (a e i o u). It runs sample-accurately in an `AudioWorklet`.
- **Voice — persistent singer** — each singer is a persistent library voice; only the pitch and vowel change from note to note, exactly as in real singing. Neighbouring pitches glide **legato** and held notes bloom with light **vibrato**, with the library's own breath for air.
- **Drone** — a sustained open fifth (tonic + fifth), made **subtractively** (detuned saw oscillators through a gently resonant low-pass pad with a breathing cutoff), holds beneath the voice as a *vielle* or *citole* would drone beneath a sung *canso*.
- **Ensemble** — the Solo / Duo / Ensemble control layers extra detuned, jittered singers over the lyric line, with a soft limiter and a warm **great-chamber convolution reverb** (~3.5 s tail with early reflections).

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
| [Synth Organum](https://github.com/BrendanJamesLynskey/Synth_Organum) | Notre-Dame polyphony | FOF vocal synthesis in Pythagorean just intonation |
| [Synth Ars Nova](https://github.com/BrendanJamesLynskey/Synth_ArsNova) | 14th-c. isorhythm | Formant vocal synthesis + isorhythmic talea/color |
| **Synth Troubadour** (this) | Secular monophony | FOF vocal synthesis (shared `vocal-voices.js` library, the sung melody) over a subtractive-synth vielle drone |
| [Synth Estampie](https://github.com/BrendanJamesLynskey/Synth_Estampie) | Medieval dance | Physical modelling (instrumental dance) |

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
| `vocal-voices.js` | Shared library of interchangeable vocal-synthesis engines (FOF, formant, additive, vocal-tract) |
| `troubadour-engine.js` | Song engine driving `vocal-voices.js` (sung melody) + subtractive vielle drone (Web Audio API) |
| `app.js` | UI controller, stave visualizer, rose petals |
| `troubadour_mobile.html` | Self-contained mobile version (single file) |

## Controls

| Control | Description |
|---|---|
| **Mode** | One of the 8 church tones (Dorian → Hypomixolydian) |
| **Voice** | Volume of the melody / lyric line |
| **Drone** | Volume of the sustained open-fifth drone |
| **Brightness** | Vocal brightness / vowel openness of the sung voice (and drone filter) — from dark and veiled to open and ringing |
| **Chamber Reverb** | Wet/dry mix of the warm great-chamber convolution reverb |
| **Pace** | Speed of the song |
| **Ensemble** | Solo (1), Duo (2), or Ensemble (3) layered voices |

## License

MIT
