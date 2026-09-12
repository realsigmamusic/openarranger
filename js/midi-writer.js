// ==================================================================================================
// MIDI WRITER — geração de arquivos .mid (zero dependências)
// ==================================================================================================
// Funções puras: recebem dados de eventos, devolvem bytes. Contraparte de midi-parser.js.
// Sempre gera Format 1 (track "Conductor" separada das tracks de notas), como a maioria das DAWs.

/** Codifica um número no formato "variable length quantity" usado pelo formato MIDI. */
export function midiVarLen(value) {
	let buf = value & 0x7f;
	const bytes = [];
	value >>>= 7;
	while (value > 0) {
		bytes.unshift((value & 0x7f) | 0x80);
		value >>>= 7;
	}
	bytes.push(buf);
	return bytes;
}

/** beatType (4, 8, 2, 16...) → expoente de potência de 2 exigido pelo meta-evento Time Signature. */
export function denominatorPower(beatType) {
	return Math.max(0, Math.round(Math.log2(beatType || 4)));
}

/** Ordena eventos de uma track por tick; em empate: meta-eventos, depois note-off, depois note-on. */
export function sortTrackEvents(events) {
	return events.slice().sort((a, b) => a.tick - b.tick
		|| ((a.kind ? 0 : 1) - (b.kind ? 0 : 1))
		|| ((a.type === 'off' ? 0 : 1) - (b.type === 'off' ? 0 : 1)));
}

/** Serializa uma lista de eventos (notas e/ou meta-eventos de tempo/compasso) numa track MIDI. */
export function buildTrackBytes(events, trackName) {
	const bytes = [];
	if (trackName) {
		const nameBytes = [...trackName].map(c => c.charCodeAt(0) & 0x7f);
		bytes.push(...midiVarLen(0), 0xFF, 0x03, nameBytes.length, ...nameBytes);
	}
	let lastTick = 0;
	for (const ev of sortTrackEvents(events)) {
		bytes.push(...midiVarLen(Math.max(0, ev.tick - lastTick)));
		lastTick = ev.tick;
		if (ev.kind === 'tempo') {
			const microsPerBeat = Math.max(1, Math.round(60000000 / ev.bpm));
			bytes.push(0xFF, 0x51, 0x03, (microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff);
		} else if (ev.kind === 'timesig') {
			bytes.push(0xFF, 0x58, 0x04, ev.num & 0xff, denominatorPower(ev.beatType) & 0xff, 24, 8);
		} else {
			const status = (ev.type === 'on' ? 0x90 : 0x80) | (ev.channel & 0x0f);
			bytes.push(status, ev.note & 0x7f, ev.velocity & 0x7f);
		}
	}
	bytes.push(...midiVarLen(0), 0xFF, 0x2F, 0x00); // End of Track
	return bytes;
}

/** Envolve os bytes de uma track no chunk "MTrk" com seu tamanho. */
export function wrapTrackChunk(bytes) {
	return [0x4D, 0x54, 0x72, 0x6B,
		(bytes.length >>> 24) & 0xff, (bytes.length >>> 16) & 0xff,
		(bytes.length >>> 8) & 0xff, bytes.length & 0xff, ...bytes];
}

/**
 * Monta um arquivo MIDI (Blob) completo a partir de uma lista de tracks: [{ name, events }].
 */
export function buildMidiFile(ppq, tracks) {
	const chunks = tracks.map(t => wrapTrackChunk(buildTrackBytes(t.events, t.name)));
	const header = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
		(tracks.length >> 8) & 0xff, tracks.length & 0xff, (ppq >> 8) & 0xff, ppq & 0xff];
	return new Blob([new Uint8Array([...header, ...chunks.flat()])], { type: 'audio/midi' });
}
