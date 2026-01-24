// ==================== 配置常量 ====================
const CONFIG = {
    GAME_ID: '46b3ff0f-be0d-47af-a685-ca14a09d104a',
    DEVELOPER_TOKEN: 'dev-6a650104-4c10-4df1-a331-b21758e61b00',
    TEXT_MODEL: 'gpt-4o',
    IMAGE_MODEL: 'flux-1-schnell'
};

// ==================== 环境检测 ====================
const isDevelopment = window.location.protocol === 'file:' ||
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '[::1]';

// 开发环境日志
function devLog(...args) {
    if (isDevelopment) {
        console.log('[Dev]', ...args);
    }
}

// ==================== GameStateManager 类 ====================
class GameStateManager {
    constructor() {
        this.state = null;
    }

    initialize(birthYear, birthPlace, babyWish) {
        this.state = {
            birthYear: parseInt(birthYear),
            birthPlace: birthPlace,
            babyWish: babyWish,
            currentAge: 0,
            currentYear: parseInt(birthYear),
            health: 100,
            wealth: 0,
            interventionsLeft: 3,
            history: [`出生于 ${birthYear} 年，${birthPlace}。婴儿寄语：${babyWish}`],
            photos: [],
            worldContext: '',
            lifeEvent: ''
        };
        devLog('游戏状态初始化:', this.state);
    }

    advanceAge(years) {
        this.state.currentAge += years;
        this.state.currentYear = this.state.birthYear + this.state.currentAge;
    }

    updateHealth(delta) {
        this.state.health = Math.max(0, Math.min(100, this.state.health + delta));
    }

    updateWealth(delta) {
        this.state.wealth += delta;
    }

    useIntervention() {
        if (this.state.interventionsLeft > 0) {
            this.state.interventionsLeft--;
            return true;
        }
        return false;
    }

    addHistory(text) {
        this.state.history.push(text);
    }

    addPhoto(url) {
        this.state.photos.push(url);
    }

    isGameOver() {
        return this.state.health <= 0 || this.state.currentAge >= 100;
    }

    getState() {
        return this.state;
    }

    reset() {
        this.state = null;
    }
}

// ==================== PageController 类 ====================
class PageController {
    constructor() {
        this.pages = {
            cover: document.getElementById('cover-page'),
            init: document.getElementById('init-page'),
            game: document.getElementById('game-page'),
            end: document.getElementById('end-page')
        };
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.errorToast = document.getElementById('error-toast');
    }

    showCover() {
        this.hideAllPages();
        this.pages.cover.classList.add('active');
        devLog('显示封面页');
    }

    showInit() {
        this.hideAllPages();
        this.pages.init.classList.add('active');
        devLog('显示初始化页');
    }

    showGame() {
        this.hideAllPages();
        this.pages.game.classList.add('active');
        devLog('显示游戏页');
    }

    showEnd(summary, poem) {
        this.hideAllPages();
        this.pages.end.classList.add('active');
        document.getElementById('life-summary').textContent = summary;
        document.getElementById('life-poem').textContent = poem;
        devLog('显示结算页');
    }

    hideAllPages() {
        Object.values(this.pages).forEach(page => page.classList.remove('active'));
    }

    updateGameUI(state) {
        // 更新世界背景
        document.getElementById('world-year').textContent = `年份：${state.currentYear}`;
        document.getElementById('world-place').textContent = `地点：${state.birthPlace}`;
        document.getElementById('world-context').textContent = state.worldContext || '正在生成世界背景...';

        // 更新人生故事
        document.getElementById('current-age').textContent = `${state.currentAge} 岁`;
        document.getElementById('life-event').textContent = state.lifeEvent || '正在生成人生故事...';

        // 更新属性
        document.getElementById('stat-age').textContent = state.currentAge;
        document.getElementById('stat-health').textContent = state.health;
        document.getElementById('stat-wealth').textContent = `${state.wealth.toLocaleString()}`;
        document.getElementById('stat-interventions').textContent = state.interventionsLeft;

        // 更新介入按钮状态
        const interveneBtn = document.getElementById('intervene-btn');
        interveneBtn.disabled = state.interventionsLeft <= 0;

        // 更新照片
        const photoContainer = document.getElementById('current-photo');
        if (state.photos.length > 0) {
            const latestPhoto = state.photos[state.photos.length - 1];
            photoContainer.innerHTML = `<img src="${latestPhoto}" alt="当前照片">`;
        } else {
            photoContainer.innerHTML = '<p style="color: #999; text-align: center;">正在生成照片...</p>';
        }
    }

