// ==UserScript==
// @name         播放策略管理器 (Codec Switch)
// @namespace    https://github.com/Simon404Error/CodecSwitch
// @version      2.0.1
// @description  拦截 canPlayType / MediaSource.isTypeSupported / mediaCapabilities，按开关勾选放行视频编码，未勾选的编码对网站隐藏（便于稳定触发 RTX VSR）
// @author       Simon404Error
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // 五种视频编码，各自对应站点探测时可能出现的 MIME 片段。
  // 勾选 = 放行；未勾选 = 对站点隐藏，逼它回退到别的编码。
  const CODECS = [
    { id: 'avc',  label: 'AVC (H.264)',  probe: ['avc1', 'avc3'] },
    { id: 'av1',  label: 'AV1',          probe: ['av01'] },
    { id: 'hevc', label: 'HEVC (H.265)', probe: ['hvc1', 'hev1'] },
    { id: 'vp9',  label: 'VP9',          probe: ['vp09', 'vp9'] },
    { id: 'vp8',  label: 'VP8',          probe: ['vp8'] },
  ];

  const ALL_IDS = CODECS.map(c => c.id);
  const STORE_KEY = 'fcCodecAllowed';
  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

  // 默认全部放行 = 脚本不改变任何行为，由用户自己勾选要禁用的编码。
  function readAllowed() {
    let raw = null;
    try {
      raw = hasGM ? GM_getValue(STORE_KEY, null) : localStorage.getItem(STORE_KEY);
      if (typeof raw === 'string') raw = JSON.parse(raw);
    } catch (e) { raw = null; }
    if (!Array.isArray(raw)) return ALL_IDS.slice();
    // 只保留脚本认识的 id，旧版本残留值不会误伤新编码
    return ALL_IDS.filter(id => raw.includes(id));
  }

  let allowed = readAllowed();

  function writeAllowed(list) {
    // 全禁会导致站点无流可选、视频无法播放，强制至少保留一种
    const safe = ALL_IDS.filter(id => list.includes(id));
    const value = safe.length ? safe : ['avc'];
    if (hasGM) GM_setValue(STORE_KEY, JSON.stringify(value));
    else localStorage.setItem(STORE_KEY, JSON.stringify(value));
    allowed = value;
  }

  // 判断某个 MIME 类型是否应当被拒绝。
  // 只处理脚本认识的视频编码；音频编码、容器探测等一律放行，
  // 避免把 audio/... 误判为不支持而引发无关问题。
  function isBlocked(type) {
    if (typeof type !== 'string' || !type) return false;
    const t = type.toLowerCase();
    for (const codec of CODECS) {
      if (allowed.indexOf(codec.id) !== -1) continue;      // 已勾选，放行
      if (codec.probe.some(tag => t.indexOf(tag) !== -1)) return true;
    }
    return false;
  }

  // 1) HTMLMediaElement.canPlayType
  try {
    const origCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      if (isBlocked(type)) return '';
      return origCanPlayType.call(this, type);
    };
  } catch (e) {}

  // 2) MediaSource.isTypeSupported（MSE 自适应流主路径）
  try {
    if (window.MediaSource && typeof MediaSource.isTypeSupported === 'function') {
      const origIsTypeSupported = MediaSource.isTypeSupported;
      MediaSource.isTypeSupported = function (type) {
        if (isBlocked(type)) return false;
        return origIsTypeSupported.call(this, type);
      };
    }
  } catch (e) {}

  // 3) mediaCapabilities.decodingInfo（YouTube / 新播放器会查）
  try {
    if (navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
      const origDecodingInfo = navigator.mediaCapabilities.decodingInfo.bind(navigator.mediaCapabilities);
      navigator.mediaCapabilities.decodingInfo = async function (config) {
        const ct = config && config.video && config.video.contentType;
        if (isBlocked(ct)) {
          return { supported: false, smooth: false, powerEfficient: false };
        }
        return origDecodingInfo(config);
      };
    }
  } catch (e) {}

  // 4) <video> / <source> 直接写 type 属性的场景
  try {
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (
        (this.tagName === 'SOURCE' || this.tagName === 'VIDEO') &&
        typeof name === 'string' && name.toLowerCase() === 'type' &&
        isBlocked(value)
      ) {
        return origSetAttribute.call(this, name, 'video/unsupported');
      }
      return origSetAttribute.call(this, name, value);
    };
  } catch (e) {}

  // ---------- 设置面板 ----------
  let panelNodes = null;

  function closePanel() {
    if (panelNodes) {
      panelNodes.forEach(node => node.remove());
      panelNodes = null;
    }
  }

  function openPanel() {
    closePanel();

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.5)';
    backdrop.addEventListener('click', closePanel);

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
      'width:min(360px, calc(100vw - 32px))', 'box-sizing:border-box', 'padding:16px 18px',
      'border-radius:12px', 'border:1px solid #3a3e44', 'background:#16181b', 'color:#e6e8ea',
      'font:13px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif',
      'box-shadow:0 12px 40px rgba(0,0,0,.6)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '播放策略管理器';
    title.style.cssText = 'font-weight:650;font-size:14px;margin-bottom:3px';

    const hint = document.createElement('div');
    hint.style.cssText = 'color:#9aa0a8;font-size:12px;margin-bottom:12px';
    const HINT_TEXT = '勾选的编码允许播放，未勾选的会对网站隐藏。';
    hint.textContent = HINT_TEXT;

    const list = document.createElement('div');
    const boxes = new Map();
    for (const codec of CODECS) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:8px 6px;border-radius:6px;cursor:pointer';
      row.addEventListener('mouseenter', () => { row.style.background = '#1e2126'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = allowed.indexOf(codec.id) !== -1;
      box.style.cssText = 'width:15px;height:15px;accent-color:#19c37d;cursor:pointer;flex:none';

      const name = document.createElement('span');
      name.textContent = codec.label;

      box.addEventListener('change', () => {
        if (![...boxes.values()].some(input => input.checked)) {
          box.checked = true;
          hint.textContent = '至少要保留一种编码，否则视频无法播放。';
          hint.style.color = '#ffb4a8';
          return;
        }
        hint.textContent = HINT_TEXT;
        hint.style.color = '#9aa0a8';
      });

      boxes.set(codec.id, box);
      row.append(box, name);
      list.append(row);
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px';

    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.textContent = '全选';
    selectAll.style.cssText = 'padding:6px 12px;border-radius:7px;border:1px solid #3a3e44;background:#212428;color:#e6e8ea;font:12px system-ui;cursor:pointer';
    selectAll.addEventListener('click', () => {
      for (const box of boxes.values()) box.checked = true;
      hint.textContent = HINT_TEXT;
      hint.style.color = '#9aa0a8';
    });

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = '确认并刷新网页';
    confirm.style.cssText = 'padding:6px 12px;border-radius:7px;border:0;background:#19c37d;color:#0b1310;font:600 12px system-ui;cursor:pointer';
    confirm.addEventListener('click', () => {
      try {
        writeAllowed(ALL_IDS.filter(id => boxes.get(id).checked));
      } catch (e) {
        hint.textContent = '设置保存失败，请重试。';
        hint.style.color = '#ffb4a8';
        return;
      }
      window.location.reload();
    });

    actions.append(selectAll, confirm);

    panel.append(title, hint, list, actions);
    document.documentElement.append(backdrop, panel);
    panelNodes = [backdrop, panel];
  }

  // 打开方式：油猴菜单，或 Alt+Shift+C
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('播放策略管理器', openPanel);
    }
  } catch (e) {}

  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && String(event.key).toLowerCase() === 'c') {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
    }
  }, true);

  console.log('[codec-switch] 已放行：' + allowed.join(', ') + '（Alt+Shift+C 打开设置）');
})();
