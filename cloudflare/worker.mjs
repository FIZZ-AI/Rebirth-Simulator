// Public game service. Credentials are runtime secrets, never browser assets.
const DEFAULT_LIMIT = 100;

function allowedOrigin(request) {
    const origin = request.headers.get('Origin');
    return !origin || origin === new URL(request.url).origin || origin === 'null' ||
        origin === 'https://fizz-ai.github.io' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function headersFor(request) {
    const headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin'};
    const origin = request.headers.get('Origin');
    if (origin && allowedOrigin(request)) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

function json(request, value, status = 200) {
    return new Response(JSON.stringify(value), {status, headers: headersFor(request)});
}

function dailyLimit(env) {
    const value = Number(env.MAX_DAILY_REQUESTS ?? DEFAULT_LIMIT);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid daily limit');
    return value;
}

export class DailyQuota {
    constructor(state, env) { this.storage = state.storage; this.env = env; this.recent = new Map(); }
    async fetch(request) {
        const limit = dailyLimit(this.env);
        const ip = request.headers.get('X-Visitor-IP') || 'unknown';
        const minute = Math.floor(Date.now() / 60000);
        const recent = this.recent.get(ip);
        if (recent?.minute === minute && recent.count >= 12) return Response.json({error: '操作太快了，请稍等一分钟再继续。'}, {status: 429});
        this.recent.set(ip, {minute, count: recent?.minute === minute ? recent.count + 1 : 1});
        // One global object and an atomic transaction enforce a real daily cap.
        const day = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const reserved = await this.storage.transaction(async transaction => {
            const record = await transaction.get('daily');
            const count = record?.day === day ? record.count : 0;
            if (count >= limit) return false;
            await transaction.put('daily', {day, count: count + 1});
            return true;
        });
        if (!reserved) return Response.json({error: `今天的 ${limit} 次共享 AI 体验额度已用完，北京时间零点恢复。你仍可返回封面玩经典模式。`}, {status: 429});
        // Keep only the current minute; daily reservations remain persistent.
        for (const [key, value] of this.recent) if (value.minute !== minute) this.recent.delete(key);
        return Response.json({reserved: true});
    }
}

export async function handleRequest(request, env, upstreamFetch = fetch) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', {status: 404});
    if (!allowedOrigin(request)) return json(request, {error: '此来源不可使用共享游戏服务。'}, 403);
    if (request.method === 'OPTIONS') {
        return new Response(null, {status: 204, headers: {...headersFor(request), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'}});
    }
    try {
        if (url.pathname === '/api/status' && request.method === 'GET') {
            return json(request, {configured: Boolean(env.DEEPSEEK_API_KEY || env.DEEPSEEK_ACCOUNT_TOKEN), model: env.DEEPSEEK_MODEL || 'deepseek-flash', shared: true, dailyLimit: dailyLimit(env)});
        }
        if (url.pathname !== '/api/chat' || request.method !== 'POST') return json(request, {error: '接口不存在。'}, 404);
        if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json(request, {error: '请求格式不正确。'}, 415);
        if (Number(request.headers.get('Content-Length')) > 65536) return json(request, {error: '故事内容过长。'}, 413);
        // Bound the stream as well: browsers and chunked clients may omit Content-Length.
        const reader = request.body?.getReader();
        if (!reader) return json(request, {error: '请求内容为空。'}, 400);
        let length = 0;
        const chunks = [];
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 65536) { await reader.cancel(); return json(request, {error: '故事内容过长。'}, 413); }
            chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let body;
        try { body = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { return json(request, {error: '请求格式不正确。'}, 400); }
        if (typeof body?.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 12000) return json(request, {error: '故事内容无效或过长。'}, 400);
        const key = env.DEEPSEEK_API_KEY;
        const accountToken = env.DEEPSEEK_ACCOUNT_TOKEN;
        if (!key && !accountToken) return json(request, {error: '共享 AI 服务暂未开通，请先玩经典模式。'}, 503);
        if (!env.DAILY_QUOTA) throw new Error('Quota binding missing');
        const quota = env.DAILY_QUOTA.get(env.DAILY_QUOTA.idFromName('global'));
        const reservation = await quota.fetch(new Request('https://quota.internal/reserve', {method: 'POST', headers: {'X-Visitor-IP': request.headers.get('CF-Connecting-IP') || 'unknown'}}));
        if (!reservation.ok) return json(request, await reservation.json(), reservation.status);
        const response = await upstreamFetch('https://api.deepseek.com/chat/completions', {
            method: 'POST', headers: {'Content-Type': 'application/json', ...(key ? {'Authorization': `Bearer ${key}`} : {'x-dsh-auth-token': accountToken})},
            body: JSON.stringify({model: env.DEEPSEEK_MODEL || 'deepseek-flash', messages: [{role: 'user', content: body.prompt}], stream: false, max_tokens: 2048, thinking: {type: 'disabled'}}),
            signal: AbortSignal.timeout(45000)
        });
        if (!response.ok) {
            const message = response.status === 402 ? '共享 AI 余额暂时不足，请先玩经典模式。' : response.status === 429 ? 'AI 服务繁忙，请稍后重试。' : '共享 AI 暂时不可用，请稍后重试或选择经典模式。';
            return json(request, {error: message}, response.status === 429 ? 429 : 503);
        }
        const result = await response.json();
        const content = result?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Invalid response');
        return json(request, {content, model: result.model || env.DEEPSEEK_MODEL || 'deepseek-flash'});
    } catch (error) {
        return json(request, {error: error.name === 'TimeoutError' || error.name === 'AbortError' ? '共享 AI 响应超时，请重试。' : '共享 AI 暂时不可用，请稍后重试或选择经典模式。'}, 503);
    }
}

export default {fetch: (request, env) => handleRequest(request, env)};
