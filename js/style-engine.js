// ==================================================================================================
// STYLE ENGINE — conversões e consultas sobre o style ativo
// ==================================================================================================
// "Style" é o arquivo de acompanhamento (MIDI + JSON de seções). Este módulo sabe converter
// entre compassos/ticks/segundos e sabe responder "quais eventos tem o compasso N da seção X".
// Depende só de `state` (leitura) — não altera nada aqui, por isso é fácil de testar e confiar.

import { state } from './state.js';

/** Converte um número de compasso (1-based) para o tick absoluto onde ele começa. */
export function barToTick(bar) {
	const ticksPerBeat = state.stylePPQ * (4 / state.beatType);
	return (bar - 1) * ticksPerBeat * state.beatsPerBar;
}

/** Converte uma duração em ticks para segundos, no BPM atual. */
export function ticksToSeconds(t) {
	return (t / state.stylePPQ) * (60 / state.bpm) / state.beatUnitFactor;
}

/** Retorna { startTick, endTick, lengthTicks } de uma seção (ex: "Main A"), ou null se não existir. */
export function getSectionRange(sectionName) {
	const def = state.styleData?.sections?.[sectionName];
	if (!def) return null;
	const startTick = barToTick(def.startBar);
	const endTick = barToTick(def.endBar);
	return { startTick, endTick, lengthTicks: endTick - startTick };
}

/** Eventos Rhythm de um compasso específico dentro de uma seção, com tick relativo ao compasso. */
export function getBarEvents(sectionName, barIndex) {
	const range = getSectionRange(sectionName);
	if (!range || !state.styleMidiEvents) return [];

	const barStart = range.startTick + barIndex * state.barLengthTicks;
	const barEnd = barStart + state.barLengthTicks;

	return state.styleMidiEvents
		.filter(e => e.tick >= barStart && e.tick < barEnd)
		.map(e => ({ ...e, relativeTick: e.tick - barStart }));
}

/** Igual a getBarEvents, mas para o canal SubRhythm. */
export function getBarEventsSub(sectionName, barIndex) {
	const range = getSectionRange(sectionName);
	if (!range || !state.styleMidiEventsSub) return [];

	const barStart = range.startTick + barIndex * state.barLengthTicks;
	const barEnd = barStart + state.barLengthTicks;

	return state.styleMidiEventsSub
		.filter(e => e.tick >= barStart && e.tick < barEnd)
		.map(e => ({ ...e, relativeTick: e.tick - barStart }));
}

/** Quantos compassos tem uma seção. */
export function sectionBarCount(sectionName) {
	const range = getSectionRange(sectionName);
	if (!range) return 1;
	return Math.round(range.lengthTicks / state.barLengthTicks);
}

/**
 * Decide para onde ir automaticamente ao terminar uma seção (sem o usuário escolher):
 * Fill/Intro → volta pro Main; Break → volta pro Main de origem; Ending → para a música;
 * qualquer outra (Main) → repete ela mesma (loop).
 */
export function autoRoute(section) {
	const match = section.match(/ ([A-Za-z])$/);
	const letter = match ? match[1] : 'A';

	if (section.startsWith('Fill In ') || section.startsWith('Intro '))
		return 'Main ' + letter;
	if (section === 'Break')
		return state.returnSection;
	if (section.startsWith('Ending '))
		return 'STOP';
	return section; // loop
}

/** Figura de tempo (ex: "8", "4.") → fator de conversão em semínimas. */
export function parseBeatUnit(val) {
	const s = String(val ?? 4).trim();
	const dotted = s.endsWith('.');
	const base = parseInt(s, 10);
	if (!base || base <= 0) return 1;
	let factor = 4 / base; // semínimas por beat
	if (dotted) factor *= 1.5; // pontuada = 1.5x
	return factor;
}
