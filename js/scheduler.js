// ==================================================================================================
// SCHEDULER — o coração do arranjador: agenda notas e decide quando trocar de seção
// ==================================================================================================
// Esta é a parte mais delicada do app. Fica sozinha neste arquivo de propósito: é a lógica que
// realmente merece atenção extra ao mexer (timing de áudio é sensível a milissegundos).
//
// Ideia geral: a cada "tick" do setTimeout (LOOKAHEAD_MS), olha os próximos SCHEDULE_AHEAD_TIME
// segundos e agenda ali dentro todas as notas que caem nesse intervalo, usando Web Audio API
// (que agenda com precisão de sample, não de setTimeout — por isso não tem "atraso" audível).

import { state } from './state.js';
import { SCHEDULE_AHEAD_TIME, LOOKAHEAD_MS } from './config.js';
import { ticksToSeconds, getBarEvents, getBarEventsSub, sectionBarCount, autoRoute } from './style-engine.js';
import { updateUI, setStatus } from './ui.js';
import { triggerSample, triggerSampleSub, scheduleStop } from './sample-player.js';
import { logTempoChange, updateRecordUI } from './recorder.js';

/**
 * Prepara o estado do scheduler para começar a tocar um compasso específico de uma seção.
 * `entryTick` != 0 é usado quando entramos no meio de um compasso (troca por quantização
 * 'half'/'beat'/'immediate').
 */
export function startBar(sectionName, barIndexInSection, startTime, entryTick = 0) {
	state.currentSection = sectionName;
	state.currentBarIndexInSection = barIndexInSection;

	// Se a gravação está armada, só começa efetivamente num início de compasso "de verdade"
	// (entryTick 0) — garante que o tick 0 do MIDI exportado caia exatamente no grid.
	if (state.recordArmed && entryTick === 0) {
		state.recordArmed = false;
		state.isRecording = true;
		state.recordStartTime = startTime;
		state.recordEvents = [];
		state.tempoChanges = [{ time: startTime, bpm: state.bpm }];
		state.recordTimeSig = { num: state.beatsPerBar, beatType: state.beatType };
		state.recordBeatUnitFactor = state.beatUnitFactor;
		updateRecordUI();
		setStatus('Gravando performance...');
	}

	// Em 'immediate', recua o barStartTime para que barTickOffset comece em entryTick
	state.barStartTime = startTime - ticksToSeconds(entryTick);
	state.barTickOffset = entryTick;
	state.eventIndex = 0;
	state.eventIndexSub = 0;
	state.barEvents = state.styleLoaded ? getBarEvents(sectionName, barIndexInSection) : [];
	state.barEventsSub = state.styleLoaded ? getBarEventsSub(sectionName, barIndexInSection) : [];

	// Pula eventos anteriores ao ponto de entrada
	while (state.eventIndex < state.barEvents.length &&
		state.barEvents[state.eventIndex].relativeTick < entryTick) state.eventIndex++;
	while (state.eventIndexSub < state.barEventsSub.length &&
		state.barEventsSub[state.eventIndexSub].relativeTick < entryTick) state.eventIndexSub++;

	if (sectionName.startsWith('Main ')) state.returnSection = sectionName;
	updateUI();
}

/**
 * Loop principal, reagendado via setTimeout a cada LOOKAHEAD_MS. Cada chamada olha um pouco
 * à frente no tempo e agenda tudo que precisa: notas, mudança de BPM pendente, e a transição
 * de seção (respeitando a quantização escolhida pelo usuário).
 */
