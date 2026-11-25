const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = fs.existsSync(path.join(__dirname, 'classic.js')) ? __dirname : path.join(__dirname, '..');
const { ClassicEngine } = require(path.join(base, 'classic.js'));
const { AIEngine, resolveDeepSeekService, isOver } = require(path.join(base, 'game.js'));
const initial = () => ({ birthYear: 2000, birthPlace: '深圳', babyWish: '健康快乐', currentAge: 0, currentYear: 2000, health: 100, wealth: 0, interventionsLeft: 3, advice: [], history: ['0 岁：出生'], photos: [] });

test('经典模式可逐步走完一生，保持年龄、健康、财富有效', async () => {
    const engine = new ClassicEngine(() => .5), s = initial();
    while (!isOver(s)) {
        const years = Math.min(5, 100 - s.currentAge), e = await engine.evolveLife(s, years);
        assert.ok(e.years > 0 && e.years <= years);
        s.currentAge += e.years; s.currentYear = s.birthYear + s.currentAge;
        s.health += e.healthDelta; s.wealth += e.wealthDelta; s.history.push(e.lifeEvent);
        assert.ok(s.health >= 0 && s.health <= 100); assert.ok(Number.isFinite(s.wealth));
        assert.ok(e.lifeEvent.includes(`${s.currentAge} 岁`));
    }
    assert.ok(s.currentAge <= 100);
    assert.match(await engine.generateSummary(s), /人生落幕/);
    assert.equal((await engine.generatePoem(s)).trim().split('\n').length, 4);
    assert.match(await engine.generatePhoto(s), /^data:image\/svg\+xml/);
});

test('跳转百岁时到达死亡年龄即停止，建议实际影响健康和财富', async () => {
    const engine = new ClassicEngine(() => .5);
    const plain = initial(), advised = initial(); advised.advice = ['坚持锻炼身体，多读书学习技能'];
    const a = await engine.evolveLife(plain, 100), b = await engine.evolveLife(advised, 100);
    assert.ok(a.years <= 100 && b.years <= 100);
    assert.ok(b.wealthDelta > a.wealthDelta);
    assert.ok(b.healthDelta > a.healthDelta);
    assert.match(b.lifeEvent, /来自未来的提醒/);
    assert.equal(plain.currentAge, 0);
});

test('经典回答引用实际状态，用户素材不会进入 SVG 标记', async () => {
    const s = initial(); s.currentAge = 30; s.wealth = -500; s.birthPlace = '<img src=x onerror=alert(1)>';
    const engine = new ClassicEngine();
    assert.match(await engine.answerQuestion('我有多少钱', s), /-500 元/);
    assert.ok(!decodeURIComponent(await engine.generatePhoto(s)).includes('<img'));
});

test('AI 解析围栏 JSON，拒绝空故事、字符串数值和失败响应', async () => {
    let reply = '```json\n{"targetAge":5,"targetYear":2005,"worldContext":"2005年的深圳","lifeEvent":"你走进幼儿园。","healthDelta":-2,"wealthDelta":0}\n```';
    const sdk = { createChatClient: () => ({ chat: async () => reply }), createImageClient: () => ({}) };
    const engine = new AIEngine(sdk, 'test', 'test');
    assert.equal((await engine.evolveLife(initial(), 5)).years, 5);
    reply = '{"targetAge":5,"targetYear":2005,"worldContext":"背景","lifeEvent":"故事","healthDelta":"-2","wealthDelta":0}';
    await assert.rejects(engine.evolveLife(initial(), 5), /有效内容或数值/);
    reply = 'unavailable'; await assert.rejects(engine.evolveLife(initial(), 5), /格式不正确/);
    reply = JSON.stringify({targetAge:10,targetYear:2010,worldContext:'背景',lifeEvent:'错误时间',healthDelta:0,wealthDelta:0});
    await assert.rejects(engine.evolveLife(initial(), 5), /年龄与目标不一致/);
    engine.chat.chat = async () => { throw Object.assign(new Error('unavailable'), { statusCode: 500 }); };
    await assert.rejects(engine.evolveLife(initial(), 5), /unavailable/);
});

function harness() {
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, disabled: false, classList: { add() {}, remove() {}, toggle() {} }, replaceChildren() {} });
        return elements.get(id);
    };
    const context = vm.createContext({ console, structuredClone, setTimeout: () => 1, clearTimeout() {}, ClassicEngine, lifePortrait: () => 'data:image/svg+xml,portrait', document: { getElementById: get, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({}) } });
    vm.runInContext(fs.readFileSync(path.join(base, 'game.js'), 'utf8'), context);
    return { context, get, run: code => vm.runInContext(code, context) };
}

