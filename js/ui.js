// ==================================================================================================
// UI — tudo que só existe pra atualizar o que aparece na tela
// ==================================================================================================
// Nenhuma função aqui decide "o que" vai tocar — só reflete o `state` atual nos elementos do DOM.

import { state } from './state.js';
import { barToTick, sectionBarCount, autoRoute } from './style-engine.js';

/** Escreve uma mensagem na barra de status (linha de baixo do visor). */
export function setStatus(msg) {
	document.getElementById('status-bar').innerText = msg;
}

/** Habilita/desabilita cada botão da grade conforme a seção existir no style carregado. */
export function updateButtonAvailability() {
	document.querySelectorAll('.grid-container .btn').forEach(btn => {
		const sec = btn.dataset.section;
		const has = state.styleData?.sections?.[sec] != null;
		btn.disabled = !has;
		btn.style.opacity = has ? '1' : '0.3';
	});
}

/**
 * Atualiza toda a grade de botões: qual está ativo, qual está "enfileirado" (queued),
 * e desabilita os que não existem no style atual.
 */
export function updateUI() {
	document.querySelectorAll('.grid-container .btn').forEach(b => {
		b.classList.remove('active', 'queued');
	});

	document.querySelectorAll('.grid-container .btn[data-section]').forEach(btn => {
		const sec = btn.dataset.section;
		const exists = !state.styleLoaded || !!state.styleData?.sections?.[sec];
		btn.disabled = !exists;
		btn.classList.toggle('section-missing', !exists);
	});

	const activeBtn = document.querySelector(`.grid-container .btn[data-section="${state.currentSection}"]`);
	if (activeBtn) activeBtn.classList.add('active');

	const autoDest = autoRoute(state.currentSection);
	if (autoDest && autoDest !== state.currentSection && autoDest !== 'STOP') {
		const autoBtn = document.querySelector(`.grid-container .btn[data-section="${autoDest}"]`);
		if (autoBtn && !autoBtn.classList.contains('queued')) autoBtn.classList.add('queued');
	}

	if (state.nextSection !== state.currentSection && state.nextSection !== 'STOP') {
		const queuedBtn = document.querySelector(`.grid-container .btn[data-section="${state.nextSection}"]`);
		if (queuedBtn) queuedBtn.classList.add('queued');
	}

	document.getElementById('btn-resync')?.classList.toggle('pending', state.resyncCutTick !== null);

	updateSectionCounters();
}

/** Atualiza o pequeno contador "total|compasso:beat" em cada botão da grade. */
export function updateSectionCounters() {
	document.querySelectorAll('.grid-container .btn[data-section]').forEach(btn => {
		const sec = btn.dataset.section;

		let counter = btn.querySelector('.bar-counter');
		if (!counter) {
			counter = document.createElement('span');
			counter.className = 'bar-counter';
			btn.appendChild(counter);
		}

		if (!state.styleLoaded || !state.styleData?.sections?.[sec]) {
			counter.textContent = '';
			return;
		}

		const total = sectionBarCount(sec);
		if (sec === state.currentSection && state.isPlaying) {
			const ticksPerBeat = state.stylePPQ * (4 / state.beatType);
			const beat = Math.floor(state.barTickOffset / ticksPerBeat) + 1;
			counter.textContent = `${total}|${state.currentBarIndexInSection + 1}:${beat}`;
		} else {
			counter.textContent = `${total}`;
		}
	});
}

let counterRafId = null;

/** Inicia o loop (requestAnimationFrame) que mantém os contadores dos botões inativos atualizados. */
export function startCounterLoop() {
	if (counterRafId) return;
	const loop = () => {
		if (!state.isPlaying) { counterRafId = null; return; }
		// Só botões inativos — o ativo é gerenciado pelo scheduler
		document.querySelectorAll('.grid-container .btn[data-section]').forEach(btn => {
			if (btn.dataset.section === state.currentSection) return;
			const sec = btn.dataset.section;
			let counter = btn.querySelector('.bar-counter');
			if (!counter) {
				counter = document.createElement('span');
				counter.className = 'bar-counter';
				btn.appendChild(counter);
			}
			counter.textContent = state.styleLoaded && state.styleData?.sections?.[sec]
				? `${sectionBarCount(sec)}`
				: '';
		});
		counterRafId = requestAnimationFrame(loop);
	};
	counterRafId = requestAnimationFrame(loop);
}

/** Para o loop de contadores e faz uma última atualização síncrona. */
export function stopCounterLoop() {
	if (counterRafId) { cancelAnimationFrame(counterRafId); counterRafId = null; }
	updateSectionCounters();
}

/** Mostra o painel "i" com informações técnicas do style carregado (seções, ticks, eventos...). */
export function showDebugInfo() {
	if (!state.styleLoaded) { alert('Carregue um .style primeiro!'); return; }

	const totalBars = state.styleMidiEvents.length
		? Math.ceil(Math.max(...state.styleMidiEvents.map(e => e.tick)) / state.barLengthTicks)
		: '?';

	let info = `Nome: ${state.styleName}\n`;
	info += `PPQ: ${state.stylePPQ}\nFórmula de compasso: ${state.beatsPerBar}/${state.beatType}\nTicks por compasso: ${state.barLengthTicks}\n`;
	info += `Total de eventos: ${state.styleMidiEvents.length}\nCompassos no arquivo: ${totalBars}\n\n`;
	info += `${'-'.repeat(40)}\nSEÇÕES\n${'-'.repeat(40)}\n\n`;

	for (const [name, def] of Object.entries(state.styleData.sections || {})) {
		const startTick = barToTick(def.startBar);
		const endTick = barToTick(def.endBar);
		const bars = def.endBar - def.startBar;
		const evCount = state.styleMidiEvents.filter(e => e.tick >= startTick && e.tick < endTick).length;
		const flag = evCount === 0 ? ' vazia' : '';
		info += `${name.padEnd(10)} ${String(def.startBar).padStart(2, '0')}–${String(def.endBar).padStart(2, '0')} Length: ${bars} Notes: ${evCount}${flag}\n`;
	}

	document.getElementById('debug-info').innerText = info;
	document.getElementById('debug-modal').style.display = 'flex';
}
