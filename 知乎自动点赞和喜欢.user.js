42
    // ==UserScript==
    // @name         知乎自动点赞和喜欢
    // @namespace    http://tampermonkey.net/
    // @version      1.1
    // @description  在知乎个人/机构回答界面自动批量点赞和喜欢。支持可调间隔、一键开始/停止，自动滚动加载并处理到底部停止。
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
width:200px;
`;

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

            document.getElementById("zhihu_toggle").onclick = toggle;

        }


        /* ------------------------------
           查找未点赞
        --------------------------------*/

        function findUnliked() {

            return Array.from(
                document.querySelectorAll(
                    'button.VoteButton[aria-label="赞同"]'
                )
            ).filter(b => !b.disabled);

        }


        /* ------------------------------
           查找未喜欢
        --------------------------------*/

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

        function run() {

            if (!running) return;

            let likeBtns = findUnliked();

            if (likeBtns.length) {

                console.log("点赞");

                likeBtns[0].click();

                return;
            }

            let favBtns = findUnfavorited();

            if (favBtns.length) {

                console.log("喜欢");

                favBtns[0].click();

                return;
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
