// ==================================================================================================
// TAP TEMPO — calcula o BPM a partir de toques manuais no indicador de beat
// ==================================================================================================

import { TAP_MAX_GAP_MS, TAP_MAX_SAMPLES } from './config.js';
import { setStatus } from './ui.js';
import { requestBpmChange } from './recorder.js';

let tapTimes = [];

/** Registra um "tap" e, a partir do segundo, atualiza o BPM pela média dos intervalos. */
export function processTap() {
	const now = performance.now();
	if (tapTimes.length > 0 && (now - tapTimes[tapTimes.length - 1]) > TAP_MAX_GAP_MS) {
		tapTimes = [];
	}
	tapTimes.push(now);
	if (tapTimes.length > TAP_MAX_SAMPLES) tapTimes.shift();
	if (tapTimes.length < 2) { setStatus('Tap de novo para calcular BPM...'); return; }

	const gaps = [];
	for (let i = 1; i < tapTimes.length; i++) gaps.push(tapTimes[i] - tapTimes[i - 1]);
	const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
	const newBpm = Math.round(60000 / avgGap);
	requestBpmChange(newBpm);
}
