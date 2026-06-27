# OpenArranger

O OpenArranger é uma ferramenta de acompanhamento de código aberto, baseada na web e com funcionamento *offline-first* (prioridade offline), projetada para músicos solo que tocam ao vivo. Ele emula o comportamento dos tradicionais teclados arranjadores físicos, permitindo o controle em tempo real de padrões de bateria não-lineares (Mains, Fills, Intros, Endings e Breaks) com zero latência de áudio.

![Screenshot.jpg](screenshot.jpg)

## Principais Recursos

* **Interface Focada em Performance:** Grade vertical ampla e ergonômica, projetada especificamente para dispositivos móveis e ambientes de palco ao vivo.
* **Quantização Dinâmica:** Transições de seção fluidas com suporte para execução em compasso inteiro, meio compasso ou um quarto de compasso.
* **Motor de Ritmo Duplo (v2.0.0):** Roteamento independente, seleção de kits e controles de volume para os canais de Ritmo Principal (Main Rhythm) e Sub Ritmo (Percussão).
* **Motor de Áudio com Zero Latência:** Construído inteiramente sobre a Web Audio API para um sincronismo de *clock* extremamente sólido e preciso por sample.
* **Feedback Visual de Roteamento:** Os botões de Intro, Fill e Break sempre mostram uma prévia de sua seção de destino, para que você sempre saiba para onde a música está indo.
* **Padrões Abertos:** Utiliza arquivos MIDI padrão e formatos de texto legíveis para humanos, permitindo que os criadores produzam conteúdo usando qualquer DAW.
* **Arquitetura Desacoplada:** Kits de áudio e estilos de ritmo são completamente independentes, possibilitando infinitas combinações de sons.

## Especificação do Kit de Som (.kit)

Um Kit de Som é um arquivo compactado `.zip` renomeado para `.kit`. Ele deve conter um ou mais arquivos de definição `.sfz` no nível raiz, juntamente com um único diretório `Samples/` contendo as formas de onda de áudio (WAV). Todos os SFZs dentro do mesmo kit compartilham a mesma pasta `Samples/`, evitando duplicação.

Quando um kit com múltiplos SFZs é carregado, **dois seletores independentes** aparecem na interface: um para o canal de Ritmo Principal e outro para o canal de Sub Ritmo. Isso permite misturar e combinar diferentes kits em tempo real (por exemplo, um kit de bateria *Standard* para a batida principal e um kit Latino para a percussão), cada um com seu próprio controle de volume.

### Opcodes SFZ Suportados

O *parser* customizado suporta um subconjunto da especificação SFZ padrão:

* **`<control>`**: `default_path`
* **`<global>`**: `loop_mode`
* **`<group>`**: `group`, `off_by`, `group_label`
* **`<region>`**: `key`, `sample`

### Exemplo de estrutura do kit

```
Sounds.kit (zip)
├── DrumKit.sfz
├── PercussionKit.sfz
└── Samples/
    ├── 36 Kick.wav
    ├── 37 Side Stick.wav
    └── ...
```

### Exemplo de `standard.sfz`

```sfz
<control> default_path=Samples/

<global> loop_mode=one_shot

<region> key=36 sample=36 Kick.wav
<region> key=37 sample=37 Side Stick.wav
<region> key=38 sample=38 Snare.wav
<region> key=39 sample=39 Hand Clap.wav
<region> key=40 sample=40 Snare Tight.wav
<region> key=41 sample=41 Floor Tom L.wav
<region> key=42 sample=42 Hi-Hat Closed.wav group=1 off_by=1
<region> key=43 sample=43 Floor Tom H.wav
<region> key=44 sample=44 Hi-Hat Pedal.wav group=1 off_by=1
<region> key=45 sample=45 Low Tom.wav
<region> key=46 sample=46 Hi-Hat Open.wav group=1 off_by=1
```

## Especificação de Estilo (.style)

Um Estilo é um arquivo compactado `.zip` renomeado para `.style`. Ele deve conter exatamente um Arquivo MIDI Padrão (`.mid`) e um arquivo de configuração (`.json`) no nível raiz. Os nomes exatos dos arquivos não importam, pois o motor os identifica pelas suas extensões.

Vários arquivos `.style` podem ser carregados de uma só vez. O estilo ativo é selecionado através de um menu suspenso na interface. O motor sempre inicia na **Intro A** quando um novo estilo é aplicado.

O motor principal mapeia as seções de performance com base em compassos inteiros, desacoplando os dados musicais de uma reprodução linear e rígida.

### Campos do `style.json`

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `name` | string | ✅ | Nome de exibição |
| `timeSignature` | [number, number] | ✅ | ex: `[4, 4]` ou `[6, 8]` |
| `bpm` | number | ✅ | Andamento padrão |
| `rhythmChannel` | number | ✅ | Canal MIDI para o kit de bateria principal (ex: `10`) |
| `subRhythmChannel` | number | ✅ | Canal MIDI para percussão/sub-ritmo (ex: `11`) |
| `sections` | object | ✅ | Mapa de seções (veja abaixo) |
| `beatUnit` | string ou number | — | Subdivisão de tempo para compassos compostos (veja abaixo) |

### Exemplo de `style.json`

```json
{
  "name": "PopBallad",
  "timeSignature": [4, 4],
  "bpm": 67,
  "rhythmChannel": 10,
  "subRhythmChannel": 9,
  "sections": {
    "Main A": { "startBar": 2, "endBar": 6 },
    "Main B": { "startBar": 6, "endBar": 10 },
    "Fill In A": { "startBar": 10, "endBar": 11 },
    "Fill In B": { "startBar": 11, "endBar": 12 },
    "Intro A": { "startBar": 12, "endBar": 13 },
    "Ending A": { "startBar": 13, "endBar": 14 },
    "Break": { "startBar": 14, "endBar": 15 }
  }
}
```

### Fórmulas de compasso composto e `beatUnit`

Em compassos compostos (6/8, 12/8, etc.), a unidade de tempo é ambígua — um músico pode sentir a pulsação como uma semínima pontuada ou como uma colcheia. O campo `beatUnit` permite que o criador do estilo declare isso explicitamente, para que tanto o *tap tempo* quanto a velocidade de reprodução interna se comportem corretamente.

| Valor | Significado |
| --- | --- |
| `4` | Semínima — padrão, mesmo efeito de omitir o campo |
| `8` | Colcheia |
| `"4."` | Semínima pontuada |
| `2` | Mínima |

```json
{
  "name": "Ballad",
  "timeSignature": [6, 8],
  "beatUnit": "4.",
  "bpm": 72
}
```

Quando `beatUnit` é omitido, o motor assume o padrão de uma semínima — preservando total compatibilidade com os estilos existentes.

## Licença e Créditos

Este projeto é de código aberto e está disponível sob a Licença MIT.

* Utilitário de ícones maskable por [NotWoods - Maskable](https://github.com/NotWoods/maskable)
* [jszip](https://stuk.github.io/jszip/)