# OpenArranger
OpenArranger is an open-source, web-based, offline-first accompaniment tool designed for gigging solo musicians. It emulates the behavior of traditional hardware arranger keyboards, allowing real-time control over non-linear drum patterns (Mains, Fills, Intros, Endings, and Breaks) with zero audio latency.

<img src="screenshot.jpg" width="100%">

## Key Features
- **Performance-Driven UI:** Large, ergonomic vertical grid designed specifically for mobile devices and live stage environments.
- **Dynamic Quantization:** Seamless section transitions supporting full-measure, half-measure, or quarter-measure execution.
- **Dual Rhythm Engine (v2.0.0):** Independent routing, kit selection, and volume controls for Main Rhythm and SubRhythm (Percussion) channels.
- **Zero-Latency Audio Engine:** Built entirely on top of the Web Audio API for rock-solid, sample-accurate clock timing.
- **Visual Routing Feedback:** Intro, Fill, and Break buttons always preview their destination section, so you always know where the music is going.
- **Open Standards:** Uses standard MIDI files and human-readable text formats, allowing creators to produce content using any DAW.
- **Decoupled Architecture:** Audio kits and rhythm styles are completely independent, enabling infinite sound combinations.

## Sound Kit Specification (.kit)
A Sound Kit is a compressed `.zip` archive renamed to `.kit`. It must contain one or more `.sfz` definition files at the root level alongside a single `Samples/` directory containing the audio waveforms (WAV). All SFZs inside the same kit share the same `Samples/` folder, avoiding duplication.

When a kit with multiple SFZs is loaded, **two independent selectors** appear in the UI: one for the Main Rhythm channel and one for the SubRhythm channel. This allows real-time mixing and matching of different kits (e.g., a Standard drum kit for the main beat and a Latin kit for the percussion), each with its own volume control.

### Supported SFZ Opcodes
The custom parser supports a subset of the standard SFZ specification:

- **`<control>`**: `default_path`
- **`<global>`**: `loop_mode`
- **`<group>`**: `group`, `off_by`, `group_label`
- **`<region>`**: `key`, `sample`

### Example kit structure
```
drumkit.kit (zip)
├── StandardKit1.sfz
├── PopLatinKit.sfz
└── Samples/
├── StandardKit1 036.wav
├── StandardKit1 062.wav
└── ...
```

### Example `standard.sfz`
```sfz
<control> default_path=Samples/

<global> loop_mode=one_shot

<region> key=36 sample=StandardKit1 036.wav
<region> key=37 sample=StandardKit1 037.wav
<region> key=38 sample=StandardKit1 038.wav
<region> key=39 sample=StandardKit1 039.wav
<region> key=40 sample=StandardKit1 040.wav
<region> key=41 sample=StandardKit1 041.wav
<region> key=42 sample=StandardKit1 042.wav group=1 off_by=1
<region> key=43 sample=StandardKit1 043.wav
<region> key=44 sample=StandardKit1 044.wav group=1 off_by=1
<region> key=45 sample=StandardKit1 045.wav
<region> key=46 sample=StandardKit1 046.wav group=1 off_by=1
```

## Style Specification (.style)
A Style is a compressed `.zip` archive renamed to `.style`. It must contain exactly one Standard MIDI File (`.mid`) and one configuration file (`.json`) at the root level. The exact filenames do not matter, as the engine identifies them by their extensions.

Multiple `.style` files can be loaded at once. The active style is selected via a dropdown in the UI. The engine always starts at **Intro A** when a new style is applied.

The core engine maps performance sections based on full bars, decoupling the musical data from rigid, linear playback.

### `style.json` fields
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | ✅ | Display name |
| `timeSignature` | [number, number] | ✅ | e.g. `[4, 4]` or `[6, 8]` |
| `bpm` | number | ✅ | Default tempo |
| `rhythmChannel` | number | ✅ | MIDI channel for the main drum kit (e.g., `10`) |
| `subRhythmChannel` | number | ✅ | MIDI channel for percussion/sub-rhythm (e.g., `11`) |
| `sections` | object | ✅ | Section map (see below) |
| `beatUnit` | string or number | — | Beat subdivision for compound time (see below) |

### Example `style.json`
```json
{
  "name": "Pop Ballad",
  "timeSignature": [4, 4],
  "bpm": 67,
  "rhythmChannel": 10,
  "subRhythmChannel": 9,
  "sections": {
    "Main A": { "startBar": 2, "endBar": 6 },
    "Main B": { "startBar": 6, "endBar": 10 },
    "Fill In A": { "startBar": 10, "endBar": 11 },
    "Fill In B": { "startBar": 11, "endBar": 12 },
    "Intro A": { "startBar": 12, "endBar": 13 },
    "Ending A": { "startBar": 13, "endBar": 14 },
    "Break": { "startBar": 14, "endBar": 15 }
  }
}
```

### Compound time signatures and `beatUnit`
In compound meters (6/8, 12/8, etc.), the beat unit is ambiguous — a musician may feel the pulse as a dotted quarter note or as an eighth note. The `beatUnit` field lets the style creator declare this explicitly, so both the tap tempo and internal playback speed behave correctly.

| Value  | Meaning                                            |
| ------ | -------------------------------------------------- |
| `4`    | Quarter note — default, same as omitting the field |
| `8`    | Eighth note                                        |
| `"4."` | Dotted quarter note                                |
| `2`    | Half note                                          |

```json
{
  "name": "Ballad",
  "timeSignature": [6, 8],
  "beatUnit": "4.",
  "bpm": 72
}

```

When `beatUnit` is omitted, the engine defaults to a quarter note — preserving full backward compatibility with existing styles.

## License & Credits
This project is open-source and available under the MIT License.

* Maskable icon utility by [NotWoods - Maskable](https://github.com/NotWoods/maskable)
* [jszip](https://stuk.github.io/jszip/)