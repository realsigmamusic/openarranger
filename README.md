# OpenArranger

OpenArranger is an open-source, web-based, offline-first accompaniment tool designed for gigging solo musicians. It emulates the behavior of traditional hardware arranger keyboards, allowing real-time control over non-linear drum patterns (Mains, Fills, Intros, Endings, and Breaks) with zero audio latency.

<img src="screenshot.jpg" width="45%">

## Key Features

- **Performance-Driven UI:** Large, ergonomic vertical grid designed specifically for mobile devices and live stage environments.
- **Dynamic Quantization:** Seamless section transitions supporting full-measure, half-measure, or quarter-measure execution.
- **Zero-Latency Audio Engine:** Built entirely on top of the Web Audio API for rock-solid, sample-accurate clock timing.
- **Open Standards:** Uses standard MIDI files and human-readable text formats, allowing creators to produce content using any DAW.
- **Decoupled Architecture:** Audio kits and rhythm styles are completely independent, enabling infinite sound combinations.

## Sound Kit Specification (.kit)

A Sound Kit is a compressed `.zip` archive renamed to `.kit`. It must contain a simplified `.sfz` definition file at the root level alongside a `Samples/` directory containing the audio waveforms (WAV).

### Supported SFZ Opcodes

The custom parser supports a subset of the standard SFZ specification:

- **`<control>`**: `default_path`
- **`<global>`**: `loop_mode`
- **`<group>`**: `group`, `off_by`, `group_label`
- **`<region>`**: `key`, `sample`

### Example `drumkit.sfz`

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

The core engine maps performance sections based on full bars, decoupling the musical data from rigid, linear playback.

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

## License & Credits

This project is open-source and available under the MIT License.

* Maskable icon utility by [NotWoods - Maskable](https://github.com/NotWoods/maskable)
* [jszip](https://stuk.github.io/jszip/)
