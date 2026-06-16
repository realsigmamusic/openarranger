-- ExportStyleJSON.lua
-- Gera o style.json do OpenArranger com base nos marcadores do projeto.
-- Limpa e padroniza os marcadores do REAPER antes da exportação.

local proj = 0

-- Inicia um bloco de Undo (se der Ctrl+Z no Reaper, desfaz tudo)
reaper.Undo_BeginBlock()

-- Pega o caminho do projeto
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

-- Dicionário de tradução (Yamaha -> OpenArranger)
-- Coloque as chaves sempre em minúsculas para facilitar a busca
local alias_map = {
  ["fill in aa"] = "Fill In A",
  ["fill in bb"] = "Fill In B",
  ["fill in cc"] = "Fill In C",
  ["fill in dd"] = "Fill In D",
  ["fill in ab"] = "Break",
  ["fill in ba"] = "Break"
}

-- 1. LIMPEZA E PADRONIZAÇÃO DOS MARCADORES NO PROJETO
local retval, num_markers, num_regions = reaper.CountProjectMarkers(proj)

-- Loop de trás para frente (necessário ao deletar itens no Reaper)
for i = num_markers - 1, 0, -1 do
  local retval, isrgn, pos, rgnend, name, markr_id = reaper.EnumProjectMarkers(i)
  if not isrgn then
    local lower_name = name:lower()
    
    -- A. Deleta os marcadores inúteis (SInt, SFF1, SFF2)
    if lower_name:match("sint") or lower_name:match("sff") then
      reaper.DeleteProjectMarker(proj, markr_id, false)
      
    -- B. Renomeia os marcadores usando nosso dicionário
    elseif alias_map[lower_name] then
      local new_name = alias_map[lower_name]
      reaper.SetProjectMarker(markr_id, false, pos, rgnend, new_name)
    end
  end
end


-- 2. LEITURA DOS MARCADORES (AGORA LIMPOS) PARA O JSON
local markers = {}
-- Conta novamente porque a quantidade pode ter mudado após deletar
retval, num_markers, num_regions = reaper.CountProjectMarkers(proj)

for i = 0, num_markers - 1 do
  local retval, isrgn, pos, rgnend, name, markr_id = reaper.EnumProjectMarkers(i)
  if not isrgn and name ~= "" then
    -- Retorna beats, measures... o index 2 é o compasso (0-indexed)
    local _, measures = reaper.TimeMap2_timeToBeats(proj, pos)
    local bar_num = math.floor(measures) + 1 
    
    table.insert(markers, { name = name, bar = bar_num })
  end
end

-- 3. GERAÇÃO DO JSON
local is_compound = (denom == 8 and (num == 6 or num == 9 or num == 12))

-- Ajusta o BPM caso a base seja "1/4 dotted" 
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

table.insert(lines, '  "drumChannel": 10,')
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

-- Encerra o bloco de Undo do Reaper
reaper.Undo_EndBlock("Exportar JSON do OpenArranger", -1)