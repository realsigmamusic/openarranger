// ==================================================================================================
// RESYNC — corrige o compasso ao vivo, sem parar a música e sem mexer no BPM
// ==================================================================================================
// A bateria termina o tempo (pulso) atual e o próximo tempo vira o "1" de um compasso novo.
// Aqui só se decide ONDE o compasso termina (state.resyncCutTick); quem executa o corte é o
// scheduler, tratando-o como um "fim de compasso" (mesmo roteamento de seções, fila e gravação).

import { state } from './state.js';
import { secondsToTicks, pulseTicks, timeSigForTicks } from './style-engine.js';
import { setStatus } from './ui.js';
import { vibrate } from './utils.js';

export function requestResync() {
	if (!state.isPlaying || !state.audioCtx) { setStatus('ReSync: só funciona com a música tocando.'); return; }
	if (state.resyncCutTick !== null) return; // já agendado neste compasso

	// Posição que o músico OUVE agora (o scheduler está ~100 ms à frente do áudio).
	const ctx = state.audioCtx;
	const latency = ctx.outputLatency || ctx.baseLatency || 0;
	const heardTick = secondsToTicks(ctx.currentTime - latency - state.barStartTime);
	if (heardTick < 0) { setStatus('ReSync: já no último tempo.'); return; } // ainda ouvindo o fim do compasso anterior

	// Próxima fronteira de pulso depois do tempo ouvido (pulso = beatUnit do style).
	const pulse = pulseTicks();
	let k = Math.floor(heardTick / pulse) + 1;
	let cut = Math.round(k * pulse);
	// Notas já agendadas no áudio não dá pra recolher: se o scheduler já passou desse ponto, vai pro próximo pulso.
	while (cut < state.barTickOffset) cut = Math.round(++k * pulse);

	if (cut >= state.barLengthTicks) { setStatus('ReSync: já no último tempo.'); return; } // último tempo: não faz nada

	state.resyncCutTick = cut;
	const ts = timeSigForTicks(cut);
	document.getElementById('btn-resync')?.classList.add('pending');
	vibrate([15, 30, 15]);
	setStatus(`ReSync: compasso de ${ts.num}/${ts.den}, o próximo tempo é o 1.`);
}
