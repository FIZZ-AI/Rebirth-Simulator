import APPEARANCES from './photo-profiles.json' with {type: 'json'};

export function validatePhotoRequest(body) {
    return body && Number.isInteger(body.age) && body.age >= 0 && body.age <= 100 &&
        Number.isInteger(body.year) && body.year >= 1900 && body.year <= 2200 &&
        typeof body.place === 'string' && body.place.trim().length > 0 && body.place.length <= 80 &&
        Number.isInteger(body.seed) && body.seed >= 1 && body.seed <= 2147483647 &&
        Number.isInteger(body.profile) && body.profile >= 0 && body.profile < APPEARANCES.length;
}

export function photoPrompt(body) {
    const subject = body.age === 0 ? 'a newborn baby' : `a ${body.age}-year-old person`;
    const period = body.year < 1970 ? 'black and white archival family photography' : 'color family album photography';
    return `Photorealistic portrait of ${subject}, a fictional character, in ${body.place.trim()} in the year ${body.year}. Fixed character appearance: ${APPEARANCES[body.profile]}. Depict the exact age with age-appropriate facial proportions and visible aging. Fully clothed in everyday clothes appropriate to the year, single person, head and shoulders, natural daylight, ${period}. Ordinary life, candid authentic photograph. No text, no emoji, no illustration, no cartoon.`;
}

export function imageDataURL(encoded) {
    if (typeof encoded !== 'string' || encoded.length > 6000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid image data');
    const signature = atob(encoded.slice(0, 24));
    const mime = signature.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
        : signature.startsWith('\xff\xd8\xff') ? 'image/jpeg'
        : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!mime) throw new Error('Unsupported image format');
    return `data:${mime};base64,${encoded}`;
}

export async function generatePhoto(body, env, upstreamFetch = fetch) {
    const game = env.PLAYKIT_GAME_ID;
    if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(game || '')) throw new Error('Invalid image service configuration');
    const response = await upstreamFetch(`https://api.playkit.ai/ai/${game}/v2/image`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.PLAYKIT_DEVELOPER_TOKEN}`},
        body: JSON.stringify({model: env.PLAYKIT_IMAGE_MODEL || 'flux-1-schnell', prompt: photoPrompt(body), n: 1, size: '512x512', seed: body.seed}),
        signal: AbortSignal.timeout(85000)
    });
    if (!response.ok) throw new Error('Image provider unavailable');
    const result = await response.json();
    return imageDataURL(result?.data?.[0]?.b64_json);
}
