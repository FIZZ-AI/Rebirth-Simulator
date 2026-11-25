import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DailyQuota, handleRequest} from '../cloudflare/worker.mjs';

function quotaEnvironment(limit = '100') {
    const values = new Map();
    let queue = Promise.resolve();
    const storage = {
        get: async key => values.get(key),
        put: async (key, value) => { values.set(key, value); },
        transaction: action => {
            const result = queue.then(() => action(storage));
            queue = result.catch(() => {});
            return result;
        }
    };
    const env = {MAX_DAILY_REQUESTS: limit, DEEPSEEK_ACCOUNT_TOKEN: 'private-test-account-token', DEEPSEEK_MODEL: 'deepseek-flash'};
    const object = new DailyQuota({storage}, env);
    env.DAILY_QUOTA = {idFromName: name => name, get: () => object};
    return {env, object, values};
}

const request = (body = {prompt: '推演这段游戏人生'}, origin = 'https://rebirth.fizz2000.com') => new Request('https://rebirth.fizz2000.com/api/chat', {
    method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '127.0.0.1'}, body: JSON.stringify(body)
});

test('全局日限额在并发下最多批准 100 次，重建对象不重置计数', async () => {
    const {env, object, values} = quotaEnvironment();
    const results = await Promise.all(Array.from({length: 120}, (_, i) => object.fetch(new Request('https://quota.internal/reserve', {headers: {'X-Visitor-IP': 'visitor-' + i}}))));
    assert.equal(results.filter(r => r.ok).length, 100);
    const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    assert.deepEqual(values.get('daily'), {day, count: 100});
    const replacement = new DailyQuota({storage: {transaction: fn => fn({get: async key => values.get(key), put: async () => {throw new Error('Should not increase');}})}}, env);
    assert.equal((await replacement.fetch(new Request('https://quota.internal/reserve'))).status, 429);
});

test('北京时间日期变更后重置，过快的单个访客请求不会额外占额度', async () => {
    const {object, values} = quotaEnvironment();
    values.set('daily', {day: '2000-01-01', count: 100});
    for (let i = 0; i < 12; i++) assert.equal((await object.fetch(new Request('https://quota.internal/reserve'))).status, 200);
    assert.equal((await object.fetch(new Request('https://quota.internal/reserve'))).status, 429);
    assert.equal(values.get('daily').count, 12);
});

test('状态接口不返回密钥，静态文件无法读取 .env 或源代码', async () => {
    const {env} = quotaEnvironment();
    const status = await handleRequest(new Request('https://rebirth.fizz2000.com/api/status'), env);
    const text = await status.text();
    assert.equal(JSON.parse(text).dailyLimit, 100);
    assert.ok(!text.includes(env.DEEPSEEK_ACCOUNT_TOKEN));
    for (const path of ['/.env', '/.git/config', '/cloudflare/worker.mjs', '/server.py']) assert.equal((await handleRequest(new Request('https://rebirth.fizz2000.com' + path), env)).status, 404);
});

test('共享服务支持下载版、GitHub Pages 与本机页面，拒绝其他来源', async () => {
    const {env} = quotaEnvironment();
    for (const origin of ['null', 'http://localhost:8000', 'http://127.0.0.1:8765', 'https://fizz-ai.github.io']) {
        const r = await handleRequest(new Request('https://rebirth.fizz2000.com/api/status', {headers: {Origin: origin}}), env);
        assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin);
    }
    assert.equal((await handleRequest(request(undefined, 'https://elsewhere.example'), env)).status, 403);
    const preflight = await handleRequest(new Request('https://rebirth.fizz2000.com/api/chat', {method: 'OPTIONS', headers: {Origin: 'null'}}), env);
    assert.equal(preflight.status, 204);
});

test('无效内容不计数；合法调用只访问 DeepSeek 且凭据仅在服务端', async () => {
    const {env, values} = quotaEnvironment();
    assert.equal((await handleRequest(request({prompt: ''}), env)).status, 400);
    assert.equal(values.size, 0);
    let calls = 0;
    const r = await handleRequest(request(), env, async (url, options) => {
        calls++;
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        assert.equal(options.headers['x-dsh-auth-token'], 'private-test-account-token');
        assert.equal(JSON.parse(options.body).max_tokens, 2048);
        return Response.json({choices: [{message: {content: '你第一次走进校园。'}}]});
    });
    assert.equal(calls, 1); assert.equal(r.status, 200);
    const text = await r.text(); assert.ok(!text.includes('private-test-account-token'));
    assert.equal(values.get('daily').count, 1);
});

test('日额度用完不会调用付费模型，服务错误也不暴露上游详情', async () => {
    const {env} = quotaEnvironment('1');
    let calls = 0;
    const upstream = async () => {calls++; return new Response('secret upstream trace', {status: 401});};
    const first = await handleRequest(request(), env, upstream);
    assert.equal(first.status, 503); assert.ok(!(await first.text()).includes('secret upstream trace'));
    assert.equal((await handleRequest(request(), env, upstream)).status, 429);
    assert.equal(calls, 1);
});