    showLoading(message = '加载中...') {
        document.getElementById('loading-message').textContent = message;
        this.loadingOverlay.classList.add('active');
    }

    hideLoading() {
        this.loadingOverlay.classList.remove('active');
    }

    showError(message) {
        this.errorToast.textContent = message;
        this.errorToast.classList.add('active');
        setTimeout(() => {
            this.errorToast.classList.remove('active');
        }, 5000);
    }
}

// ==================== PlayKitManager 类 ====================
class PlayKitManager {
    constructor(gameId, devToken) {
        this.gameId = gameId;
        this.devToken = devToken;
        this.sdk = null;
        this.chatClient = null;
        this.imageClient = null;
        this.ready = false;
    }

    async initialize() {
        try {
            devLog('初始化 PlayKit SDK...');
            this.sdk = new PlayKitSDK.PlayKitSDK({
                gameId: this.gameId,
                developerToken: this.devToken
            });

            // 监听事件
            this.sdk.on('ready', () => {
                devLog('SDK 已就绪');
                this.ready = true;
            });

            this.sdk.on('error', (error) => {
                console.error('SDK 错误:', error);
            });

            this.sdk.on('insufficient_credits', () => {
                alert('Spark 积分不足，无法继续游戏。请充值后再试。');
            });

            await this.sdk.initialize();
            
            // 创建客户端
            this.chatClient = this.sdk.createChatClient(CONFIG.TEXT_MODEL);
            this.imageClient = this.sdk.createImageClient(CONFIG.IMAGE_MODEL);
            
            devLog('PlayKit SDK 初始化成功');
        } catch (error) {
            console.error('PlayKit SDK 初始化失败:', error);
            throw error;
        }
    }

    getChatClient() {
        return this.chatClient;
    }

    getImageClient() {
        return this.imageClient;
    }

    isReady() {
        return this.ready;
    }
}

// ==================== AIEngine 类 ====================
class AIEngine {
    constructor(chatClient, imageClient) {
        this.chatClient = chatClient;
        this.imageClient = imageClient;
    }

    async evolveLife(state, yearsToAdvance = 5) {
        const targetAge = state.currentAge + yearsToAdvance;
        const targetYear = state.currentYear + yearsToAdvance;
        
        const prompt = `你是一个人生模拟器。基于玩家的历史和当前状态，生成接下来 ${yearsToAdvance} 年的人生发展。

当前状态：
- 年龄: ${state.currentAge}
- 年份: ${state.currentYear}
- 地点: ${state.birthPlace}
- 健康: ${state.health}
- 财富: ${state.wealth}

历史记录：
${state.history.join('\n')}

规则：
1. 推进 ${yearsToAdvance} 年（从 ${state.currentAge} 岁到 ${targetAge} 岁）
2. 生成世界背景变化（时代特征、社会环境）
3. 生成人生事件（学习、工作、家庭、健康等）
4. 计算健康值变化（-10 到 +5）
5. 计算财富值变化（可正可负，要符合时代和事件）
6. 如果历史中有"来自未来的建议"，尝试采纳但不保证成功

请严格按照以下 JSON 格式输出，不要添加任何其他文字：
{
  "worldContext": "世界背景描述",
  "lifeEvent": "人生事件描述",
  "healthDelta": -5,
  "wealthDelta": 10000
}`;

        try {
            const response = await this.chatClient.chat(prompt);
            devLog('AI 推演响应:', response);
            
            // 尝试多种方式解析 JSON
            let result;
            
            // 方式1: 直接解析
            try {
                result = JSON.parse(response);
            } catch (e) {
                // 方式2: 提取 JSON 块
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('无法从响应中提取 JSON');
                }
            }
            
            // 验证结果
            if (!result.worldContext || !result.lifeEvent || 
                typeof result.healthDelta !== 'number' || 
                typeof result.wealthDelta !== 'number') {
                throw new Error('AI 响应格式不完整');
            }
            
            // 确保健康值变化在合理范围内
            result.healthDelta = Math.max(-10, Math.min(5, result.healthDelta));
            
            return result;
        } catch (error) {
            console.error('AI 推演失败:', error);
            // 返回默认值以保证游戏可以继续
            return {
                worldContext: `${state.currentYear} 年，${state.birthPlace}。时代在变化，生活继续前行。`,
                lifeEvent: `在 ${state.currentAge} 到 ${targetAge} 岁这段时间，你经历了平凡而充实的生活。`,
                healthDelta: -2,
                wealthDelta: 5000
            };
        }
    }

    async generatePhoto(state) {
        const prompt = `A portrait photo of a ${state.currentAge}-year-old person in ${state.currentYear}, ${state.birthPlace}. Realistic style, natural lighting, showing life experience and personality.`;
        
        try {
            devLog('生成照片，prompt:', prompt);
            const image = await this.imageClient.generate(prompt);
            const imgElement = await image.toHTMLImage();
            return imgElement.src;
        } catch (error) {
            console.error('照片生成失败:', error);
            // 返回占位图片
            return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3E照片生成失败%3C/text%3E%3C/svg%3E';
        }
    }

    async answerQuestion(question, state) {
        const prompt = `你是这个人生的旁白者。基于玩家的历史和当前状态，回答玩家的问题。

当前状态：
- 年龄: ${state.currentAge}
- 健康: ${state.health}
- 财富: ${state.wealth}

历史记录：
${state.history.join('\n')}

玩家问题: ${question}

请真实、有洞察力地回答这个问题，反映当前的人生处境。`;

        try {
            const response = await this.chatClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('问题回答失败:', error);
            return '抱歉，暂时无法回答这个问题。';
        }
    }

    async generateSummary(state) {
        const prompt = `你是一个人生总结者。基于玩家的完整人生历程，生成一段感人的总结。

完整人生历程：
${state.history.join('\n')}

最终状态：
- 享年: ${state.currentAge}
- 最终财富: ${state.wealth}

请生成一段 200 字左右的人生总结。`;

        try {
            const response = await this.chatClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('总结生成失败:', error);
            return `这是一段 ${state.currentAge} 年的人生旅程。从 ${state.birthPlace} 出发，经历了人生的起起伏伏，最终留下了 ${state.wealth.toLocaleString()} 的财富和无数珍贵的回忆。`;
        }
    }

    async generatePoem(state) {
        const prompt = `你是一个诗人。基于玩家的人生，创作一首 4 句的总结小诗。

人生历程：
${state.history.slice(-5).join('\n')}

请创作一首 4 句的总结小诗，风格克制、深沉。`;

        try {
            const response = await this.chatClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('小诗生成失败:', error);
            return '人生如梦亦如歌，\n起落沉浮皆是我。\n回首往事多感慨，\n此生无悔亦无过。';
        }
    }
}