test('文字请求失败不推进进度，解除忙碌后可以重试', async () => {
    const h = harness(); h.context.original = initial();
    h.run("state = structuredClone(original); mode = 'ai'; engine = { evolveLife: async () => { throw Object.assign(new Error('outage'), {statusCode:500}); } };");
    h.get('target-age').value = '5';
    await h.run('advance()');
    assert.equal(h.run('state.currentAge'), 0); assert.equal(h.run('state.history.length'), 1);
    assert.equal(h.run('busy'), false); assert.match(h.get('game-notice').textContent, /500/);
    h.run("engine = { evolveLife: async () => ({years:5, worldContext:'背景',lifeEvent:'新故事',healthDelta:-2,wealthDelta:50}), generatePhoto: async () => {throw new Error('image outage');} };");
    await h.run('advance()');
    assert.equal(h.run('state.currentAge'), 5); assert.equal(h.run('state.wealth'), 50);
    assert.match(h.get('game-notice').textContent, /照片生成失败/);
    assert.equal(h.run('state.photos.length'), 1);
});

test('防止并发推进和无效年龄产生重复计费或损坏进度', async () => {
    const h = harness(); h.context.original = initial();
    h.run('state = structuredClone(original);');
    h.get('target-age').value = '5.5'; await h.run('advance()'); assert.equal(h.run('state.currentAge'), 0);
    h.get('target-age').value = '5';
    let complete, calls = 0;
    h.context.fakeEngine = { evolveLife: () => { calls++; return new Promise(resolve => { complete = resolve; }); }, generatePhoto: async () => 'data:image/png,portrait' };
    h.run('engine = fakeEngine;'); const first = h.run('advance()'); await h.run('advance()');
    assert.equal(calls, 1); complete({years:5,worldContext:'背景',lifeEvent:'故事',healthDelta:0,wealthDelta:0}); await first;
    assert.equal(h.run('state.currentAge'), 5);
});

test('AI 总结失败仍能结算，并保留重试入口', async () => {
    const h = harness(); h.context.original = initial();
    h.run("state = structuredClone(original); state.currentAge=100; engine={generateSummary:async()=>{throw new Error('outage')},generatePoem:async()=>''}; mode='ai';");
    await h.run('finish()');
    assert.match(h.get('life-summary').textContent, /100 年/);
    assert.equal(h.get('retry-summary-btn').hidden, false); assert.equal(h.run('busy'), false);
});


test('AI 优先使用当前站点服务，不要求访客提交凭据', async () => {
    const calls = [];
    const origin = await resolveDeepSeekService(async (url, options) => {
        calls.push(url); assert.equal(options.credentials, 'omit');
        return {ok:true,json:async()=>({configured:true})};
    }, {protocol:'https:',origin:'https://rebirth.fizz2000.com'}, 'https://rebirth.fizz2000.com');
    assert.equal(origin, ''); assert.deepEqual(calls, ['/api/status']);
});

test('下载版直接连接共享服务，不请求 file 协议下的本机接口', async () => {
    const calls = [];
    const origin = await resolveDeepSeekService(async url => {
        calls.push(url); return {ok:true,json:async()=>({configured:true})};
    }, {protocol:'file:',origin:'null'}, 'https://rebirth.fizz2000.com');
    assert.equal(origin, 'https://rebirth.fizz2000.com');
    assert.deepEqual(calls, ['https://rebirth.fizz2000.com/api/status']);
});

test('未配置本机密钥的静态下载版回退共享服务，服务失败只提示重试或经典模式', async () => {
    const calls=[];
    const origin = await resolveDeepSeekService(async url => {
        calls.push(url); return {ok:true,json:async()=>({configured:url.startsWith('https:')})};
    }, {protocol:'http:',origin:'http://localhost:8000'}, 'https://rebirth.fizz2000.com');
    assert.equal(origin,'https://rebirth.fizz2000.com'); assert.equal(calls.length,2);
    await assert.rejects(resolveDeepSeekService(async()=>{throw new Error('offline')}, {protocol:'file:'}, 'https://rebirth.fizz2000.com'), /共享 AI 服务暂时不可用/);
});


test('GitHub Pages 直接使用共享接口，不请求错误的根目录 API', async () => {
    const calls=[];
    await resolveDeepSeekService(async url=>{calls.push(url);return {ok:true,json:async()=>({configured:true})}}, {protocol:'https:',origin:'https://fizz-ai.github.io'}, 'https://rebirth-simulator.1764294465.workers.dev');
    assert.deepEqual(calls,['https://rebirth-simulator.1764294465.workers.dev/api/status']);
});
