// ClipVault — 完整逻辑
// ============================================================

// ---- IndexedDB ----
const DB_NAME = "ClipVaultDB", DB_VER = 1;
let db;

function openDB() {
    return new Promise((ok, fail) => {
        const r = indexedDB.open(DB_NAME, DB_VER);
        r.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains("entries")) {
                const s = d.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
                s.createIndex("date", "date");
                s.createIndex("tags", "tags", { multiEntry: true });
            }
        };
        r.onsuccess = e => { db = e.target.result; ok(db); };
        r.onerror = e => fail(e.target.error);
    });
}

function dbAdd(e) {
    return new Promise((ok, fail) => {
        const tx = db.transaction("entries", "readwrite");
        e.date = e.date || new Date().toISOString();
        e.tags = e.tags || [];
        const r = tx.objectStore("entries").add(e);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
    });
}

function dbPut(id, e) {
    return new Promise((ok, fail) => {
        const tx = db.transaction("entries", "readwrite");
        e.id = id;
        tx.objectStore("entries").put(e);
        tx.oncomplete = ok;
        tx.onerror = () => fail(tx.error);
    });
}

function dbDel(id) {
    return new Promise((ok, fail) => {
        const tx = db.transaction("entries", "readwrite");
        tx.objectStore("entries").delete(id);
        tx.oncomplete = ok;
        tx.onerror = () => fail(tx.error);
    });
}

function dbAll() {
    return new Promise((ok, fail) => {
        const tx = db.transaction("entries", "readonly");
        const r = tx.objectStore("entries").index("date").openCursor(null, "prev");
        const a = [];
        r.onsuccess = e => {
            const c = e.target.result;
            if (c) { a.push(c.value); c.continue(); } else ok(a);
        };
        r.onerror = () => fail(r.error);
    });
}

function dbGet(id) {
    return new Promise((ok, fail) => {
        const tx = db.transaction("entries", "readonly");
        const r = tx.objectStore("entries").get(id);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
    });
}

// ---- State ----
let entries = [], editingId = null, allTags = [];

async function refresh() {
    entries = await dbAll();
    const ts = new Set();
    entries.forEach(e => (e.tags||[]).forEach(t => ts.add(t)));
    allTags = [...ts].sort();
    document.getElementById("totalBadge").textContent = entries.length + "条";
    updateTagFilter();
    updateComparePick();
    renderAll();
}

function updateTagFilter() {
    const sel = document.getElementById("tagFilter");
    const v = sel.value;
    sel.innerHTML = '<option value="">全部标签</option>';
    allTags.forEach(t => { sel.innerHTML += `<option value="${t}">${t}</option>`; });
    sel.value = v;
}

function updateComparePick() {
    const sel = document.getElementById("comparePick");
    const v = sel.value;
    sel.innerHTML = '<option value="">选择案例…</option>';
    entries.forEach((e, i) => { sel.innerHTML += `<option value="${e.id}">${esc(e.title||'无标题')}</option>`; });
    sel.value = v;
}

// ---- Tabs ----
const panels = ["p0","p1","p2","p3","detailPanel","editPanel"];
const tabNames = ["p0","p1","p2","p3"];

function switchTab(idx, btn) {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    showPanel(tabNames[idx]);
}

function showPanel(id) {
    panels.forEach(p => document.getElementById(p).classList.remove("active"));
    document.getElementById(id).classList.add("active");
    if (id==="p0") renderCluster();
    if (id==="p1") renderTrends();
    if (id==="p2") renderCompare();
    if (id==="p3") renderTimeline();
}