// ==================== EventHandlers 类 ====================
class EventHandlers {
    constructor(stateManager, pageController, aiEngine) {
        this.stateManager = stateManager;
        this.pageController = pageController;
        this.aiEngine = aiEngine;
        this.isProcessing = false;
    }

    onStartGame() {
        devLog('开始游戏被点击');
        console.log('开始游戏');
        this.pageController.showInit();
    }

    async onEnterWorld(birthYear, birthPlace, babyWish) {
        devLog('进入世界被点击');
        
        // 验证输入
        if (!birthYear || !birthPlace || !babyWish) {
            this.pageController.showError('请填写所有信息');
            return;
        }

        const year = parseInt(birthYear);
        if (isNaN(year) || year < 1900 || year > 2100) {
            this.pageController.showError('请输入有效的出生年份（1900-2100）');
            return;
        }

        // 初始化游戏状态
        this.stateManager.initialize(year, birthPlace, babyWish);
        this.pageController.showGame();
        this.pageController.updateGameUI(this.stateManager.getState());
        
        devLog('进入世界，初始状态:', this.stateManager.getState());
        
        // 自动进行第一次推演
        setTimeout(() => {
            this.onAdvanceAge();
        }, 500);
    }

    async onAdvanceAge() {
        if (this.isProcessing) {
            devLog('正在处理中，请稍候...');
            return;
        }

        const state = this.stateManager.getState();
        
        // 弹出输入框让用户选择目标年龄
        const targetAge = prompt(`请输入目标年龄（当前 ${state.currentAge} 岁，最大 100 岁）：`, Math.min(state.currentAge + 5, 100));
        
        if (!targetAge) {
            return; // 用户取消
        }
        
        const targetAgeNum = parseInt(targetAge);
        
        // 验证输入
        if (isNaN(targetAgeNum) || targetAgeNum <= state.currentAge || targetAgeNum > 100) {
            this.pageController.showError(`请输入有效的年龄（${state.currentAge + 1} - 100）`);
            return;
        }
        
        const yearsToAdvance = targetAgeNum - state.currentAge;
        
        this.isProcessing = true;
        
        const advanceBtn = document.getElementById('advance-age-btn');
        const originalText = advanceBtn.textContent;
        advanceBtn.disabled = true;
        advanceBtn.textContent = '推演中...';
        
        // 显示带时间估计的加载提示
        this.pageController.showLoading('AI 正在推演你的人生... (预计 15-30 秒)');
        
        try {
            const evolution = await this.aiEngine.evolveLife(state, yearsToAdvance);
            
            this.stateManager.advanceAge(yearsToAdvance);
            this.stateManager.updateHealth(evolution.healthDelta);
            this.stateManager.updateWealth(evolution.wealthDelta);
            
            state.worldContext = evolution.worldContext;
            state.lifeEvent = evolution.lifeEvent;
            
            this.stateManager.addHistory(
                `${state.currentAge}岁: ${evolution.lifeEvent} (健康${evolution.healthDelta > 0 ? '+' : ''}${evolution.healthDelta}, 财富${evolution.wealthDelta > 0 ? '+' : ''}${evolution.wealthDelta})`
            );
            
            // 显示带时间估计的照片生成提示
            this.pageController.showLoading('正在生成照片... (预计 20-40 秒)');
            const photoUrl = await this.aiEngine.generatePhoto(state);
            this.stateManager.addPhoto(photoUrl);
            
            this.pageController.updateGameUI(state);
            this.pageController.hideLoading();
            
            advanceBtn.disabled = false;
            advanceBtn.textContent = originalText;
            this.isProcessing = false;
            
            if (this.stateManager.isGameOver()) {
                await this.onGameEnd();
            }
            
        } catch (error) {
            this.pageController.hideLoading();
            this.pageController.showError('推演失败，请重试');
            console.error('推演错误:', error);
            
            advanceBtn.disabled = false;
            advanceBtn.textContent = originalText;
            this.isProcessing = false;
        }
    }