export function scheduler() {
	if (!state.isPlaying) return;

	const horizon = state.audioCtx.currentTime + SCHEDULE_AHEAD_TIME;

	while (true) {
		const tickTime = state.barStartTime + ticksToSeconds(state.barTickOffset);
		if (tickTime >= horizon) break;

		// Dispara todos os eventos Rhythm que caem no tick atual
		while (state.eventIndex < state.barEvents.length &&
			state.barEvents[state.eventIndex].relativeTick <= state.barTickOffset) {
			const ev = state.barEvents[state.eventIndex++];
			const evT = state.barStartTime + ticksToSeconds(ev.relativeTick);
			triggerSample(ev.note, ev.velocity, evT);
		}
		// Dispara todos os eventos SubRhythm que caem no tick atual
		if (state.barEventsSub) {
			while (state.eventIndexSub < state.barEventsSub.length &&
				state.barEventsSub[state.eventIndexSub].relativeTick <= state.barTickOffset) {
				const ev = state.barEventsSub[state.eventIndexSub++];
				const evT = state.barStartTime + ticksToSeconds(ev.relativeTick);
				triggerSampleSub(ev.note, ev.velocity, evT);
			}
		}

		// Beat indicator: atualiza só quando o beat muda (evita rAF por tick)
		const ticksPerBeat = state.stylePPQ * (4 / state.beatType);
		const beat = Math.floor(state.barTickOffset / ticksPerBeat);
		const prevBeat = Math.floor((state.barTickOffset === 0 ? 0 : state.barTickOffset - 1) / ticksPerBeat);
		if (state.barTickOffset === 0 || beat !== prevBeat) {
			const displayBeat = beat + 1;
			const snapBar = state.currentBarIndexInSection + 1;
			const snapTotal = sectionBarCount(state.currentSection);
			requestAnimationFrame(() => {
				document.getElementById('beat-indicator').innerText = `${displayBeat}`;
				const activeBtn = document.querySelector(`.grid-container .btn[data-section="${state.currentSection}"]`);
				if (activeBtn) {
					let counter = activeBtn.querySelector('.bar-counter');
					if (!counter) {
						counter = document.createElement('span');
						counter.className = 'bar-counter';
						activeBtn.appendChild(counter);
					}
					counter.textContent = `${snapTotal}|${snapBar}:${displayBeat}`;
				}
			});
		}

		// Verifica transição conforme quantização
		const userQueued = (state.nextSection !== state.currentSection) ? state.nextSection : null;
		const isMeasureEnd = state.barTickOffset + 1 >= state.barLengthTicks;
		const halfTicks = Math.floor(state.barLengthTicks / 2);
		const nextTick = state.barTickOffset + 1;
		const isHalfEnd = !isMeasureEnd && (nextTick % halfTicks === 0) && nextTick > 0;
		const isBeatEnd = !isMeasureEnd && !isHalfEnd && (nextTick % ticksPerBeat === 0) && nextTick > 0;
		const isImmediate = !isMeasureEnd && !isHalfEnd && !isBeatEnd;

		// Aplica troca de BPM quantizada (gravação)
		if (state.pendingBpm !== null) {
			const atHalfPoint = (nextTick % halfTicks === 0) && nextTick > 0;
			const atBeatPoint = (nextTick % ticksPerBeat === 0) && nextTick > 0;
			let bpmDue;
			if (state.quantization === 'measure') bpmDue = isMeasureEnd;
			else if (state.quantization === 'half') bpmDue = isMeasureEnd || atHalfPoint;
			else if (state.quantization === 'beat') bpmDue = isMeasureEnd || atHalfPoint || atBeatPoint;
			else /* immediate */ bpmDue = true;

			if (bpmDue) {
				const applyTime = state.barStartTime + ticksToSeconds(nextTick);
				state.bpm = state.pendingBpm;
				state.pendingBpm = null;
				document.getElementById('bpm-display').value = state.bpm;
				logTempoChange(applyTime);
				setStatus(`BPM aplicado: ${state.bpm}`);
			}
		}

		// Quantização só se aplica a Fills - todo o resto usa 'measure'
		const isFill = userQueued && userQueued.startsWith('Fill ');
		const activeQuant = isFill ? state.quantization : 'measure';

		// Decide se é hora de trocar agora
		const shouldTransition = isMeasureEnd || (
			userQueued && (
				(activeQuant === 'half' && isHalfEnd) ||
				(activeQuant === 'beat' && isBeatEnd) ||
				(activeQuant === 'immediate' && isImmediate)
			)
		);

		if (shouldTransition) {
			state.barTickOffset++;
			const cutTick = isMeasureEnd ? state.barLengthTicks : state.barTickOffset;
			const nextBarStart = state.barStartTime + ticksToSeconds(cutTick);

			if (state.repeatCurrent) {
				// Repetição forçada: reinicia a seção atual do compasso 0
				state.repeatCurrent = false;
				startBar(state.currentSection, 0, nextBarStart);
			} else if (userQueued) {
				if (userQueued === 'STOP') { scheduleStop(nextBarStart); return; }
				const entryTick = (isMeasureEnd || activeQuant === 'measure') ? 0 : cutTick;
				startBar(userQueued, 0, nextBarStart, entryTick);
			} else {
				const totalBars = sectionBarCount(state.currentSection);
				const nextBarIdx = state.currentBarIndexInSection + 1;

				if (nextBarIdx < totalBars) {
					startBar(state.currentSection, nextBarIdx, nextBarStart);
				} else {
					const auto = autoRoute(state.currentSection);
					if (auto === 'STOP') { scheduleStop(nextBarStart); return; }
					state.nextSection = auto;
					startBar(auto, 0, nextBarStart);
				}
			}
			// startBar já reiniciou barTickOffset; não incrementamos de novo
			continue;
		}

		// Salta direto para o tick do próximo evento (ou fim do compasso) em vez de ++1.
		// Considera o próximo evento de AMBOS os canais (Rhythm e SubRhythm) — caso contrário
		// eventos SubRhythm entre dois eventos Rhythm seriam pulados e disparariam atropelados.
		const nextRhythmTick = state.eventIndex < state.barEvents.length
			? state.barEvents[state.eventIndex].relativeTick
			: state.barLengthTicks - 1;
		const nextSubTick = (state.barEventsSub && state.eventIndexSub < state.barEventsSub.length)
			? state.barEventsSub[state.eventIndexSub].relativeTick
			: state.barLengthTicks - 1;
		const nextEventTick = Math.min(nextRhythmTick, nextSubTick);

		// Próxima fronteira de quantização relevante
		let nextBoundary = state.barLengthTicks - 1; // padrão: fim do compasso
		if (userQueued) {
			if (activeQuant === 'half') {
				const nextHalf = Math.ceil((state.barTickOffset + 1) / halfTicks) * halfTicks - 1;
				nextBoundary = Math.min(nextBoundary, nextHalf);
			} else if (activeQuant === 'beat') {
				const nextBeatBoundary = Math.ceil((state.barTickOffset + 1) / state.stylePPQ) * state.stylePPQ - 1;
				nextBoundary = Math.min(nextBoundary, nextBeatBoundary);
			} else if (activeQuant === 'immediate') {
				nextBoundary = state.barTickOffset; // trata imediatamente
			}
		}

		// Próximo beat boundary para o indicador
		const nextBeatTick = (beat + 1) * ticksPerBeat;

		state.barTickOffset = Math.min(nextEventTick, nextBoundary, nextBeatTick, state.barLengthTicks - 1);
		// Se já estamos no tick calculado, avança 1 para não travar
		if (state.barTickOffset <= (nextTick - 1)) state.barTickOffset = nextTick;
	}

	state.timerId = setTimeout(scheduler, LOOKAHEAD_MS);
}
