// ==UserScript==
// @name         知乎自动点赞和喜欢
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  在知乎个人/机构回答界面自动批量赞同和喜欢。支持可调间隔、一键开始/停止，自动滚动加载并处理到底部停止。
// @author       amoorzheyu
// @match        https://www.zhihu.com/people/*/answers
// @match        https://www.zhihu.com/people/*/posts
// @match        https://www.zhihu.com/org/*/answers
// @match        https://www.zhihu.com/org/*/posts
// @grant        none
// ==/UserScript==

(function () {

    'use strict';

    let running = false;
    let timer = null;

    let interval = parseInt(localStorage.getItem("zhihu-auto-interval") || "2000");

    let clickPriority = localStorage.getItem("zhihu-auto-priority") || "voteFirst";

    if (clickPriority !== "voteFirst" && clickPriority !== "favoriteFirst") {

        clickPriority = "voteFirst";

    }

    // 滚动距离（比之前大）
    const scrollDistance = 5000;


    /* ------------------------------
       UI 控制面板
    --------------------------------*/

    function createPanel() {

        const panel = document.createElement("div");

        panel.style.cssText = `
position:fixed;
top:120px;
right:20px;
z-index:99999;
background:white;
padding:15px;
border-radius:8px;
box-shadow:0 4px 12px rgba(0,0,0,.2);
font-size:14px;
width:220px;
`;

        const voteChecked = clickPriority === "voteFirst" ? " checked" : "";

        const favChecked = clickPriority === "favoriteFirst" ? " checked" : "";

        panel.innerHTML = `

<div style="font-weight:bold;margin-bottom:10px;">
知乎自动点赞
</div>

<label style="font-size:12px;">点击间隔(ms)</label>

<input id="zhihu_interval"
type="number"
value="${interval}"
style="width:100%;margin:5px 0 10px 0;padding:5px"
/>

<div style="font-size:12px;margin-bottom:6px;">优先点击</div>

<label style="display:block;font-size:12px;cursor:pointer;margin:4px 0;">
<input type="radio" name="zhihu_priority" value="voteFirst"${voteChecked}/>
优先赞同
</label>

<label style="display:block;font-size:12px;cursor:pointer;margin:4px 0 10px 0;">
<input type="radio" name="zhihu_priority" value="favoriteFirst"${favChecked}/>
优先喜欢
</label>

<button id="zhihu_toggle"
style="
width:100%;
padding:8px;
background:#0084ff;
color:white;
border:none;
border-radius:4px;
cursor:pointer;
">
开始
</button>
`;

        document.body.appendChild(panel);

        document.getElementById("zhihu_interval").onchange = e => {
            interval = parseInt(e.target.value);
            localStorage.setItem("zhihu-auto-interval", interval);
        };

        panel.querySelectorAll('input[name="zhihu_priority"]').forEach(radio => {

            radio.onchange = () => {

                if (radio.checked) {

                    clickPriority = radio.value;

                    localStorage.setItem("zhihu-auto-priority", clickPriority);

                }

            };

        });

        document.getElementById("zhihu_toggle").onclick = toggle;

    }


    /* ------------------------------
       赞同：用类名判断（is-active = 已赞同）
       用向上三角图标区分「赞同」与「反对」两个 VoteButton
    --------------------------------*/

    function findVoteUpButtons() {

        return Array.from(document.querySelectorAll("button.VoteButton")).filter(
            b => b.querySelector(".VoteButton-TriangleUp, svg.Zi--TriangleUp")
        );

    }

    /** 已赞同：按钮带 is-active；未赞同：无 is-active */
    function isVoteLiked(btn) {

        return btn.classList.contains("is-active");

    }

    /**
     * 只打一行摘要，避免页面上几十个赞同按钮时每次点击都刷屏。
     * @param {HTMLButtonElement} [targetBtn] 本次即将点击的按钮，会多打一行说明
     */
    function scanAndLogVoteButtons(targetBtn) {

        const list = findVoteUpButtons();

        if (!list.length) {

            console.log("[赞同] 扫描：当前页面未找到任何「赞同」按钮（VoteButton+向上三角）");

            return;

        }

        const likedCount = list.filter(isVoteLiked).length;

        const unlikedCount = list.length - likedCount;

        console.log(
            `[赞同] 扫描摘要：共 ${list.length} 个赞同按钮，已赞同 ${likedCount}，未赞同 ${unlikedCount}`
        );

        if (targetBtn && list.includes(targetBtn)) {

            const idx = list.indexOf(targetBtn);

            const label = (targetBtn.getAttribute("aria-label") || "").trim();

            const activeCls = targetBtn.classList.contains("is-active")
                ? "含 is-active"
                : "无 is-active";

            console.log(
                `[赞同] 本次点击：第 ${idx + 1} 个（${activeCls}，aria-label：${label || "无"}）`
            );

        }

    }

    function findUnliked() {

        return findVoteUpButtons().filter(
            b => !b.classList.contains("is-active") && !b.disabled
        );

    }


    /* ------------------------------
       喜欢：扫描并打印状态（已喜欢 / 未喜欢）
    --------------------------------*/

    function isFavoriteLiked(btn) {

        const label = (btn.getAttribute("aria-label") || "").trim();

        return label === "已喜欢" || label === "取消喜欢";

    }

    function findFavoriteButtons() {

        return Array.from(
            document.querySelectorAll("button.ContentItem-action")
        ).filter(b => {
            const l = (b.getAttribute("aria-label") || "").trim();
            return (
                l === "喜欢" ||
                l === "已喜欢" ||
                l === "取消喜欢"
            );
        });

    }

    /** 一行摘要 + 可选本次点击目标，避免刷屏 */
    function scanAndLogFavoriteButtons(targetBtn) {

        const list = findFavoriteButtons();

        if (!list.length) {

            console.log("[喜欢] 扫描：当前页面未找到喜欢相关按钮");

            return;

        }

        const likedCount = list.filter(isFavoriteLiked).length;

        const unlikedCount = list.length - likedCount;

        console.log(
            `[喜欢] 扫描摘要：共 ${list.length} 个喜欢按钮，已喜欢 ${likedCount}，未喜欢 ${unlikedCount}`
        );

        if (targetBtn && list.includes(targetBtn)) {

            const idx = list.indexOf(targetBtn);

            const label = (targetBtn.getAttribute("aria-label") || "").trim();

            console.log(`[喜欢] 本次点击：第 ${idx + 1} 个（aria-label：${label || "无"}）`);

        }

    }

    function findUnfavorited() {

        return Array.from(
            document.querySelectorAll(
                'button.ContentItem-action[aria-label="喜欢"]'
            )
        ).filter(b => !b.disabled);

    }


    /* ------------------------------
       自动滚动
    --------------------------------*/

    function autoScroll() {

        window.scrollBy({
            top: scrollDistance,
            behavior: "smooth"
        });

    }


    /* ------------------------------
       停止脚本
    --------------------------------*/

    function stop() {

        running = false;

        clearInterval(timer);

        document.getElementById("zhihu_toggle").innerText = "已完成";

        console.log("任务完成");

    }


    /* ------------------------------
       主逻辑
    --------------------------------*/

    function tryVoteOnce() {

        const likeBtns = findUnliked();

        if (!likeBtns.length) {

            return false;

        }

        scanAndLogVoteButtons(likeBtns[0]);

        console.log("[赞同] 成功执行赞同（已点击赞同按钮）");

        likeBtns[0].click();

        return true;

    }

    function tryFavoriteOnce() {

        const favBtns = findUnfavorited();

        if (!favBtns.length) {

            return false;

        }

        scanAndLogFavoriteButtons(favBtns[0]);

        console.log("[喜欢] 成功执行喜欢");

        favBtns[0].click();

        return true;

    }

    function run() {

        if (!running) return;

        if (clickPriority === "voteFirst") {

            if (tryVoteOnce()) return;

            if (tryFavoriteOnce()) return;

        } else {

            if (tryFavoriteOnce()) return;

            if (tryVoteOnce()) return;

        }

        /* 没找到按钮 */

        const bottom =
            window.innerHeight + window.scrollY >= document.body.scrollHeight - 10;

        if (bottom) {

            console.log("已到达页面底部");

            stop();

            return;
        }

        console.log("未找到按钮，继续滚动");

        autoScroll();

    }


    /* ------------------------------
       开关
    --------------------------------*/

    function toggle() {

        running = !running;

        const btn = document.getElementById("zhihu_toggle");

        if (running) {

            btn.innerText = "停止";

            timer = setInterval(run, interval);

            run();

        } else {

            btn.innerText = "开始";

            clearInterval(timer);

        }

    }


    /* ------------------------------
       初始化
    --------------------------------*/

    function init() {

        createPanel();

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", init);

    } else {

        init();

    }

})();
