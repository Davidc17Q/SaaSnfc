# Uso: pip install edge-tts ; python scripts/narracion-landing.py .
# Si cambias el guion, ajusta los segundos de NFC (cues y chime) en landing/landing.js.
# Genera la narración de cada conversación con una voz neuronal latina y saca
# el segundo en que empieza y termina cada frase (para sincronizar los mensajes).
import asyncio, json, os, sys
import edge_tts

OUT = os.path.join(sys.argv[1], 'landing', 'audio')
os.makedirs(OUT, exist_ok=True)
VOICE = 'es-US-PalomaNeural'

GUIONES = {
    'pro': [
        'Estás en un evento y alguien te pide tu contacto.',
        'En vez de buscar una tarjeta de papel, le dices: acerca tu celular.',
        'Y se abre tu portafolio, sin aplicaciones y sin escribir nada.',
        'Si mañana cambias de proyecto, cambias el enlace, y la misma tarjeta lleva al nuevo.',
        'Y después de cada evento, sabes cuántas personas la abrieron.',
        'NFCloud. Tu trabajo, a un toque.',
    ],
    'inst': [
        'En cada punto de atención, una encuesta de un toque.',
        'Si alguien califica mal, no se va en silencio.',
        'La encuesta le ofrece dejar su WhatsApp para resolver su caso.',
        'Y al responsable de la sede le llega un aviso al instante, con el comentario y el número.',
        'Así, nadie se va molesto sin que lo sepas.',
        'NFCloud.',
    ],
}

async def gen(name, lines):
    com = edge_tts.Communicate(' '.join(lines), VOICE, rate='-6%', boundary='SentenceBoundary')
    sents = []
    with open(os.path.join(OUT, f'{name}.mp3'), 'wb') as f:
        async for ch in com.stream():
            if ch['type'] == 'audio':
                f.write(ch['data'])
            elif ch['type'] in ('SentenceBoundary', 'WordBoundary'):
                s = ch['offset'] / 1e7
                sents.append({'t': ch['text'], 'start': round(s, 2), 'end': round(s + ch['duration'] / 1e7, 2)})
    return sents

async def main():
    res = {}
    for k, v in GUIONES.items():
        res[k] = await gen(k, v)
    print(json.dumps(res, ensure_ascii=False, indent=1))

asyncio.run(main())
