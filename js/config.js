// ==================================================================================================
// CONFIG — constantes de ajuste fino do app
// ==================================================================================================
// Números "mágicos" que antes estavam espalhados pelo main.js, cada um perto de onde era usado.
// Reunir aqui facilita ajustar o comportamento do app sem precisar caçar o valor no meio da lógica.

export const SCHEDULE_AHEAD_TIME = 0.1;   // segundos à frente que o scheduler agenda áudio
export const LOOKAHEAD_MS = 25.0;         // intervalo do setTimeout do scheduler, em ms

export const BPM_MIN = 40;
export const BPM_MAX = 250;

export const TAP_MAX_GAP_MS = 2000;       // reseta o tap tempo se passar mais que isso entre taps
export const TAP_MAX_SAMPLES = 8;         // quantos taps usa pra calcular a média

export const LONG_PRESS_DELAY_MS = 400;   // tempo segurando até começar a repetição
export const LONG_PRESS_INTERVAL_MS = 80; // intervalo de repetição durante o long-press

export const DB_NAME = 'OpenArranger';
export const DB_VERSION = 1;
export const DB_STORE = 'files';
