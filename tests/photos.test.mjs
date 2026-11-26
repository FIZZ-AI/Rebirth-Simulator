import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePhotoRequest, photoPrompt, imageDataURL, generatePhoto} from '../cloudflare/photos.mjs';
import {DailyQuota, handleRequest} from '../cloudflare/worker.mjs';

const photo = {age:20,year:2020,place:'深圳',seed:314159,profile:0};
const webp = Buffer.from('RIFF1234WEBPtest-pixels').toString('base64');
const request = body => new Request('https://service.example/api/image', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function environment(limit='100') {
    const values=new Map();
    const storage={get:async key=>values.get(key),put:async(key,value)=>values.set(key,value)};
    storage.transaction=async action=>action(storage);
    const env={MAX_DAILY_REQUESTS:limit,DEEPSEEK_ACCOUNT_TOKEN:'test-text-secret',PLAYKIT_GAME_ID:'46b3ff0f-be0d-47af-a685-ca14a09d104a',PLAYKIT_DEVELOPER_TOKEN:'test-image-secret'};
    const quota=new DailyQuota({storage},env);
    env.DAILY_QUOTA={idFromName:x=>x,get:()=>quota};
    return {env,values};
}

test('照片参数只接受有效年龄、年份、种子与固定外观编号',()=>{
    assert.equal(validatePhotoRequest(photo),true);
    for(const update of [{age:101},{age:-1},{age:2.5},{year:5000},{seed:0},{profile:4},{place:''},{place:'a'.repeat(81)}]) assert.equal(Boolean(validatePhotoRequest({...photo,...update})),false);
});

test('照片提示词保留同局外观，明确年龄与年代',()=>{
    assert.match(photoPrompt(photo),/20-year-old/);
    assert.match(photoPrompt({...photo,age:0,year:1920}),/newborn baby/);
    assert.match(photoPrompt({...photo,age:0,year:1920}),/black and white archival/);
    assert.match(photoPrompt({...photo,age:70,year:2070}),/straight black hair, oval face/);
});

test('按真实文件头返回 WebP/PNG/JPEG，拒绝 SVG 与损坏数据',()=>{
    assert.match(imageDataURL(webp),/^data:image\/webp;base64,/);
    assert.match(imageDataURL(Buffer.from('\x89PNG\r\n\x1a\n','binary').toString('base64')),/^data:image\/png/);
    assert.match(imageDataURL(Buffer.from([255,216,255,224]).toString('base64')),/^data:image\/jpeg/);
    assert.throws(()=>imageDataURL(Buffer.from('<svg/>').toString('base64')),/format/);
    assert.throws(()=>imageDataURL('not base64!'),/Invalid/);
});

test('复用固定图片服务，年龄与种子生效，凭据只在上游请求头',async()=>{
    const {env}=environment();
    const image=await generatePhoto(photo,env,async(url,options)=>{
        assert.equal(url,`https://api.playkit.ai/ai/${env.PLAYKIT_GAME_ID}/v2/image`);
        assert.equal(options.headers.Authorization,'Bearer test-image-secret');
        const data=JSON.parse(options.body);
        assert.equal(data.seed,314159); assert.equal(data.n,1); assert.match(data.prompt,/20-year-old/);
        return Response.json({data:[{b64_json:webp}]});
    });
    assert.match(image,/^data:image\/webp/); assert.ok(!image.includes('test-image-secret'));
});

test('图片接口与文字共用每日额度；无效参数和缺少配置不会计费',async()=>{
    const {env,values}=environment('1'); let calls=0;
    const upstream=async()=>{calls++;return Response.json({data:[{b64_json:webp}]})};
    assert.equal((await handleRequest(request({...photo,age:101}),env,upstream)).status,400);
    assert.equal(values.size,0);
    assert.equal((await handleRequest(request(photo),{...env,PLAYKIT_DEVELOPER_TOKEN:''},upstream)).status,503);
    assert.equal(values.size,0);
    const first=await handleRequest(request(photo),env,upstream);
    assert.equal(first.status,200); assert.match((await first.json()).image,/^data:image\/webp/);
    assert.equal((await handleRequest(request(photo),env,upstream)).status,429);
    const text=new Request('https://service.example/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'test'})});
    assert.equal((await handleRequest(text,env,upstream)).status,429);
    assert.equal(calls,1);
});

test('图片失败可重试，不把上游响应或密钥返回访客',async()=>{
    const {env}=environment();
    const result=await handleRequest(request(photo),env,async()=>new Response('private provider trace test-image-secret',{status:500}));
    assert.equal(result.status,503);
    const text=await result.text(); assert.match(text,/重试照片/); assert.ok(!text.includes('test-image-secret'));
});