    async onIntervene(suggestion) {
        if (!this.stateManager.useIntervention()) {
            this.pageController.showError('没有剩余的介入次数');
            return;
        }

        this.stateManager.addHistory(`[来自未来的建议]: ${suggestion}`);
        this.pageController.updateGameUI(this.stateManager.getState());
        
        devLog('介入建议已添加:', suggestion);
    }

    async onAskQuestion(question) {
        const state = this.stateManager.getState();
        
        this.pageController.showLoading('AI 正在思考... (预计 10-20 秒)');
        
        try {
            const answer = await this.aiEngine.answerQuestion(question, state);
            
            this.stateManager.addHistory(`[提问]: ${question}`);
            this.stateManager.addHistory(`[回答]: ${answer}`);
            
            this.pageController.hideLoading();
            return answer;
            
        } catch (error) {
            this.pageController.hideLoading();
            this.pageController.showError('提问失败，请重试');
            console.error('提问错误:', error);
            return null;
        }
    }

    async onGameEnd() {
        const state = this.stateManager.getState();
        
        this.pageController.showLoading('生成人生总结... (预计 20-30 秒)');
        
        try {
            const summary = await this.aiEngine.generateSummary(state);
            const poem = await this.aiEngine.generatePoem(state);
            
            this.pageController.hideLoading();
            this.pageController.showEnd(summary, poem);
            
            document.getElementById('final-wealth').textContent = `${state.wealth.toLocaleString()}`;
            
            const gallery = document.getElementById('photo-gallery');
            gallery.innerHTML = '';
            state.photos.forEach(photoUrl => {
                const img = document.createElement('img');
                img.src = photoUrl;
                gallery.appendChild(img);
            });
            
        } catch (error) {
            this.pageController.hideLoading();
            this.pageController.showError('总结生成失败');
            console.error('结算错误:', error);
        }
    }

    onRestart() {
        this.stateManager.reset();
        this.pageController.showCover();
        this.isProcessing = false;
        
        document.getElementById('birth-year').value = '';
        document.getElementById('birth-place').value = '';
        document.getElementById('baby-wish').value = '';
        
        const advanceBtn = document.getElementById('advance-age-btn');
        advanceBtn.disabled = false;
        advanceBtn.textContent = '推进年龄';
    }
}

// ==================== 全局变量 ====================
let stateManager, pageController, playkitManager, aiEngine, eventHandlers;
let sdkInitialized = false;

// ==================== 主初始化逻辑 ====================
async function initGame() {
    console.log('=== 游戏初始化开始 ===');
    
    try {
        // 1. 创建基础管理器（不依赖 SDK）
        stateManager = new GameStateManager();
        pageController = new PageController();
        
        console.log('✓ 基础管理器创建成功');
        
        // 2. 显示封面页
        pageController.showCover();
        console.log('✓ 封面页显示成功');
        
        // 3. 立即绑定事件监听器（不等待 SDK）
        bindEventListeners();
        console.log('✓ 事件监听器绑定成功');
        
        // 4. 在后台初始化 SDK
        initSDKInBackground();
        
        console.log('=== 游戏初始化完成 ===');
        
    } catch (error) {
        console.error('游戏初始化失败:', error);
        alert('游戏加载失败：' + error.message);
    }
}