// ---- Render: 案例库 ----
function renderCluster() {
    const q = (document.getElementById("searchInput").value || "").toLowerCase();
    const tag = document.getElementById("tagFilter").value;
    let rows = entries;
    if (q) rows = rows.filter(e => (e.title||"").includes(q) || (e.content||"").includes(q));
    if (tag) rows = rows.filter(e => (e.tags||[]).includes(tag));

    const grp = {};
    rows.forEach(e => {
        const k = (e.tags||[])[0] || "未分类";
        if (!grp[k]) grp[k] = [];
        grp[k].push(e);
    });

    let h = "";
    for (const [k, list] of Object.entries(grp)) {
        h += `<div class="cl-label">${k} · ${list.length}条</div>`;
        list.forEach(e => {
            h += `<div class="card" onclick="openDetail(${e.id})">
                <div class="c-title">${esc(e.title||'无标题')} <span class="c-date">${fmt(e.date)}</span></div>
                <div class="c-tags">${(e.tags||[]).map(t=>`<span class="tg">${esc(t)}</span>`).join(" ")}</div>
                <div class="c-body">${esc((e.content||'').slice(0,100))}…</div>
            </div>`;
        });
    }
    document.getElementById("clusterList").innerHTML = h || `<div class="empty">暂无数据。点击下方 + 添加案例。</div>`;
}

document.getElementById("searchInput").addEventListener("input", renderCluster);
document.getElementById("tagFilter").addEventListener("change", renderCluster);

// ---- Render: 趋势 ----
function renderTrends() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const lastMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;

    const count = (month, tag) => entries.filter(e => e.date.startsWith(month) && (e.tags||[]).includes(tag)).length;

    // compute trends
    const pairs = [];
    allTags.forEach(tag => {
        const prev = count(lastMonth, tag);
        const curr = count(thisMonth, tag);
        if (curr + prev > 0) pairs.push({ tag, prev, curr, diff: curr - prev });
    });
    pairs.sort((a,b) => b.diff - a.diff);

    const up = pairs.filter(p => p.diff > 0).slice(0, 6);
    const dn = pairs.filter(p => p.diff < 0).slice(-6).reverse();
    const max = Math.max(...pairs.map(p => Math.max(p.curr, p.prev)), 1);

    function bars(arr) {
        return arr.map(p => {
            const pct = Math.round(p.curr/max*100);
            const clr = p.diff >= 0 ? "#00b894" : "#d63031";
            const arrow = p.diff >= 0 ? "↑" : "↓";
            return `<div class="t-row">
                <span class="t-name">${esc(p.tag)}</span>
                <span class="t-bar-w"><span class="t-bar-f" style="width:${pct}%;background:${clr}">${p.curr}条</span></span>
                <span class="t-chg" style="color:${clr}">${arrow}${Math.abs(p.diff)}</span>
            </div>`;
        }).join("") || `<div class="empty">数据不足，多存几条就有趋势了</div>`;
    }

    document.getElementById("trendUp").innerHTML = bars(up);
    document.getElementById("trendDown").innerHTML = bars(dn);

    // tag cloud
    const maxC = Math.max(...allTags.map(t => entries.filter(e => (e.tags||[]).includes(t)).length), 1);
    document.getElementById("tagCloud").innerHTML = allTags.map(t => {
        const n = entries.filter(e => (e.tags||[]).includes(t)).length;
        const sz = 12 + Math.round(n/maxC*14);
        return `<span style="display:inline-block;margin:4px 6px;padding:4px 10px;border-radius:12px;font-size:${sz}px;font-weight:600;color:#0984e3;background:#e8f4fd;">${esc(t)}(${n})</span>`;
    }).join("");
}

// ---- Render: 对比 ----
function renderCompare() {
    const id = parseInt(document.getElementById("comparePick").value);
    const div = document.getElementById("compareResult");
    if (!id) { div.innerHTML = ""; return; }
    const target = entries.find(e => e.id === id);
    if (!target) return;

    const others = entries.filter(e => e.id !== id)
        .map(e => ({ ...e, overlap: (e.tags||[]).filter(t => (target.tags||[]).includes(t)).length }))
        .filter(e => e.overlap >= 1)
        .sort((a,b) => b.overlap - a.overlap)
        .slice(0, 3);

    let h = `<div class="card" style="border-left:3px solid #0984e3;">
        <div class="c-title">📌 ${esc(target.title||'无标题')}</div>
        <div class="c-tags">${(target.tags||[]).map(t=>`<span class="tg">${esc(t)}</span>`).join(" ")} · ${fmt(target.date)}</div>
        <div class="c-body">${esc((target.content||'').slice(0,120))}…</div>
    </div>`;

    h += `<div class="section-label">最相似案例</div>`;
    others.forEach(e => {
        const shared = (e.tags||[]).filter(t => (target.tags||[]).includes(t));
        const diff = (e.tags||[]).filter(t => !(target.tags||[]).includes(t));
        h += `<div class="card">
            <div class="c-title">${esc(e.title||'无标题')} <span class="c-date">${fmt(e.date)}</span></div>
            <div class="c-tags">
                共有 ${shared.map(t=>`<span class="tg tg-sh">${esc(t)}</span>`).join(" ")}
                ${diff.length ? "差异 "+diff.map(t=>`<span class="tg tg-df">${esc(t)}</span>`).join(" ") : ""}
            </div>
            <div class="c-body">${esc((e.content||'').slice(0,80))}…</div>
        </div>`;
    });
    div.innerHTML = h || `<div class="empty">暂无相似案例</div>`;
}

