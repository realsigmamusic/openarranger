// ==================================================================================================
// MIDI PARSER — leitura de arquivos .mid (zero dependências)
// ==================================================================================================
// Função pura: recebe bytes, devolve dados. Não toca em `state` nem no DOM.
// É por isso que é fácil de testar isoladamente (dado um ArrayBuffer de exemplo, o resultado
// deveria sempre ser o mesmo).

/**
 * Faz o parse de um arquivo MIDI (Standard MIDI File) a partir de um ArrayBuffer.
 * Retorna { format, ppq, tracks }, onde cada track é uma lista de eventos note-on:
 * { tick, note, velocity, channel }.
 */
export function parseMidi(buffer) {
	const data = new DataView(buffer);
	let pos = 0;

	const readUint16 = () => { const v = data.getUint16(pos); pos += 2; return v; };
	const readUint32 = () => { const v = data.getUint32(pos); pos += 4; return v; };
	const readByte = () => data.getUint8(pos++);
	const readVarLen = () => {
		let val = 0, b;
		do { b = readByte(); val = (val << 7) | (b & 0x7f); } while (b & 0x80);
		return val;
	};

	if (readUint32() !== 0x4D546864) throw new Error('Não é MIDI válido');
	readUint32(); // header length
	const format = readUint16();
	const numTracks = readUint16();
	const ppq = readUint16();
	const tracks = [];

	for (let t = 0; t < numTracks; t++) {
		if (readUint32() !== 0x4D54726B) throw new Error('Track inválida');
		const trackEnd = pos + readUint32();
		const events = [];
		let absTick = 0, running = 0;

		while (pos < trackEnd) {
			absTick += readVarLen();
			let status = data.getUint8(pos);
			if (status & 0x80) { running = status; pos++; } else { status = running; }

			const type = status & 0xf0;
			const ch = status & 0x0f;

			if (type === 0x90 || type === 0x80) {
				const note = readByte(), vel = readByte();
				if (type === 0x90 && vel > 0)
					events.push({ tick: absTick, note, velocity: vel, channel: ch });
			} else if (type === 0xa0 || type === 0xb0 || type === 0xe0) { pos += 2; }
			else if (type === 0xc0 || type === 0xd0)			 { pos += 1; }
			else if (status === 0xff) {
				readByte();
				const len = readVarLen();
				pos += len;
			}
			else if (status === 0xf0 || status === 0xf7) {
				const len = readVarLen();
				pos += len;
			}
			else { pos++; }
		}
		pos = trackEnd;
		tracks.push(events);
	}
	return { format, ppq, tracks };
}

/** Filtra os eventos de todas as tracks que pertencem aos canais MIDI dados, ordenados por tick. */
export function extractDrumEvents(midi, channels) {
	let events = [];
	for (const track of midi.tracks) {
		for (const ev of track) {
			if (channels.includes(ev.channel)) {
				events.push(ev);
			}
		}
	}
	return events.sort((a, b) => a.tick - b.tick);
}
