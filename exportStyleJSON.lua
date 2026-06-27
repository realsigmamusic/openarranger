-- ExportStyleJSON.lua
-- Gera o style.json do OpenArranger com base nos marcadores do projeto.
-- Limpa e padroniza os marcadores do REAPER antes da exportação.

local proj = 0

reaper.Undo_BeginBlock()

local _, full_path = reaper.EnumProjects(proj, "")
if not full_path or full_path == "" then
  reaper.ShowMessageBox("Salve o projeto antes de rodar o script.", "Erro", 0)
  return
end

local proj_dir  = full_path:match("^(.*)[/\\][^/\\]+$") or "."
local proj_file = full_path:match("[/\\]([^/\\]+)$") or full_path
local proj_name = proj_file:match("(.+)%.[^.]+$") or proj_file

-- BPM e fórmula de compasso
local bpm, _ = reaper.GetProjectTimeSignature2(proj)
local num, denom = 4, 4
if reaper.CountTempoTimeSigMarkers(proj) > 0 then
  local ok, _, _, _, ts_bpm, ts_num, ts_denom = reaper.GetTempoTimeSigMarker(proj, 0)
  if ok then
    if ts_bpm  and ts_bpm  > 0 then bpm   = ts_bpm  end
    if ts_num  and ts_num  > 0 then num   = ts_num  end
    if ts_denom and ts_denom > 0 then denom = ts_denom end
  end
end

-- Dicionário de tradução
local alias_map = {
  ["fill in aa"] = "Fill In A",
  ["fill in bb"] = "Fill In B",
  ["fill in cc"] = "Fill In C",
  ["fill in dd"] = "Fill In D",
  ["fill in ab"] = "Break",
  ["fill in ba"] = "Break"
}

-- 1. LIMPEZA E PADRONIZAÇÃO DOS MARCADORES
local retval, num_markers, num_regions = reaper.CountProjectMarkers(proj)

for i = num_markers - 1, 0, -1 do
  local retval, isrgn, pos, rgnend, name, markr_id = reaper.EnumProjectMarkers(i)
  if not isrgn then
    local lower_name = name:lower()
    
    if lower_name:match("sint") or lower_name:match("sff") then
      reaper.DeleteProjectMarker(proj, markr_id, false)
    elseif alias_map[lower_name] then
      local new_name = alias_map[lower_name]
      reaper.SetProjectMarker(markr_id, false, pos, rgnend, new_name)
    end
  end
end

-- 2. LEITURA DOS MARCADORES PARA O JSON
local markers = {}
retval, num_markers, num_regions = reaper.CountProjectMarkers(proj)

for i = 0, num_markers - 1 do
  local retval, isrgn, pos, rgnend, name, markr_id = reaper.EnumProjectMarkers(i)
  if not isrgn and name ~= "" then
    local _, measures = reaper.TimeMap2_timeToBeats(proj, pos)
    local bar_num = math.floor(measures) + 1 
    table.insert(markers, { name = name, bar = bar_num })
  end
end

-- 2.5 BUSCA DE CANAIS MIDI UTILIZADOS
local used_channels = {}
local num_tracks = reaper.CountTracks(proj)

for i = 0, num_tracks - 1 do
  local track = reaper.GetTrack(proj, i)
  local num_items = reaper.CountTrackMediaItems(track)
  
  for j = 0, num_items - 1 do
    local item = reaper.GetTrackMediaItem(track, j)
    local take = reaper.GetActiveTake(item)
    
    -- Verifica se o take existe e se é um item MIDI
    if take and reaper.TakeIsMIDI(take) then
      local _, notecnt = reaper.MIDI_CountEvts(take)
      
      -- Varre todas as notas do item para extrair o canal
      for k = 0, notecnt - 1 do
        local _, _, _, _, _, chan = reaper.MIDI_GetNote(take, k)
        -- O Reaper usa base 0 (0-15), nós salvamos em base 1 (1-16)
        used_channels[chan + 1] = true 
      end
    end
  end
end

-- Converte a tabela (que funciona como um 'Set' para evitar repetição) em um array ordenado
local channels_list = {}
for ch, _ in pairs(used_channels) do
  table.insert(channels_list, ch)
end
table.sort(channels_list)

-- Fallback de segurança: se o projeto estiver totalmente sem notas, assume canal 10
if #channels_list == 0 then
  table.insert(channels_list, 10)
end

-- Mapeia: maior canal = Rhythm, menor canal = subRhythm
local rhythm_ch    = channels_list[#channels_list]
local subrhythm_ch = channels_list[1]

-- 3. GERAÇÃO DO JSON
local is_compound = (denom == 8 and (num == 6 or num == 9 or num == 12))

local final_bpm = bpm
if is_compound then
  final_bpm = bpm / 1.5
end

local lines = {}
table.insert(lines, '{')
table.insert(lines, string.format('  "name": "%s",', proj_name))
table.insert(lines, string.format('  "timeSignature": [%d, %d],', num, denom))
table.insert(lines, string.format('  "bpm": %d,', math.floor(final_bpm + 0.5)))

if is_compound then
  table.insert(lines, '  "beatUnit": "4.",')
end

-- Injeta os canais dinâmicos aqui
if #channels_list > 1 then
  table.insert(lines, string.format('  "Rhythm": %d,', rhythm_ch))
  table.insert(lines, string.format('  "subRhythm": %d,', subrhythm_ch))
else
  table.insert(lines, string.format('  "Rhythm": %d,', rhythm_ch))
end

table.insert(lines, '  "sections": {')

for i, m in ipairs(markers) do
  local end_bar = markers[i+1] and markers[i+1].bar or (m.bar + 1)
  local comma = i < #markers and "," or ""
  table.insert(lines, string.format(
    '    "%s": { "startBar": %d, "endBar": %d }%s',
    m.name, m.bar, end_bar, comma
  ))
end

table.insert(lines, '  }')
table.insert(lines, '}')

-- 4. SALVAR O ARQUIVO
local json_str = table.concat(lines, "\n")
local out_file = proj_dir .. "/" .. proj_name .. ".json"
local f = io.open(out_file, "w")
if f then
  f:write(json_str)
  f:close()
  reaper.ShowMessageBox("Marcadores padronizados e JSON gerado com sucesso!", "OpenArranger", 0)
else
  reaper.ShowMessageBox("Erro ao salvar arquivo JSON.", "Erro", 0)
end

reaper.Undo_EndBlock("Exportar JSON do OpenArranger", -1)