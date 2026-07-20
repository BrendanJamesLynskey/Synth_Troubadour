# Synth Troubadour — Courtly Song Synthesizer

A web-based synthesizer that sings the **courtly songs of the troubadours** in real time in the browser. A haunting solo voice sings the melody with **real recorded singing**: the shared [`vocal-voices.js`](vocal-voices.js) library plays actual sung vowels from the [**VocalSet**](https://zenodo.org/records/1193957) corpus (CC BY 4.0), pitch-mapped by a **formant-preserving**, in-tune splice sampler with expressive vibrato and breath, **over a subtractive-synth vielle drone**.

It sings a **repertoire of five real surviving troubadour melodies**, transcribed from the chansonniers and spanning the genres of the corpus: *A chantar m'er* (Comtessa de Dia — the only canso by a trobairitz to survive with music), *Can vei la lauzeta mover* (Bernart de Ventadorn), the alba *Reis glorios* (Guiraut de Bornelh), the estampida *Kalenda maya* (Raimbaut de Vaqueiras) and *Lanquan li jorn son lonc en mai* (Jaufre Rudel) — each in its genre-appropriate rhythm, with the first stanza's Occitan text pronounced syllable by syllable.

> **Credit:** sampled voices derived from [**VocalSet**](https://zenodo.org/records/1193957) (Wilkins, Seetharaman, Wahl & Pardo, ISMIR 2018), CC BY 4.0.

**[Launch the app](https://brendanjameslynskey.github.io/Synth_Troubadour/)** — auto-detects your device and recommends desktop or mobile.

---

## The style

**Troubadour song** is the secular, vernacular art of the poet-composers of 12th–13th-century Occitania — and, in the north of France, the trouvères. Where Gregorian chant sang scripture in Latin for the abbey, the troubadours sang in Occitan and Old French for the court: the great repertoire of *fin'amor*, courtly love, prizing the lady, longing and desire.

Their songs took shape as the **canso** (love-song), the **dansa** and the lively **estampida** — each a single monophonic melody, flexible in rhythm. Historically the poet *sang* the line while the bowed *vielle* only held a drone beneath it. Figures such as **Bernart de Ventadorn**, the Comtessa **Beatriz de Dia** and the northern **Adam de la Halle** left melodies that still survive. It is the secular, vernacular counterpart to sacred chant — a parallel monophonic tradition of the garden rather than the cloister.

## How it sounds high quality

Because the troubadour *sang*, the melody is a human **voice** from the shared **sampled-voice** library ([`vocal-voices.js`](vocal-voices.js)), while the drone beneath stays an instrument, made subtractively:

- **Voice — real recorded singing** — actual sung vowels from the **VocalSet** corpus, sustained by a phase-coherent **splice sampler**: each note plays the nearest recorded pitch, detuned by at most about a semitone, so the formants stay put and the line is dead in tune. Every melodic syllable carries its real Occitan text: the sung vowel is the syllable's nucleus and the library's procedural **consonants** sound its onset and coda, while melismas stay legato on the one vowel.
- **Voice — persistent singer** — each singer is a persistent library voice; only the pitch and vowel change from note to note, exactly as in real singing. Neighbouring pitches glide **legato** and held notes bloom with expressive **vibrato**, with the library's own breath for air.
- **Drone** — a sustained open fifth (tonic + fifth), made **subtractively** (detuned saw oscillators through a gently resonant low-pass pad with a breathing cutoff), holds beneath the voice as a *vielle* or *citole* would drone beneath a sung *canso*.
- **Ensemble** — the Solo / Duo / Ensemble control layers extra detuned, jittered singers over the lyric line, with a soft limiter and a warm **great-chamber convolution reverb** (~3.5 s tail with early reflections).

The melodies themselves are **real**, following the manuscript readings (after the Troubadour Melodies Database / van der Werf), and each piece keeps its historical form — frons + cauda, through-composed *oda continua*, the alba's *l'alba* refrain, or the estampida's paired puncta with *ouvert* and *clos* endings — re-tuning the vielle drone to its own final + fifth. The cansos flow in free declamatory rhythm; *Kalenda maya*, a dance song, is sung in a measured lilting triple metre.

## Where it sits — the lineage of early Western music

Troubadour song is the **secular, vernacular** branch that runs alongside sacred chant. Its songs and dances fed directly into instrumental forms like the **estampie**:

```
Plainsong ──► Organum ──► Ars Nova ──► (Renaissance polyphony)
   │  (a 2nd voice   (rhythmic
   │   is added)      sophistication)
   │
   └── a parallel secular branch: Troubadour song ──► instrumental estampie dances
```

| App | Style | Voice |
|---|---|---|
| [Synth Gregorian](https://github.com/BrendanJamesLynskey/Synth_Gregorian) | Plainsong | Ethereal sine tones by default; optional real sampled voices, straight-tone chant |
| [Synth Organum](https://github.com/BrendanJamesLynskey/Synth_Organum) | Notre-Dame polyphony | Real sampled voices in Pythagorean just intonation |
| **Synth Troubadour** (this) | Secular monophony | Real sampled voice (the sung melody) over a subtractive-synth vielle drone |

The shared sampled voice that sings this app, Organum and Gregorian's optional **Voices** timbre is explored in depth — alongside a century of pure-synthesis techniques — in [Vocal Synthesis](https://github.com/BrendanJamesLynskey/Vocal_Synthesis).

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
| `vocal-voices.js` | Shared sampled-voice library — real VocalSet vowels, formant-preserving pitch-mapping, and procedural consonant articulation |
| `troubadour-engine.js` | Song engine (five-piece repertoire) driving `vocal-voices.js` (sung melody) + subtractive vielle drone (Web Audio API) |
| `app.js` | UI controller, stave visualizer, rose petals |
| `troubadour_mobile.html` | Self-contained mobile version (single file) |

## Controls

| Control | Description |
|---|---|
| **Mode** | Chooses the **piece** — I *A chantar m'er*, II *Can vei la lauzeta*, III *Reis glorios*, IV *Kalenda maya*, V *Lanquan li jorn* (higher buttons wrap around); each melody carries its own historical mode and final |
| **Voice** | Volume of the melody / lyric line |
| **Drone** | Volume of the sustained open-fifth drone |
| **Brightness** | Vocal brightness / vowel openness of the sung voice (and drone filter) — from dark and veiled to open and ringing |
| **Chamber Reverb** | Wet/dry mix of the warm great-chamber convolution reverb |
| **Pace** | Speed of the song |
| **Ensemble** | Solo (1), Duo (2), or Ensemble (3) layered voices |

## License

MIT