document.getElementById("comparePick").addEventListener("change", renderCompare);

// ---- Render: 注意力地图 ----
function renderTimeline() {
    const months = {};
    entries.forEach(e => {
        const m = e.date.slice(0, 7); // YYYY-MM
        if (!months[m]) months[m] = {};
        (e.tags||[]).forEach(t => {
            months[m][t] = (months[m][t]||0) + 1;
        });
    });
    const sorted = Object.keys(months).sort().reverse().slice(0, 6);
    const allVals = sorted.flatMap(m => Object.values(months[m]));
    const maxV = Math.max(...allVals, 1);

    const colors = ["#0984e3","#00b894","#e17055","#6c5ce7","#fdcb6e","#fd79a8","#636e72","#e74c3c"];
    let h = "";
    sorted.forEach(m => {
        const top5 = Object.entries(months[m]).sort((a,b) => b[1]-a[1]).slice(0,5);
        h += `<div style="margin-bottom:14px;">
            <div style="font-size:13px;font-weight:600;color:#555;margin-bottom:4px;">${m}</div>`;
        top5.forEach(([tag,val], i) => {
            const pct = Math.round(val/maxV*100);
            h += `<div class="t-row">
                <span class="t-name">${esc(tag)}</span>
                <span class="t-bar-w"><span class="t-bar-f" style="width:${pct}%;background:${colors[i]||'#888'}">${val}条</span></span>
            </div>`;
        });
        h += `</div>`;
    });
    document.getElementById("attentionResult").innerHTML = h || `<div class="empty">数据不足，多存几条就有分析</div>`;
}

// ---- Detail ----
async function openDetail(id) {
    editingId = id;
    const e = await dbGet(id);
    if (!e) return;
    document.getElementById("detailContent").innerHTML = `
        <h2>${esc(e.title||'无标题')}</h2>
        <div class="c-tags" style="margin-bottom:6px">${fmt(e.date)} · ${(e.tags||[]).map(t=>`<span class="tg">${esc(t)}</span>`).join(" ")}</div>
        <div class="detail-text">${esc(e.content||'').replace(/\n/g,'<br>')}</div>
    `;
    showPanel("detailPanel");
}

function hideDetail() { showPanel("p0"); }

// ---- Editor ----
function editCurrent() {
    const id = editingId;
    const e = entries.find(x => x.id === id);
    if (!e) return;
    document.getElementById("editTitle").value = e.title || "";
    document.getElementById("editBody").value = e.content || "";
    document.getElementById("editTags").value = (e.tags||[]).join(", ");
    showPanel("editPanel");
}

function hideEditor() { showPanel("p0"); }

async function saveEntry() {
    const entry = {
        title: document.getElementById("editTitle").value.trim() || document.getElementById("editBody").value.trim().slice(0,30),
        content: document.getElementById("editBody").value.trim(),
        tags: document.getElementById("editTags").value.split(",").map(s => s.trim()).filter(Boolean),
    };
    if (editingId) {
        const old = await dbGet(editingId);
        entry.date = old.date;
        await dbPut(editingId, entry);
    } else {
        entry.date = new Date().toISOString();
        await dbAdd(entry);
    }
    editingId = null;
    clearEditor();
    await refresh();
    showPanel("p0");
}

