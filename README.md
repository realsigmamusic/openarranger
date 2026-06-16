# OpenArranger

OpenArranger is an open-source, web-based, offline-first accompaniment tool designed for gigging solo musicians. It emulates the behavior of traditional hardware arranger keyboards, allowing real-time control over non-linear drum patterns (Mains, Fills, Intros, Endings, and Breaks) with zero audio latency.

<img src="screenshot.jpg" width="80%">

## Key Features

- **Performance-Driven UI:** Large, ergonomic vertical grid designed specifically for mobile devices and live stage environments.
- **Dynamic Quantization:** Seamless section transitions supporting full-measure, half-measure, or quarter-measure execution.
- **Zero-Latency Audio Engine:** Built entirely on top of the Web Audio API for rock-solid, sample-accurate clock timing.
- **Visual Routing Feedback:** Intro, Fill, and Break buttons always preview their destination section, so you always know where the music is going.
- **Open Standards:** Uses standard MIDI files and human-readable text formats, allowing creators to produce content using any DAW.
- **Decoupled Architecture:** Audio kits and rhythm styles are completely independent, enabling infinite sound combinations.

## Sound Kit Specification (.kit)

A Sound Kit is a compressed `.zip` archive renamed to `.kit`. It must contain one or more `.sfz` definition files at the root level alongside a single `Samples/` directory containing the audio waveforms (WAV). All SFZs inside the same kit share the same `Samples/` folder, avoiding duplication.

When a kit with multiple SFZs is loaded, a selector appears in the UI allowing real-time switching between them.

### Supported SFZ Opcodes

The custom parser supports a subset of the standard SFZ specification:

- **`<control>`**: `default_path`
- **`<global>`**: `loop_mode`
- **`<group>`**: `group`, `off_by`, `group_label`
- **`<region>`**: `key`, `sample`

### Example kit structure

```
drumkit.kit (zip)
├── standard.sfz
├── brush.sfz
└── Samples/
    ├── Kick_036.wav
    ├── Snare_038.wav
    └── ...
```

### Example `standard.sfz`

```sfz
<control> default_path=Samples/

<global> loop_mode=one_shot

<group> group_label=Kick
<region> key=36 sample=Kick_036.wav

<group> group_label=Snare
<region> key=37 sample=Snare_037.wav
<region> key=38 sample=Snare_038.wav

<group> group_label=Hihat
<region> key=42 sample=Hihat_042.wav group=1 off_by=1
<region> key=44 sample=Hihat_044.wav group=1 off_by=1
<region> key=46 sample=Hihat_046.wav group=1 off_by=1
```

## Style Specification (.style)

A Style is a compressed `.zip` archive renamed to `.style`. It must contain a single Standard MIDI File (`.mid`) alongside a structure configuration file named `style.json`.

Multiple `.style` files can be loaded at once. The active style is selected via a dropdown in the UI. The engine always starts at **Intro A** when a new style is applied.

The core engine maps performance sections based on full bars, decoupling the musical data from rigid, linear playback.

### `style.json` fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Display name |
| `timeSignature` | [number, number] | ✅ | e.g. `[4, 4]` or `[6, 8]` |
| `bpm` | number | ✅ | Default tempo |
| `drumChannel` | number or array | ✅ | MIDI channel(s) for drums, e.g. `10` or `[9, 10]` |
| `sections` | object | ✅ | Section map (see below) |
| `beatUnit` | string or number | — | Beat subdivision for compound time (see below) |

### Example `style.json`

```json
{
  "name": "Pop Ballad",
  "timeSignature": [4, 4],
  "bpm": 67,
  "drumChannel": 10,
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

| Value | Meaning |
|---|---|
| `4` | Quarter note — default, same as omitting the field |
| `8` | Eighth note |
| `"4."` | Dotted quarter note |
| `2` | Half note |

```json
{
  "name": "Baião",
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