async function initSDKInBackground() {
    console.log('开始后台初始化 SDK...');
    
    try {
        pageController.showLoading('初始化 AI 服务...');
        
        playkitManager = new PlayKitManager(CONFIG.GAME_ID, CONFIG.DEVELOPER_TOKEN);
        await playkitManager.initialize();
        
        aiEngine = new AIEngine(
            playkitManager.getChatClient(),
            playkitManager.getImageClient()
        );
        
        eventHandlers.aiEngine = aiEngine;
        sdkInitialized = true;
        
        pageController.hideLoading();
        console.log('✓ SDK 初始化成功');
        
    } catch (error) {
        pageController.hideLoading();
        console.error('SDK 初始化失败:', error);
        alert('AI 服务初始化失败，部分功能可能无法使用。\n\n错误：' + error.message);
    }
}

function bindEventListeners() {
    console.log('绑定事件监听器...');
    
    // 创建临时的 eventHandlers（SDK 初始化后会更新）
    eventHandlers = new EventHandlers(stateManager, pageController, null);
    
    // 封面页 - 使用直接绑定
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
        startBtn.onclick = function() {
            console.log('开始游戏按钮被点击！');
            eventHandlers.onStartGame();
        };
        console.log('✓ 开始游戏按钮绑定成功');
    } else {
        console.error('✗ 找不到开始游戏按钮');
    }
    
    // 初始化页
    const enterBtn = document.getElementById('enter-world-btn');
    if (enterBtn) {
        enterBtn.onclick = function() {
            console.log('进入世界按钮被点击！');
            const birthYear = document.getElementById('birth-year').value;
            const birthPlace = document.getElementById('birth-place').value;
            const babyWish = document.getElementById('baby-wish').value;
            eventHandlers.onEnterWorld(birthYear, birthPlace, babyWish);
        };
        console.log('✓ 进入世界按钮绑定成功');
    }
    
    // 游戏页
    const advanceBtn = document.getElementById('advance-age-btn');
    if (advanceBtn) {
        advanceBtn.onclick = function() {
            console.log('推进年龄按钮被点击！');
            if (!sdkInitialized) {
                alert('AI 服务还在初始化中，请稍候...');
                return;
            }
            eventHandlers.onAdvanceAge();
        };
    }
    
    const interveneBtn = document.getElementById('intervene-btn');
    if (interveneBtn) {
        interveneBtn.onclick = function() {
            document.getElementById('intervene-modal').classList.add('active');
        };
    }
    
    const askBtn = document.getElementById('ask-question-btn');
    if (askBtn) {
        askBtn.onclick = function() {
            document.getElementById('question-modal').classList.add('active');
            document.getElementById('question-answer').classList.remove('active');
        };
    }
    
    // 介入弹窗
    document.getElementById('intervene-confirm-btn').onclick = function() {
        const suggestion = document.getElementById('intervene-input').value;
        if (suggestion) {
            eventHandlers.onIntervene(suggestion);
            document.getElementById('intervene-modal').classList.remove('active');
            document.getElementById('intervene-input').value = '';
        }
    };
    
    document.getElementById('intervene-cancel-btn').onclick = function() {
        document.getElementById('intervene-modal').classList.remove('active');
        document.getElementById('intervene-input').value = '';
    };
    
    // 提问弹窗
    document.getElementById('question-confirm-btn').onclick = async function() {
        const question = document.getElementById('question-input').value;
        if (question) {
            if (!sdkInitialized) {
                alert('AI 服务还在初始化中，请稍候...');
                return;
            }
            const answer = await eventHandlers.onAskQuestion(question);
            if (answer) {
                const answerDiv = document.getElementById('question-answer');
                answerDiv.textContent = answer;
                answerDiv.classList.add('active');
            }
        }
    };
    
    document.getElementById('question-cancel-btn').onclick = function() {
        document.getElementById('question-modal').classList.remove('active');
        document.getElementById('question-input').value = '';
        document.getElementById('question-answer').classList.remove('active');
    };
    
    // 结算页
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.onclick = function() {
            eventHandlers.onRestart();
        };
    }
    
    console.log('所有事件监听器绑定完成');
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOM 加载完成，开始初始化游戏');
    initGame();
});

console.log('game.js 加载完成');
