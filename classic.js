/* 无网络依赖的经典模式。事件、数值和回答均由本地规则生成。 */
(function (root) {
    'use strict';
    const choose = (items, random) => items[Math.floor(random() * items.length)];
    const world = year => year < 1950 ? '街巷和书信连接着人们，时代的变动也影响着每个家庭。'
        : year < 1980 ? '收音机传来远方的消息，邻里之间相互照应，生活在缓慢变化。'
        : year < 2000 ? '城市不断生长，新职业与新的求学机会出现在眼前。'
        : year < 2020 ? '互联网改变了沟通、学习和工作的方式，人与世界的距离缩短了。'
        : year < 2040 ? '人工智能与新技术进入日常，便利与选择一同增多。'
        : '这是想象中的未来：城市与技术持续变化，人们仍在寻找亲情、归属和生活的意义。';
    const events = [
        [6, ['第一次独自走进幼儿园，放学时终于主动向新朋友挥手。', '学会骑小车，跌倒后拍拍膝盖，又试了一次。', '在家人的陪伴下学认字，最先写下的是自己的名字。']],
        [13, ['在学校参加了一次小比赛，发现认真准备比输赢更令人开心。', '和同学一起做科学小制作，把家里的纸盒变成一座小城。', '认识了愿意分享秘密的朋友，放学路不再孤单。']],
        [19, ['为升学努力，也开始思考自己真正喜欢什么。', '加入社团，第一次在众人面前表达自己的想法。', '一次考试失利后调整了方法，慢慢找回学习的节奏。']],
        [25, ['离开熟悉的校园，带着紧张与期待开始探索职业方向。', '学习了一项实用技能，在实践中遇见了愿意指点自己的前辈。', '第一次自己安排生活，学会在开销和梦想之间做选择。']],
        [40, ['承担了更复杂的工作，忙碌之余也为家人留下一顿晚饭的时间。', '尝试一个小项目，有过挫折，也收获了第一批认可。', '遇到职业转折，重新整理经验，找到更适合自己的位置。']],
        [60, ['积累的经验开始帮助年轻同事，也逐渐懂得身体需要休息。', '为家里解决了一件拖延许久的事，平常日子变得踏实。', '工作有起伏，但老朋友的一次聚会让你重新感到轻松。']],
        [80, ['放慢生活的脚步，散步、阅读和老朋友的问候成了日常。', '把过去的故事讲给年轻人听，发现那些经历仍然有意义。', '整理旧照片，给很久没有联系的朋友打了一通电话。']],
        [101, ['更珍惜每一次相聚，也学会坦然接受身体的变化。', '在窗边晒太阳，回想一路遇见的人，心里充满感谢。', '把想说的话写下来，留给重要的人一份温柔的纪念。']]
    ];

    function portrait(state) {
        const emoji = state.currentAge < 6 ? '👶' : state.currentAge < 19 ? '🧒' : state.currentAge < 60 ? '🧑' : '🧓';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><rect width="360" height="360" rx="24" fill="#e8eafa"/><text x="180" y="195" text-anchor="middle" font-size="112">${emoji}</text><text x="180" y="270" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#51418a">${state.currentAge} 岁 · ${state.currentYear} 年</text><text x="180" y="310" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#746b91">人生插画</text></svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    class ClassicEngine {
        constructor(random = Math.random) { this.random = random; }
        async evolveLife(state, years) {
            let health = state.health, wealth = state.wealth, actualYears = 0;
            const stories = [];
            const advice = state.advice.join('；');
            for (let elapsed = 0; elapsed < years;) {
                const step = Math.min(5, years - elapsed);
                elapsed += step;
                const age = state.currentAge + elapsed;
                const stage = events.find(([limit]) => age < limit) || events.at(-1);
                let story = choose(stage[1], this.random);
                let change = age < 18 ? 0 : age < 25 ? Math.round((this.random() * 6000 - 2000) * step)
                    : age < 60 ? Math.round((this.random() * 22000 - 3000) * step)
                    : Math.round((this.random() * 4000 - 2000) * step);
                let loss = age < 50 ? this.random() * step * .3 : step * (age < 70 ? .7 : age < 85 ? 1.5 : 2.8);
                if (/健康|锻炼|运动|休息|身体/.test(advice)) {
                    loss *= .65;
                    story += '你记得来自未来的提醒，把锻炼和休息放进日程。';
                }
                if (age >= 18 && age < 60 && /学习|读书|技能|努力/.test(advice)) {
                    change += 2000 * step;
                    story += '持续学习让你把握住了一个新的机会。';
                }
                if (age >= 20 && age < 65 && /创业|投资|生意/.test(advice)) {
                    const success = this.random() > .45;
                    change += (success ? 12000 : -9000) * step;
                    story += success ? '你尝试的新事业得到市场认可。' : '一次创业尝试没有成功，你承担了损失并重新出发。';
                }
                health = Math.max(0, Math.min(100, health - Math.round(loss)));
                wealth += change;
                stories.push(`${age} 岁：${story}`);
                actualYears = elapsed;
                if (health === 0) break;
            }
            return {
                years: actualYears,
                worldContext: `${state.currentYear + actualYears} 年，${state.birthPlace}。${world(state.currentYear + actualYears)}`,
                lifeEvent: stories.join('\n\n'),
                healthDelta: health - state.health,
                wealthDelta: wealth - state.wealth
            };
        }
        async generatePhoto(state) { return portrait(state); }
        async answerQuestion(question, state) {
            const latest = state.history.at(-1);
            if (/财富|钱|工作|事业/.test(question)) return `你现在 ${state.currentAge} 岁，累计财富为 ${state.wealth.toLocaleString()} 元。${state.wealth < 0 ? '负数代表负债，之后仍有机会调整。' : '这份积累来自一路的职业选择与际遇。'}\n最近的经历：${latest}`;
            if (/健康|身体|活/.test(question)) return `你目前的健康值是 ${state.health}，年龄 ${state.currentAge} 岁。${state.health < 40 ? '身体已经需要更多照顾，休息和陪伴比奔忙更重要。' : '保持适度运动和规律休息，会影响之后的人生。'}`;
            return `你在 ${state.birthPlace} 出生，如今走到 ${state.currentAge} 岁。最初的寄语是「${state.babyWish}」。\n最近的经历：${latest}\n${state.advice.length ? '你给自己的提醒：' + state.advice.join('；') : '你还有机会在关键时刻给未来的自己一些提醒。'}\n（经典模式根据本局记录回答，不使用 AI。）`;
        }
        async generateSummary(state) {
            return `你于 ${state.birthYear} 年在 ${state.birthPlace} 出生，走过了 ${state.currentAge} 年。最初的寄语「${state.babyWish}」伴随你一路成长。\n\n${state.history.join('\n\n')}\n\n人生落幕时，健康值为 ${state.health}，最终财富为 ${state.wealth.toLocaleString()} 元。那些相遇、选择和重新出发，组成了这段属于你的人生。`;
        }
        async generatePoem() { return '初来人间一束光，\n风雨晴时各自尝。\n回望来路皆足迹，\n一生故事入诗行。'; }
    }
    root.ClassicEngine = ClassicEngine;
    root.lifePortrait = portrait;
    if (typeof module !== 'undefined') module.exports = { ClassicEngine, portrait };
})(typeof window === 'undefined' ? globalThis : window);
