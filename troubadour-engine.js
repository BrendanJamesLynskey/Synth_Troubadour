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
 * The melodies are a REPERTOIRE of REAL troubadour songs — only about a tenth
 * of the troubadour corpus survives with music, chiefly in chansonniers R
 * (BnF fr. 22543), G (Milan) and W / X (the "Manuscrit du Roi" family) — and
 * the five pieces here span the genres and forms of that surviving corpus:
 *
 *   1. CANSO  "A chantar m'er" (Comtessa de Dia, c. 1175) — the only canso by
 *      a trobairitz to survive with music (Manuscrit du Roi, BnF fr. 844).
 *      Frons + cauda form ABAB CDB, Dorian on D, free declamatory rhythm.
 *   2. CANSO  "Can vei la lauzeta mover" (Bernart de Ventadorn) — the most
 *      famous troubadour melody: through-composed (oda continua), eight
 *      arching phrases, Dorian on D (chansonnier R, f.56v).
 *   3. ALBA   "Reis glorios" (Guiraut de Bornelh) — the great dawn song:
 *      paired opening phrases (AA) + cauda closing to the "l'alba" refrain
 *      line, Dorian on D (chansonnier R, f.8v). Free rhythm.
 *   4. ESTAMPIDA "Kalenda maya" (Raimbaut de Vaqueiras) — the classic
 *      troubadour dance song (chansonnier R, f.62r): three PAIRED PUNCTA,
 *      the second pair with OUVERT (open, on D) and CLOS (closed, on C)
 *      endings, on final C — and, unlike the cansos, sung in a MEASURED
 *      lilting triple meter (rhythmic mode I, long–short), the defensible
 *      reading for a dance piece.
 *   5. VERS/CANSO "Lanquan li jorn son lonc en mai" (Jaufre Rudel) — the
 *      "distant love" song of the Rudel legend, ABAB CDB, final C as notated
 *      in chansonnier R (elsewhere often given on D).
 *
 * The singer PRONOUNCES the first stanza of each poem: every melodic syllable
 * carries its Occitan text (the piece's `lyrics`, one line per form entry,
 * one string per sung syllable), the sung vowel is the syllable's real
 * nucleus mapped to the a/e/i/o/u formant bank, and the library's consonant
 * articulator (`voice.articulate`) sounds each syllable's onset and coda
 * consonants at its edges — melismas stay legato on the one vowel.
 *
 * Pitches follow the manuscript readings as transcribed in the Troubadour
 * Melodies Database (troubadourmelodies.org, after van der Werf); liquescent
 * neumes are sung as light passing notes within the syllable's melisma. Each
 * piece re-tunes the vielle drone to its own FINAL + FIFTH, and on each new
 * start the engine moves to the next piece of the repertoire (the UI's mode
 * buttons choose a piece directly). Cansos and the alba keep the free
 * declamatory rhythm of the grand chant; the estampida alone is measured,
 * in a clear triple lilt — the two rhythmic worlds of the corpus.
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

        // The drone tonic — the vielle holds the FINAL of the current piece
        // plus its fifth beneath the whole song. Re-tuned per piece by
        // loadNextPiece(): D3 (146.83 Hz, +A3) for the D-final pieces,
        // C3 (130.81 Hz, +G3) for the C-final pieces.
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

        // === THE REPERTOIRE: real troubadour melodies from the manuscripts ===
        // Each inner array is ONE SYLLABLE of the lyric; several note names
        // together are a melisma sung legato on that syllable's vowel.
        // All melodies sit in the C4–D5 octave-plus of the sung line (well
        // inside the sampled vocal bank, which tops out at F#5).
        this.noteFreq = {
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
            A4: 440.00, Bb4: 466.16, B4: 493.88, C5: 523.25, D5: 587.33
        };

        this.repertoire = [
            {
                // "A chantar m'er de so qu'ieu non volria" — Comtessa de Dia,
                // Manuscrit du Roi (BnF fr. 844). Mode 1 (Dorian), final D4.
                // The melody spans C4 (the subtonium touched below the final
                // in phrase B) up to the single C5 climax in phrase D.
                id: 'achantar',
                title: "A chantar m'er",
                composer: 'Comtessa de Dia',
                genre: 'canso',
                rhythm: 'free',
                final: 146.83,          // drone D3 + A3
                phrases: {
                    // Phrase A — cadence on E
                    A: [['A4'], ['A4','G4'], ['F4'], ['F4','G4'], ['A4'], ['G4'],
                        ['F4','G4'], ['F4','E4'], ['D4'], ['F4','E4','D4'], ['E4']],
                    // Phrase B — cadence on D, the final (also closes the stanza)
                    B: [['C4'], ['D4'], ['E4'], ['F4','G4'], ['A4','G4'], ['F4','E4','D4'],
                        ['C4'], ['D4','E4'], ['F4'], ['E4','D4','C4'], ['D4']],
                    // Phrase C — cadence on F; the B is sung soft (B-flat), as
                    // the manuscript's mode allows.
                    C: [['A4'], ['A4'], ['A4','Bb4'], ['A4'], ['G4'], ['A4'], ['G4'],
                        ['F4','E4','D4'], ['E4'], ['F4']],
                    // Phrase D — the ONE melodic climax of the stanza (C5); cadence on E
                    D: [['F4'], ['F4'], ['A4'], ['C5'], ['B4'], ['A4'], ['G4'],
                        ['F4','E4'], ['D4'], ['F4','E4','D4'], ['E4']]
                },
                // Frons (A B)(A B) + cauda C D, the last line reusing B so
                // every stanza ends home on the final, D.
                form: ['A', 'B', 'A', 'B', 'C', 'D', 'B'],
                // First stanza, syllabified — one line per form entry, one
                // string per sung syllable. Lines 1–4 and 6 are feminine
                // (10' = 11 sung syllables), line 5 masculine (10) — exactly
                // the 11/11/11/11/10/11 syllables of phrases A B A B C D.
                // Line 7 is a 10-syllable masculine line sung to the 11-note
                // B phrase, so "s'ieu" is sung disyllabically (s'i-eu).
                lyrics: [
                    ['A', 'chan', 'tar', "m'er", 'de', 'so', "qu'ieu", 'non', 'vol', 'ri', 'a'],
                    ['tant', 'me', 'ran', 'cur', 'de', 'lui', 'cui', 'sui', 'a', 'mi', 'a'],
                    ['car', 'eu', "l'am", 'mais', 'que', 'nuil', 'la', 'ren', 'que', 'si', 'a'],
                    ['vas', 'lui', 'nom', 'val', 'mer', 'ces', 'ni', 'cor', 'te', 'si', 'a'],
                    ['ni', 'ma', 'bel', 'tatz', 'ni', 'mos', 'pretz', 'ni', 'mos', 'sens'],
                    ["c'a", 'tres', 'sim', 'sui', 'en', 'ga', 'na', "d'e", 'tra', 'i', 'a'],
                    ['com', 'degr', 'es', 'ser', "s'i", 'eu', 'fos', 'des', 'a', 'vi', 'nens']
                ]
            },
            {
                // "Can vei la lauzeta mover" — Bernart de Ventadorn,
                // chansonnier R f.56v. The most famous of all troubadour
                // melodies: through-composed (oda continua), eight arching
                // phrases rising to the D5 peak in phrase 3, Dorian, final D4.
                id: 'canvei',
                title: 'Can vei la lauzeta mover',
                composer: 'Bernart de Ventadorn',
                genre: 'canso',
                rhythm: 'free',
                final: 146.83,          // drone D3 + A3
                phrases: {
                    P1: [['D4'], ['F4'], ['G4'], ['A4'], ['A4'], ['A4'],
                         ['A4','G4','A4','B4'], ['A4','G4']],
                    P2: [['G4'], ['A4'], ['B4'], ['C5'], ['B4'],
                         ['A4','G4','F4'], ['G4'], ['A4']],
                    // Phrase 3 — the lark's climb: the melodic peak, D5
                    P3: [['C5'], ['D5'], ['C5','B4'], ['A4','G4'], ['A4','B4'],
                         ['A4'], ['A4','G4'], ['A4','G4','F4']],
                    P4: [['F4'], ['G4'], ['A4'], ['A4','B4','C5','B4'], ['G4'],
                         ['E4'], ['F4'], ['E4','D4','E4']],
                    P5: [['G4'], ['A4'], ['F4'], ['G4'], ['A4'], ['B4'],
                         ['C5','B4','C5','D5'], ['G4']],
                    P6: [['A4'], ['C5'], ['A4'], ['B4'], ['A4'], ['G4','F4'],
                         ['G4','A4','G4','F4'], ['E4']],
                    // Phrase 7 restates phrase 4's cadence material (the one
                    // melodic rhyme in the oda continua)
                    P7: [['F4'], ['G4'], ['A4'], ['A4','B4','C5','B4'], ['G4'],
                         ['E4'], ['F4'], ['E4','D4','E4']],
                    // Phrase 8 sinks to the final through the low C
                    P8: [['E4'], ['G4'], ['A4','G4'], ['F4'], ['G4','F4'],
                         ['E4','C4'], ['D4','E4'], ['F4','E4','D4']]
                },
                form: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
                // First stanza — eight octosyllabic lines, one per phrase,
                // 8 sung syllables each (matching the melody exactly).
                lyrics: [
                    ['Can', 'vei', 'la', 'lau', 'ze', 'ta', 'mo', 'ver'],
                    ['de', 'joi', 'sas', 'a', 'las', 'con', 'tral', 'rai'],
                    ['que', "s'o", 'bli', "d'es", 'lais', 'sa', 'cha', 'zer'],
                    ['per', 'la', 'dous', 'sor', "c'al", 'cor', 'li', 'vai'],
                    ['ai', 'tan', 'grans', 'en', 've', 'ya', "m'en", 've'],
                    ['de', 'cui', "qu'eu", 've', 'ya', 'jau', 'zi', 'on'],
                    ['me', 'ra', 'vi', 'lhas', 'ai', 'car', 'des', 'se'],
                    ['lo', 'cor', 'de', 'de', 'zi', 'rer', 'nom', 'fon']
                ]
            },
            {
                // "Reis glorios, verais lums e clartatz" — Guiraut de Bornelh,
                // chansonnier R f.8v. THE alba (dawn song): the watchman sings
                // till each stanza closes into the "et ades sera l'alba"
                // refrain line. Paired opening phrases (A A) + cauda, Dorian,
                // final D4, range C4–C5. Free declamatory rhythm.
                id: 'reisglorios',
                title: 'Reis glorios',
                composer: 'Guiraut de Bornelh',
                genre: 'alba',
                rhythm: 'free',
                final: 146.83,          // drone D3 + A3
                phrases: {
                    // A — sung TWICE (lines 1 and 2 share the melody): the
                    // fifth-leap opening D–A that makes this alba instantly known
                    A: [['D4'], ['D4'], ['A4'], ['A4'], ['A4','B4'], ['C5'],
                        ['B4','A4','B4'], ['G4'], ['A4','B4','C5'], ['B4','A4']],
                    // B — turns downward to the low register, cadence on C
                    B: [['A4','G4','A4','B4'], ['A4'], ['G4','F4'], ['E4'], ['E4'],
                        ['G4'], ['A4'], ['D4'], ['E4'], ['F4','E4','D4'], ['D4','C4']],
                    // C — climbs from the low C and re-sounds the B-phrase peak
                    C: [['C4'], ['D4'], ['E4'], ['F4','E4','D4'], ['A4','G4','A4','B4'],
                        ['A4'], ['G4','F4'], ['E4'], ['F4'], ['G4','F4','E4','D4'], ['E4']],
                    // R — the refrain line "et ades sera l'alba", home to D
                    R: [['C4'], ['D4'], ['E4'], ['F4'], ['G4','A4','G4'],
                        ['F4','E4','D4','E4','F4'], ['E4','D4']]
                },
                form: ['A', 'A', 'B', 'C', 'R'],
                // First stanza — two decasyllabic lines on the paired A
                // phrase (10 syllables each), two 10' feminine lines (11 sung)
                // on B and C, then the 7-syllable "l'alba" refrain on R.
                lyrics: [
                    ['Reis', 'glo', 'ri', 'os', 've', 'rais', 'lums', 'e', 'clar', 'tatz'],
                    ['Deus', 'po', 'de', 'ros', 'Se', 'nher', 'si', 'a', 'vos', 'platz'],
                    ['al', 'meu', 'com', 'panh', 'si', 'atz', 'fi', 'zels', 'a', 'iu', 'da'],
                    ["qu'eu", 'non', 'lo', 'vi', 'pos', 'la', 'nochs', 'fon', 'ven', 'gu', 'da'],
                    ['et', 'a', 'des', 'se', 'ra', "l'al", 'ba']
                ]
            },
            {
                // "Kalenda maya" — Raimbaut de Vaqueiras, chansonnier R f.62r:
                // the one troubadour ESTAMPIDA to survive with its music (the
                // vida says Raimbaut set his words to an estampida two French
                // jongleurs fiddled at the Montferrat court). Three PAIRED
                // PUNCTA: the first punctum repeated exactly, the second with
                // OUVERT (open, ending D) and CLOS (closed, ending C) endings,
                // the third paired with varied close. Final C4, range C4–C5
                // with the manuscript's B-flat inflection. Sung MEASURED, in
                // a lilting triple meter (rhythmic mode I, long–short) — the
                // dance rhythm that sets the estampida apart from the canso.
                id: 'kalenda',
                title: 'Kalenda maya',
                composer: 'Raimbaut de Vaqueiras',
                genre: 'estampida',
                rhythm: 'triple',
                tempoScale: 2.1,        // dance pulse ≈ 2× the canso syllable
                final: 130.81,          // drone C3 + G3
                phrases: {
                    // Punctum I (sung twice, exact): rises through the B-flat
                    // to the C5 peak, then falls the full octave to C4
                    P1: [['E4'], ['G4'], ['G4'], ['A4','G4'], ['F4'], ['G4'],
                         ['A4'], ['Bb4'], ['A4'], ['G4'], ['A4'], ['B4'], ['C5'],
                         ['B4','A4'], ['G4'], ['E4'], ['F4'], ['E4','D4'], ['C4']],
                    // Punctum II — OUVERT: the open ending, hanging on D
                    O:  [['E4'], ['G4'], ['G4'], ['A4'], ['B4'], ['G4','F4'],
                         ['F4'], ['E4','D4'], ['D4']],
                    // Punctum II — CLOS: the same phrase closed onto the final C
                    C:  [['E4'], ['G4'], ['A4'], ['B4'], ['B4'], ['G4','F4'],
                         ['F4'], ['E4','D4'], ['C4']],
                    // Punctum III (paired, close varied): the rocking E–D–C
                    // figure of the "bella cavalhiera" lines
                    P3a: [['E4'], ['D4'], ['C4'], ['E4'], ['D4'], ['C4'], ['E4'],
                          ['G4'], ['G4'], ['E4'], ['F4','E4'], ['D4','C4'], ['C4']],
                    P3b: [['E4'], ['D4'], ['C4'], ['E4'], ['D4'], ['C4'], ['E4'],
                          ['G4'], ['G4'], ['E4'], ['F4'], ['E4','F4','E4','D4'], ['D4','C4']]
                },
                form: ['P1', 'P1', 'O', 'C', 'P3a', 'P3b'],
                // First stanza. The short -aya lines group onto the puncta:
                // each 19-note punctum I carries three lines (5 + 5 + 9 sung
                // syllables), ouvert and clos take one 9-syllable line each,
                // and the paired punctum III lines are 13 sung syllables
                // ("e jaya / e·m traya / vas vos, domna veraya..."). Every
                // count matches the melody exactly — no padding or trimming.
                lyrics: [
                    ['Ka', 'len', 'da', 'ma', 'ya', 'ni', 'fueills', 'de', 'fa', 'ya',
                     'ni', 'chans', "d'au", 'zell', 'ni', 'flors', 'de', 'gla', 'ya'],
                    ['non', 'es', 'qem', 'pla', 'ya', 'pros', 'do', 'na', 'ga', 'ya',
                     'tro', "q'un", 'is', 'nell', 'mes', 'sa', 'gier', 'a', 'ya'],
                    ['del', 'vos', 'tre', 'bell', 'cors', 'qim', 're', 'tra', 'ya'],
                    ['pla', 'zer', 'no', 'vell', "q'a", 'mors', "m'a", 'tra', 'ya'],
                    ['e', 'ja', 'ya', 'em', 'tra', 'ya', 'vas', 'vos', 'dom', 'na', 've', 'ra', 'ya'],
                    ['e', 'cha', 'ya', 'de', 'pla', 'yal', 'ge', 'los', 'anz', 'qem', "n'es", 'tra', 'ya']
                ]
            },
            {
                // "Lanquan li jorn son lonc en mai" — Jaufre Rudel, the song
                // of amor de lonh (love from afar), as notated in chansonnier
                // R: final C4, range C4–C5 (other manuscripts give the melody
                // a tone higher, on D). The same ABAB CDB frons-and-cauda form
                // as "A chantar", with the cauda leaping to the high register.
                id: 'lanquan',
                title: 'Lanquan li jorn son lonc en mai',
                composer: 'Jaufre Rudel',
                genre: 'vers',
                rhythm: 'free',
                final: 130.81,          // drone C3 + G3
                phrases: {
                    A: [['C4','D4'], ['F4'], ['F4'], ['F4'], ['F4','E4'],
                        ['E4','D4','C4','D4'], ['E4','D4','E4','F4'], ['E4','D4']],
                    B: [['D4'], ['F4'], ['G4','F4','G4','A4'], ['G4'], ['F4'],
                        ['E4','D4','C4','D4'], ['E4','D4','E4','F4'], ['E4','D4','C4']],
                    // C — the cauda springs an octave up to the reciting C5
                    C: [['G4','A4'], ['C5'], ['C5'], ['C5'], ['C5'],
                        ['B4','A4','G4','A4'], ['B4','A4','B4','C5'], ['B4','A4','G4']],
                    D: [['G4','A4','B4','C5'], ['B4'], ['A4'], ['G4'],
                        ['F4','G4','A4'], ['G4'], ['F4'], ['E4','D4','C4']]
                },
                form: ['A', 'B', 'A', 'B', 'C', 'D', 'B'],
                // First stanza — seven octosyllabic masculine lines, 8 sung
                // syllables each, matching the 8-syllable phrases exactly.
                lyrics: [
                    ['Lan', 'quan', 'li', 'jorn', 'son', 'lonc', 'en', 'may'],
                    ["m'es", 'bels', 'dous', 'chans', "d'au", 'zels', 'de', 'lonh'],
                    ['e', 'quan', 'me', 'sui', 'par', 'titz', 'de', 'lai'],
                    ['re', 'mem', 'bram', "d'un", 'a', 'mor', 'de', 'lonh'],
                    ['vau', 'de', 'ta', 'lan', 'em', 'broncs', 'e', 'clis'],
                    ['si', 'que', 'chans', 'ni', 'flors', "d'al", 'bes', 'pis'],
                    ['nom', 'platz', 'plus', 'que', "l'i", 'verns', 'ge', 'latz']
                ]
            }
        ];

        this.pieceIndex = 0;            // the NEXT piece the cycle will play
        this.requestedPiece = null;     // set by the UI's piece (mode) buttons
        this.currentPiece = null;
        this.songPhrases = this.repertoire[0].phrases;
        this.stanzaForm = this.repertoire[0].form;

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

    /**
     * The vowel actually SUNG for a syllable of Occitan lyric — the nearest
     * vowel in the a/e/i/o/u formant bank to the syllable's nucleus:
     * ai/ei→e, au→a, ou/oi→o, ieu/eu/ue(i)→e, ui→u, iu→u, y-as-glide is a
     * consonant ("ya" → a) but y-as-nucleus → i. "qu"/"gu" before e/i keep
     * their u silent (que → e, gui → i). Returns null if no vowel found.
     */
    lyricVowel(text) {
        if (!text) return null;
        let s = text.toLowerCase().replace(/[^a-z]/g, '');   // drop apostrophes / punctuation
        s = s.replace(/qu(?=[ei])/g, 'q').replace(/gu(?=[ei])/g, 'g'); // silent u
        s = s.replace(/([aeiou])y/g, '$1i');                 // vocalic off-glide y → i (may → mai)
        const m = s.match(/[aeiou]+/);                       // first vowel cluster = the nucleus
        if (!m) return /y/.test(s) ? 'i' : null;             // bare y nucleus → i
        const v = m[0];
        const diph = {
            ai: 'e', ei: 'e', au: 'a', ou: 'o', oi: 'o',
            eu: 'e', ieu: 'e', ie: 'e', ue: 'e', uei: 'e',
            ui: 'u', iu: 'u', io: 'o', ia: 'a', iei: 'e'
        };
        if (diph[v]) return diph[v];
        return this.vowels[v[0]] ? v[0] : null;
    }

    // === Melody: the troubadour repertoire (see the header for the pieces) ===

    /**
     * Advance to the next piece of the repertoire (or to the piece the UI
     * requested) and re-point the song data and the drone tonic at it. The
     * caller re-tunes/starts the drone so the vielle always holds the new
     * piece's FINAL + FIFTH.
     */
    loadNextPiece() {
        const n = this.repertoire.length;
        const idx = this.requestedPiece != null
            ? ((this.requestedPiece % n) + n) % n
            : this.pieceIndex % n;
        this.requestedPiece = null;
        this.currentPiece = this.repertoire[idx];
        this.pieceIndex = (idx + 1) % n;      // cycle: a different song next time
        this.basePitch = this.currentPiece.final;
        this.songPhrases = this.currentPiece.phrases;
        this.stanzaForm = this.currentPiece.form;
        this.songSequence = [];
        this.songPos = 0;
    }

    start() {
        this.isPlaying = true;
        if (!this.currentPiece) {
            this.loadNextPiece();
            if (this.droneNodes.length) this.startDrone();   // re-tune the vielle
        }
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
     * Lay out one full stanza of the current piece as a flat list of
     * syllables, following the piece's own form:
     *
     *   - "A chantar" / "Lanquan li jorn":  A B A B | C D B  (frons + cauda)
     *   - "Can vei la lauzeta":             P1..P8 through-composed
     *   - "Reis glorios" (alba):            A A B C R (R = the l'alba refrain)
     *   - "Kalenda maya" (estampida):       P1 P1 | O C | P3a P3b — paired
     *                                       puncta, ouvert then clos
     *
     * The LITERAL return of whole phrases (exact melodic repetition) is what
     * marks these as troubadour song rather than plainchant, so repeated
     * phrases are quoted verbatim. Every piece is strophic: when the stanza
     * ends, the singer rests a moment and begins the melody again for the
     * next stanza of the poem.
     */
    buildStanza() {
        const seq = [];
        const lyrics = this.currentPiece ? this.currentPiece.lyrics : null;
        this.stanzaForm.forEach((name, li) => {
            const phrase = this.songPhrases[name];
            const line = lyrics ? lyrics[li] : null;    // the stanza line sung to this phrase
            phrase.forEach((notes, si) => {
                seq.push({
                    notes,                               // 1–5 note names: a syllable, maybe a melisma
                    text: line ? (line[si] || null) : null, // the sung syllable's Occitan text
                    sylIndex: si,                        // position in the phrase (drives the triple lilt)
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

        // One sung vowel per syllable — the REAL vowel of the lyric syllable
        // (Occitan nucleus mapped to the nearest bank vowel); textless
        // syllables fall back to the rotating Occitan-ish sequence.
        let vowel = this.lyricVowel(syl.text);
        if (!vowel) {
            vowel = this.vowelSequence[this.vowelPos % this.vowelSequence.length];
            this.vowelPos = (this.vowelPos + 1) % this.vowelSequence.length;
        }

        // Rhythm per GENRE — the two rhythmic worlds of the corpus:
        //
        //   'free'   (canso / alba / vers): free declamatory rhythm, no
        //            metronomic grid. `tempo` is syllables per minute (~104 →
        //            ≈0.58 s a syllable) with a gentle ±7% humanising jitter;
        //            each phrase-final (cadence) note stretches ×1.75.
        //
        //   'triple' (estampida / dansa): MEASURED, a lilting triple meter —
        //            rhythmic mode I (trochaic long–short): syllables
        //            alternate 2 pulses + 1 pulse so each pair fills one
        //            3-pulse bar, and every punctum cadence holds a full bar.
        //            Only a hair of jitter: a dance keeps its grid.
        const rhythm = this.currentPiece ? this.currentPiece.rhythm : 'free';
        const tempoScale = (this.currentPiece && this.currentPiece.tempoScale) || 1;
        let syllableDur;
        if (rhythm === 'triple') {
            const pulse = 60 / (this.tempo * tempoScale);
            const pulses = syl.phraseEnd ? 3 : (syl.sylIndex % 2 === 0 ? 2 : 1);
            syllableDur = pulse * pulses * (1 + (Math.random() * 2 - 1) * 0.015);
        } else {
            syllableDur = (60 / (this.tempo * tempoScale)) * (1 + (Math.random() * 2 - 1) * 0.07);
            if (syl.phraseEnd) syllableDur *= 1.75;
        }

        // A melisma splits its syllable's time evenly across the notes, sung
        // legato on the one vowel with a short (10–20 ms) portamento between
        // them. Fresh syllables re-articulate — no glide across syllables.
        const freqs = syl.notes.map((n) => this.noteFreq[n]);
        const noteDur = syllableDur / freqs.length;

        // Pronounce the syllable's CONSONANTS once per sung syllable: onset
        // consonants are scheduled to END at the first note's start, coda
        // consonants at the end of the LAST melisma note — so a melisma flows
        // unbroken on the vowel and only the syllable's edges are articulated.
        if (syl.text) {
            const sylStart = this.ctx.currentTime;
            const sylEnd = sylStart + syllableDur;
            for (const voice of this.voices) {
                if (voice.voice.articulate) {
                    voice.voice.articulate(syl.text, sylStart, sylEnd, freqs[0]);
                }
            }
        }

        freqs.forEach((freq, i) => {
            const slideFrom = i > 0 ? freqs[i - 1] : null;
            const glideTime = slideFrom ? 0.012 + Math.random() * 0.008 : 0;
            this.playMelodyNote(freq, noteDur, i * noteDur, vowel, slideFrom, glideTime);
        });

        this.songPos++;
        // Breathe after each phrase; rest longer between stanzas; only the
        // tiniest lift between syllables within a phrase. In the measured
        // estampida the breath is METRICAL — exactly one pulse — so the dance
        // never loses its step.
        let pause = 0.02;
        if (syl.stanzaEnd) {
            pause = 1.0 + Math.random() * 0.5;   // strophic: begin the next stanza
            this.buildStanza();
        } else if (syl.phraseEnd) {
            pause = rhythm === 'triple'
                ? 60 / (this.tempo * tempoScale)     // one pulse of the bar
                : 0.4 + Math.random() * 0.3;         // a singer's breath
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
        this.loadNextPiece();               // cycle the repertoire on each start
        this.setupVoices();
        this.startDrone();                  // ...so the drone rises on the new final
        setTimeout(() => { if (!this.isPlaying) this.start(); }, 1500);
    }

    end() { this.stop(); }

    /**
     * The UI's mode buttons now choose the PIECE (each historical melody
     * carries its own mode and final): 1 "A chantar", 2 "Can vei la lauzeta",
     * 3 "Reis glorios", 4 "Kalenda maya", 5 "Lanquan li jorn" (higher numbers
     * wrap around the repertoire). If the singer is mid-song, the new piece
     * begins at once, the vielle re-tuning to its final.
     */
    setMode(mode) {
        this.currentMode = mode;
        this.requestedPiece = (mode - 1) % this.repertoire.length;
        if (this.isPlaying) {
            if (this.phraseTimeout) { clearTimeout(this.phraseTimeout); this.phraseTimeout = null; }
            this.loadNextPiece();
            if (this.droneNodes.length) this.startDrone();   // re-tune the fifth
            this.buildStanza();
            this.scheduleNote();
        }
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