async function deleteEntry() {
    if (!editingId || !confirm("删除？")) return;
    await dbDel(editingId);
    editingId = null;
    clearEditor();
    await refresh();
    showPanel("p0");
}

function clearEditor() {
    document.getElementById("editTitle").value = "";
    document.getElementById("editBody").value = "";
    document.getElementById("editTags").value = "";
}

// ---- Utils ----
function esc(s) { const d = document.createElement("div"); d.textContent = s||""; return d.innerHTML; }
function fmt(iso) { if(!iso) return ""; const d=new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// ---- Render all tabs ----
function renderAll() {
    renderCluster();
    renderTrends();
    renderCompare();
    renderTimeline();
}

// ---- Seed data on first run ----
async function seed() {
    const existing = await dbAll();
    if (existing.length > 0) return;

    const samples = [
        {title:"剑影映丹心，笔墨照千秋",date:"2026-06-02",tags:["武侠","传统文化","剑术","电影化"],content:`一、选题：绑定传统文化+武侠IP，撬动垂直与大众流量
选题聚焦"中式剑术"，结合#剑来 #传统文化 标签，既精准触达武术爱好者、传统文化追随者，又借助"中式侠义"的大众认知（武侠小说、影视的广泛影响）吸引普通用户。选题自带文化底蕴，容易引发"文化认同式"关注。
二、创意：专业剑术+电影化呈现，制造视觉与精神双重冲击
动作专业度：表演者剑术动作标准、招式流畅（如劈、刺、旋身等），展现出扎实的武术功底，满足武术爱好者对"专业性"的追求，同时让普通观众感受到"中式剑术"的力量与美感。
电影化画面：荒野、城市背景的切换，搭配传统风格服饰，营造出"现代背景下的古风侠义"反差感；运镜（特写剑刃、全景动作）和色调（冷冽质感）极具电影感，把剑术表演升级为"武侠大片式创作"，视觉冲击力拉满。
三、画面与配乐：沉浸式侠义氛围，强化情感代入
画面细节：剑术动作的细节特写（如剑穗飘动、握剑姿势）、场景的氛围感（荒野的萧瑟、城市的现代感），让观众沉浸式感受"中式侠义"的韵味。
配乐加持：搭配古风、激昂的配乐，与剑术动作节奏契合，进一步强化"侠义精神"的情感共鸣，驱动用户点赞、收藏。
评论区活跃原因
文化认同式互动：用户因"中式侠义"的文化底蕴产生强烈共鸣，评论"这才是刻在中国人骨里的浪漫""传统文化就该这样传播"。
武术专业度讨论：武术爱好者围绕剑术流派、动作细节展开交流，如"这招是太极剑的变式吗"，满足垂直圈层的专业讨论需求。
视听效果赞美：观众对电影化画面和配乐表达喜爱，评论"画面堪比武侠电影，每一帧都想截图"。
侠义精神延伸讨论：用户延伸到"侠义精神的现代意义"，引发价值观层面的互动。
爆发核心点总结
以"中式剑术+传统文化"为核心，通过专业剑术表演、电影化画面呈现和沉浸式侠义氛围，既满足武术爱好者的专业观赏欲，又靠文化共鸣和视觉冲击吸引大众用户。`},

        {title:"琴音诉风骨，水墨绘山河",date:"2026-06-01",tags:["传统文化","非遗","东方美学","电影化"],content:`一、选题：深耕东方美学+非遗IP，打通圈层与泛域流量
选题聚焦"中式古琴与水墨艺术"，结合#非遗传承 #东方美学 标签，既精准触达古琴研习者、国画爱好者及传统文化追随者，又借助"中式雅韵"的大众认知（古风仙侠剧、国潮文化的广泛影响）吸引泛娱乐用户。选题自带超脱浮躁的文化底蕴，极易激发"文化寻根式"的深层关注。
二、创意：非遗绝技+国风大片质感，营造感官与意境双重震撼
技艺专业度：演奏者指法严谨、吟猱绰注尽显古法（如泛音、滚拂等），展现深厚的古琴造诣，让普通观众直观感受到"高山流水"的清雅与张力。
视觉奇观化：幽静竹林与霓虹都市的时空交错，搭配素雅宽袍，营造出"喧嚣尘世中的隐士"反差感；运镜（指尖拨弦微距特写、航拍泼墨全景）与色调（青绿与水墨交织的清冷质感）极具东方美学电影感，将器乐表演升格为"国风视觉诗"。
三、画面与配乐：沉浸式雅致意境，深化精神共振
画面细节：古琴共振时琴弦的微距颤动、墨滴入水晕染开的瞬息变幻，让观众沉浸式体验"中式留白"的哲学韵味。
音效加持：古琴清越的音色与低沉的鼓点、空灵的尺八相融合，节奏从悠远到激昂，与水墨蔓延的视觉节奏完美咬合。
评论区活跃原因
文化寻根式共鸣，专业圈层考据，美学质感惊呼，风骨精神时代解读。
爆发核心点总结：以"中式古琴+水墨非遗"为基底，通过专业的器乐演绎、国风大片级的视觉重构和沉浸式的雅致意境，达成非遗文化破圈传播与商业流量爆发双赢。`},

        {title:"冬天这么冷还跳得汗流浃背",date:"2026-05-28",tags:["舞蹈","反差","宿舍"],content:`一、选题：生活场景+热门舞蹈，精准戳中大众共鸣
选题聚焦"宿舍日常+热门舞蹈"，既属于大众熟悉的生活类内容（宿舍场景容易让学生、上班族产生代入感），又绑定"抖音热门舞蹈"标签，吸引舞蹈爱好者。"冬天冷却跳得汗流浃背"的反差设定，既突出舞蹈的活力感，又引发大众对"热爱可抵严寒"的情感共鸣。
二、创意：服装场景反差+接地气风格，制造强亲切感
服装场景反差：冬天穿厚外套、牛仔裤在宿舍跳舞，与"舞蹈需要轻便服装、专业舞台"的常规认知形成反差，这种"接地气"的真实感让用户觉得"这就是身边人会做的事"，亲切感拉满。
生活化风格：宿舍的真实环境无滤镜、无刻意摆拍，完全是日常记录的风格，让内容从"表演式创作"变成"朋友式分享"。
三、画面与节奏：活力动作+明快节奏，契合短视频审美
舞蹈活力感：动作流畅、幅度大且充满元气，视觉上极具感染力。
评论区活跃原因：生活共鸣式互动、舞蹈难度与活力讨论、服装反差的趣味调侃、情绪共鸣的正向反馈。
爆发核心点总结：以"宿舍日常+热门舞蹈"为核心，通过冬装跳舞的反差设定、接地气的生活化风格、活力满满的舞蹈动作实现了双重引爆。`},

        {title:"凌晨三点还在厨房颠勺",date:"2026-05-25",tags:["美食","反差","陪伴","生活"],content:`一、选题：非常规时段+日常技能，精准触发猎奇与认同
选题聚焦"深夜厨房+家常菜制作"，既属于大众熟悉的生活类内容（厨房场景容易让独居青年、家庭主妇产生代入感），又绑定"深夜美食"标签。"凌晨三点还在颠勺"的反差设定，引发大众对"孤独却热爱"的情感共鸣。
二、创意：时间场景反差+沉浸式风格，制造强代入感
时间场景反差：凌晨三点穿睡衣、戴耳机在狭小厨房炒菜，与常规认知形成反差，代入感拉满，前3秒就靠这种反差抓住注意力。
沉浸式风格：仅有灶台灯光、抽油烟机轰鸣、锅铲碰撞声，无背景音乐、无滤镜调色，完全是深夜独处的真实记录，让内容从"教学式创作"变成"陪伴式分享"。
三、画面与节奏：利落刀工+白噪音氛围，契合深夜受众审美
烹饪利落感：切菜节奏快、颠勺动作稳、出锅摆盘不拖沓，视觉上极具解压感。
白噪音氛围：视频时长约45秒，仅有环境原声无配音，节奏舒缓却利落。
评论区活跃原因：作息共鸣式互动、厨艺细节讨论、睡衣反差的趣味调侃、孤独治愈的正向反馈。
爆发核心点总结：以"深夜独处+日常烹饪"为核心，通过凌晨下厨的反差设定、沉浸式的白噪音风格、利落解压的烹饪动作实现双重引爆。`},

        {title:"暴雨天车库弹唱60年代摇滚",date:"2026-05-20",tags:["音乐","反差","怀旧","情绪"],content:`一、选题：极端天气加经典老歌，精准戳中情绪痛点
暴雨天在车库翻唱60年代老摇滚，既有极端天气带来的视觉冲击，又绑定了怀旧音乐标签。这种设定天然自带孤独感和力量感的碰撞，特别容易让打工人和音乐爱好者产生强烈代入感。
二、创意：环境反差加粗粝真实感，制造强沉浸感
环境与行为反差极大：在阴暗潮湿的地下车库弹唱，跟常规音乐视频那种精致录音棚的设定完全反着来。这种不加修饰的粗粝感让用户觉得特别真实。
生活化记录风格：视频没有专业打光，全靠车灯和手机闪光灯那点微弱光线，收音也是原声还带点环境杂音。这种朋友视角的随手拍直接打破了精致表演的套路。
三、画面与节奏：粗犷演绎加紧凑剪辑，契合短视频审美
演绎充满张力：演唱者表情特别投入，动作幅度也大，那种不顾一切的宣泄感极具视觉感染力。
节奏明快不拖沓：视频时长就卡在40秒左右，副歌部分直接前置，高潮来得贼快。
评论区活跃原因：经历共鸣式互动、音乐专业度讨论、环境设定的趣味调侃、情绪宣泄的正向反馈。
爆发核心点总结：以极端天气车库加经典摇滚为核心，靠着环境与行为的强反差、不加修饰的粗粝真实感、充满张力的音乐演绎实现双重引爆。`},

        {title:"铁笔烙星河，泥火塑春秋",date:"2026-05-15",tags:["非遗","手工艺","传统文化","纪录片感"],content:`一、选题：绑定非遗技艺+地域文化IP，撬动垂直与大众流量
选题聚焦"传统烙画与泥塑技艺"，结合#非遗传承 #手艺人 标签，既精准触达传统工艺爱好者、非遗保护关注者，又借助"匠人精神"的大众情感认知吸引普通用户。选题自带"慢工出细活"的文化厚重感。
二、创意：真实工艺+叙事化剪辑，制造细节与情感双重冲击
工艺专业度：从烙笔控温到泥塑捏形，动作娴熟、步骤完整，展现出扎实的手艺功底，让普通观众感受到"传统手艺"的克制与温度。
叙事化画面：从粗糙原料到成品的全过程剪辑，搭配工作台、老工具、自然光环境，运镜（特写烙铁灼痕、泥胎开脸）和色调（暖黄复古感）极具纪录片质感。
三、画面与配乐：沉浸式匠人氛围，强化情感代入
画面细节：烙铁在木板上留下的焦痕纹理、泥胎上指纹与刻痕的交叠、手部老茧与工具的摩擦感。
配乐加持：搭配极简打击乐与低沉弦乐，节奏随工艺推进逐步加快，在成品揭晓瞬间达到情绪高潮。
评论区活跃原因：敬意式互动、技法细节讨论、情绪节奏赞美、手艺传承延伸讨论。
爆发核心点总结：以"非遗手艺+匠人精神"为核心，通过真实工艺展示、叙事化剪辑和沉浸式匠人氛围实现双重引爆。`},
    ];
    for (const s of samples) await dbAdd(s);
}

// ---- Init ----
async function init() {
    await openDB();
    await seed();
    await refresh();

    // Add button in header
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.style.cssText = "background:#0984e3;color:#fff;border:none;border-radius:8px;width:32px;height:32px;font-size:20px;cursor:pointer;";
    addBtn.onclick = () => {
        editingId = null;
        clearEditor();
        showPanel("editPanel");
    };
    document.querySelector(".hdr-top").appendChild(addBtn);
}

init();
