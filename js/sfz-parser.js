// ==================================================================================================
// SFZ PARSER — leitura do formato SFZ (mapeamento nota MIDI → arquivo de sample)
// ==================================================================================================
// Funções puras, sem dependência de state ou DOM.

/**
 * Faz o parse de um arquivo .sfz e devolve um mapa { notaMidi: caminhoDoSample }.
 * Suporta blocos <global>, <group> e <region> com herança de opcodes entre eles.
 */
export function parseSFZ(text) {
	const mapping = {};

	// Remove comentários de linha
	text = text.replace(/\/\/.*/g, '');

	const blockRe = /<(\w+)>([^<]*)/g;
	let match;

	let globalOpcodes = {};
	let groupOpcodes = {};

	// Parse opcodes de forma robusta: tokeniza por "palavra=" para não truncar
	// nomes de arquivo com espaços (ex: "Pop Latin Kit\Perc\Clave Wood.wav")
	function parseOpcodes(body) {
		const opcodes = {};
		const line = body.replace(/[\r\n]+/g, ' ');
		const keyRe = /\b(\w+)\s*=/g;
		const keys = [];
		let km;
		while ((km = keyRe.exec(line)) !== null) {
			keys.push({ key: km[1].toLowerCase(), valueStart: km.index + km[0].length });
		}
		for (let i = 0; i < keys.length; i++) {
			const start = keys[i].valueStart;
			const end = i + 1 < keys.length ? keys[i + 1].valueStart - keys[i + 1].key.length - 1 : line.length;
			opcodes[keys[i].key] = line.slice(start, end).trim();
		}
		return opcodes;
	}

	while ((match = blockRe.exec(text)) !== null) {
		const blockType = match[1].toLowerCase();
		const body = match[2];
		const opcodes = parseOpcodes(body);

		if (blockType === 'global') { globalOpcodes = opcodes; continue; }
		if (blockType === 'group') { groupOpcodes = { ...globalOpcodes, ...opcodes }; continue; }

		if (blockType === 'region') {
			const merged = { ...globalOpcodes, ...groupOpcodes, ...opcodes };
			const sample = merged['sample']?.replace(/['"]/g, '').trim();
			if (!sample) continue;

			let note = null;
			if (merged['key'] !== undefined) note = parseMidiNote(merged['key']);
			if (note === null && merged['pitch_keycenter'] !== undefined) note = parseMidiNote(merged['pitch_keycenter']);
			if (note === null && merged['lokey'] !== undefined) note = parseMidiNote(merged['lokey']);

			if (note !== null) mapping[note] = sample;
		}
	}

	return mapping;
}

/** Converte uma nota MIDI: aceita número ("36") ou nome ("C2", "C#-1", "Db3"...). */
export function parseMidiNote(val) {
	val = String(val).trim();
	const num = parseInt(val, 10);
	if (!isNaN(num)) return num;

	const m = val.match(/^([A-Ga-g])([#b]?)([-]?\d+)$/);
	if (!m) return null;
	const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
	const semitone = noteMap[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
	const octave = parseInt(m[3], 10);
	return (octave + 1) * 12 + semitone; // MIDI: C-1 = 0
}
