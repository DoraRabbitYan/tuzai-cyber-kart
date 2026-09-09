import { CHARACTERS, TRACKS, type CharacterId, type InputState, type RaceView, type UIActions } from './data';

const icons = {
  arrow: '<path d="M4 12h15M13 5l7 7-7 7"/>',
  settings: '<path d="M9.5 3h5l.7 2.4 2.3 1.3 2.4-.5 2.5 4.3-1.7 1.8v2.6l1.7 1.8-2.5 4.3-2.4-.5-2.3 1.3-.7 2.4h-5l-.7-2.4-2.3-1.3-2.4.5-2.5-4.3 1.7-1.8v-2.6L.8 10.5 3.3 6.2l2.4.5L8 5.4z" transform="translate(2 0) scale(.84)"/><circle cx="12" cy="12" r="3"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  sound: '<path d="M11 4 5 9H2v6h3l6 5zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 4 5 9H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  throttle: '<path d="m6 15 6-7 6 7m-12 5 6-7 6 7"/>',
  brake: '<path d="M7 6v12M17 6v12" stroke-width="4"/>',
  drift: '<path d="m15 3 5 5-5 5m5-5H9a5 5 0 0 0 0 10h3M3 22h9"/>',
};
type IconName = keyof typeof icons;
const icon = (name:IconName) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const iconButton = (action:string, label:string, name:IconName) => `<button class="icon-button" data-action="${action}" aria-label="${label}" title="${label}">${icon(name)}</button>`;
const logo = `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 60 52" fill="none"><path d="M3 26 20 5h17L20 26l17 21H20z" fill="currentColor"/><path d="M25 26 42 5h15L40 26l17 21H42z" fill="currentColor"/></svg></span><span class="wordmark"><b>CYBER KART</b><span>赛博卡丁车</span></span>`;
const clockText = (seconds:number, precision=2) => {
  const value = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0)*10**precision)/10**precision;
  const minutes = Math.floor(value / 60).toString().padStart(2, '0');
  return `${minutes}:${(value % 60).toFixed(precision).padStart(precision + 3, '0')}`;
};

export class GameUI {
  private root:HTMLElement;
  private elements = new Map<string, HTMLElement>();
  private previousPhase = '';
  private previousCharacter = '';
  private previousTrack = '';
  private settingsOpen = false;
  private settingsReturn:HTMLElement|null = null;
  private latest:RaceView|null = null;
  private mapContext:CanvasRenderingContext2D|null;
  private lastMapFrame = 0;
  private heldPointers = new Map<number, keyof InputState>();
  private textValues = new Map<string, string>();

  constructor(private actions:UIActions) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <section id="loading-screen" class="loading-screen screen" aria-label="加载游戏">
        <div class="loading-brand">${logo}</div><div class="loading-road"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="loading-caption"><span id="loading-text">正在准备赛道</span><b id="loading-value">0%</b></div>
        <div class="loading-meter"><span id="loading-bar"></span></div><p>引擎就绪，下一站是终点。</p>
      </section>
      <section id="menu-screen" class="garage screen" hidden aria-label="竞速车库">
        <div class="garage-shade" aria-hidden="true"></div>
        <header class="garage-header"><a class="brand" href="#" data-action="home" aria-label="赛博卡丁车车库">${logo}</a><div class="garage-mode"><i></i><span>竞速车库</span><small>QUICK RACE</small></div><div class="header-actions">${iconButton('fullscreen','全屏游戏','fullscreen')}${iconButton('settings','游戏设置','settings')}</div></header>
        <div class="garage-body">
          <div class="driver-info"><div class="section-kicker"><span class="tiny-line"></span> 选择你的车手 <span id="character-index">01 / 04</span></div><div class="driver-name"><h1 id="character-name">霓虹兔</h1><span id="character-en">NOVA</span></div><span class="driver-tag" id="character-tag">漂移专家</span><p id="character-description" class="driver-description"></p>
            <div class="driver-specs"><div><span>极速</span><i><b id="stat-speed"></b></i></div><div><span>操控</span><i><b id="stat-handling"></b></i></div><div><span>加速</span><i><b id="stat-acceleration"></b></i></div></div>
          </div>
          <div class="driver-selection" role="group" aria-label="选择车手">${CHARACTERS.map((c,i)=>`<button class="driver-option" data-character="${c.id}" style="--driver-color:${c.color}" aria-pressed="${i===0}" aria-label="选择${c.name}，${c.tag}"><span class="driver-portrait"><img src="${import.meta.env.BASE_URL}images/${c.id}.jpg" alt="" draggable="false"/><span class="driver-number">0${i+1}</span><span class="driver-check">✓</span></span><span class="driver-shortname">${c.name}</span></button>`).join('')}</div>
          <div class="showcase-caption" aria-hidden="true"><span class="caption-line"></span><span id="showcase-name">NOVA</span><small>READY TO RACE</small></div>
        </div>
        <div class="race-preparation"><div class="track-selection"><div class="section-kicker"><span class="tiny-line"></span> 选择赛道 <span>03 条赛道</span></div><div class="track-options" role="group" aria-label="选择赛道">${TRACKS.map((t,i)=>`<button class="track-option" data-track="${t.id}" aria-pressed="${i===0}" aria-label="选择${t.name}，${t.difficulty}"><img src="${import.meta.env.BASE_URL}images/${t.image}" alt="${t.name}赛道概念图" draggable="false"/><span class="track-shade"></span><span class="track-number">0${i+1}</span><span class="track-difficulty">${t.difficulty}</span><span class="track-title">${t.name}</span><span class="track-tag">${t.tag}</span><span class="track-selection-mark">${icon('flag')}</span></button>`).join('')}</div></div>
          <div class="launch-panel"><div class="race-format"><span><i></i> 单人竞速</span><span><b id="menu-laps">3</b> 圈 <em>/</em> 4 位车手</span></div><button class="start-button" id="start-race" data-action="start"><span><b>开始比赛</b><small>START RACE</small></span>${icon('arrow')}</button><div class="best-record"><span>赛道个人最佳</span><b id="menu-best">等待你的第一个纪录</b></div></div>
        </div>
        <footer class="garage-footer"><span><kbd>W A S D</kbd> 驾驶 <i>·</i> <kbd>SPACE</kbd> 漂移 <i>·</i> <kbd>SHIFT</kbd> 氮气</span><span class="touch-help">转向时按住漂移，松开后加速出弯</span><span class="garage-footer-right"><i></i> 极速，始于下一个弯。</span></footer>
      </section>
      <section id="race-hud" class="race-hud screen" hidden aria-label="比赛状态">
        <div class="race-top-left"><div class="position"><span class="hud-label">当前排名</span><div><b id="race-position">1</b><span>/ 4</span></div></div><div class="lap-time"><div class="lap-row"><span class="hud-label">圈数</span><strong><b id="race-lap">1</b><small> / <span id="race-laps">3</span></small></strong></div><div class="time-row"><span class="hud-label">用时</span><b id="race-time">00:00.00</b></div><div class="race-best-row"><span>最佳</span><b id="race-best">—</b></div></div></div>
        <div class="race-top-right"><span class="race-course" id="race-track-name"></span>${iconButton('mute','关闭声音','sound')}${iconButton('pause','暂停比赛','pause')}</div>
        <div class="race-message" id="race-message" role="status" aria-live="polite"></div>
        <div class="standings" aria-label="实时排名">${Array.from({length:4},(_,i)=>`<div class="standing-row" id="standing-${i}"><span>${i+1}</span><i id="standing-dot-${i}"></i><b id="standing-name-${i}"></b></div>`).join('')}</div>
        <div class="minimap-cluster"><canvas id="minimap" width="220" height="170" aria-label="赛道小地图及车手位置"></canvas><span id="minimap-track"></span></div>
        <div class="speed-cluster"><div class="speedometer"><svg viewBox="0 0 220 158" aria-hidden="true"><path class="speed-track" d="M25 139 A98 98 0 1 1 195 139"/><path id="speed-arc" class="speed-arc" d="M25 139 A98 98 0 1 1 195 139" pathLength="100"/><path class="speed-ticks" d="m36 47 7 5m-18 24 9 3m151-3-9 3m8-32-7 5M110 12v10M70 21l4 10m76-10-4 10"/></svg><div class="speed-value"><b id="race-speed">000</b><span>KM/H</span></div><span class="boost-active" id="boost-active" hidden>氮气加速</span></div><div class="energy-label"><span>${icon('bolt')} 氮气</span><small id="energy-status">漂移积蓄氮气</small></div><div class="energy-meter" role="meter" aria-label="氮气能量" aria-valuemin="0" aria-valuemax="100" id="energy-meter"><span id="energy-fill"></span></div><div class="drift-meter-row"><span>漂移</span><div class="drift-meter"><i id="drift-fill"></i></div><kbd>SPACE</kbd></div></div>
        <div class="race-key-hint"><kbd>SPACE</kbd> 漂移 <span>＋</span> <kbd>SHIFT</kbd> 氮气</div>
        <div class="touch-controls" id="touch-controls" aria-label="触屏驾驶控制"><div class="touch-steering"><button class="touch-button steering-button" data-input="left" aria-label="向左转向">${icon('left')}</button><button class="touch-button steering-button" data-input="right" aria-label="向右转向">${icon('right')}</button></div><div class="touch-actions"><button class="touch-button boost-button" data-input="boost" aria-label="释放氮气">${icon('bolt')}<span>氮气</span></button><button class="touch-button drift-button" data-input="drift" aria-label="按住漂移">${icon('drift')}<span>漂移</span></button><button class="touch-button pedal-button brake-button" data-input="brake" aria-label="刹车">${icon('brake')}<span>刹车</span></button><button class="touch-button pedal-button throttle-button" data-input="throttle" aria-label="加速油门">${icon('throttle')}<span>油门</span></button></div></div>
      </section>
      <div id="countdown" class="countdown" hidden aria-live="assertive"><span id="countdown-label">准备发车</span><b id="countdown-number">3</b><small>抢占内线，保持节奏</small></div>
      <section id="pause-screen" class="modal-backdrop screen" hidden><div class="pause-dialog modal-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="modal-kicker">PIT STOP</div><h2 id="pause-title">稍作停靠</h2><p>比赛已暂停，赛道在等你。</p><button class="primary-button" id="resume-race" data-action="resume">继续比赛 ${icon('arrow')}</button><button class="secondary-button" data-action="retry">重新比赛</button><div class="pause-secondary"><button data-action="settings">游戏设置</button><span></span><button data-action="menu">返回车库</button></div><small class="pause-key"><kbd>ESC</kbd> 返回赛道</small></div></section>
      <section id="results-screen" class="modal-backdrop results-backdrop screen" hidden><div class="results-dialog modal-panel" role="dialog" aria-modal="true" aria-labelledby="results-title"><div class="results-heading"><div><div class="modal-kicker">RACE COMPLETE</div><h2 id="results-title">冲线，漂亮！</h2><p id="result-track"></p></div><div class="result-place"><b id="result-position">1</b><span id="result-place-label">冠军</span></div></div><div class="result-time"><span>完赛时间</span><b id="result-time">00:00.000</b><strong id="new-record" hidden>新纪录</strong></div><div class="result-list"><div class="result-table-head"><span>排名 / 车手</span><span>完赛时间</span></div>${Array.from({length:4},(_,i)=>`<div class="result-row" id="result-row-${i}"><span class="result-rank">0${i+1}</span><b id="result-name-${i}"></b><span class="result-player-label" id="result-player-${i}" hidden>你</span><time id="result-finish-${i}"></time></div>`).join('')}</div><div class="results-actions"><button class="secondary-button" data-action="menu">返回车库</button><button class="primary-button" id="retry-race" data-action="retry">再跑一场 ${icon('arrow')}</button></div></div></section>
      <section id="settings-screen" class="modal-backdrop settings-backdrop" hidden><div class="settings-dialog modal-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="settings-heading"><div><div class="modal-kicker">TUNE YOUR RIDE</div><h2 id="settings-title">游戏设置</h2></div>${iconButton('close-settings','关闭设置','close')}</div><div class="setting-row"><label for="setting-volume">主音量</label><div class="volume-control"><input id="setting-volume" type="range" min="0" max="100" step="1" aria-label="主音量"/><output id="volume-value" for="setting-volume">70%</output></div></div><div class="setting-row"><label for="setting-muted">静音</label><input type="checkbox" class="switch" id="setting-muted"/></div><div class="setting-row"><label for="setting-quality">画面质量<small>自动模式根据设备调整</small></label><select id="setting-quality"><option value="auto">自动推荐</option><option value="high">精细</option><option value="low">流畅</option></select></div><div class="setting-row"><label for="setting-motion">减少动态效果<small>减弱镜头震动与速度特效</small></label><input type="checkbox" class="switch" id="setting-motion"/></div><div class="setting-row"><label for="setting-auto">自动油门<small>专注转向，刹车仍可减速</small></label><input type="checkbox" class="switch" id="setting-auto"/></div><button class="primary-button" data-action="close-settings">完成设置 ${icon('arrow')}</button></div></section>
    `;
    this.root.querySelectorAll<HTMLElement>('[id]').forEach(el=>this.elements.set(el.id,el));
    this.mapContext = (this.el('minimap') as HTMLCanvasElement).getContext('2d');
    this.bindActions();
    this.bindTouch();
    document.addEventListener('keydown', event => {
      if(this.settingsOpen && event.key === 'Escape') {
        event.stopImmediatePropagation(); event.preventDefault(); this.closeSettings(); return;
      }
      if(event.key !== 'Tab') return;
      const active = this.settingsOpen ? this.el('settings-screen') : this.latest?.phase === 'paused' ? this.el('pause-screen') : this.latest?.phase === 'results' ? this.el('results-screen') : null;
      if(!active) return;
      const controls = Array.from(active.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]')).filter(el=>!el.hasAttribute('disabled'));
      const first = controls[0], last = controls[controls.length-1];
      if(event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    },true);
  }

  private el(id:string) {return this.elements.get(id)!;}
  private setText(id:string,value:string) {
    if(this.textValues.get(id) !== value) {this.el(id).textContent=value;this.textValues.set(id,value);}
  }

  private bindActions() {
    this.root.addEventListener('click',event=>{
      const target = (event.target as Element).closest<HTMLElement>('button, a[data-action]');
      if(!target) return;
      const character = target.dataset.character as CharacterId|undefined;
      const track = target.dataset.track;
      if(character) {this.actions.selectCharacter(character);return;}
      if(track) {this.actions.selectTrack(track as RaceView['track']);return;}
      const action = target.dataset.action;
      if(!action) return;
      event.preventDefault();
      switch(action) {
        case 'start': this.clearTouch(); this.actions.start(); break;
        case 'pause': this.clearTouch(); this.actions.pause(); break;
        case 'resume': this.actions.resume(); break;
        case 'retry': this.clearTouch(); this.closeSettings(false); this.actions.retry(); break;
        case 'menu': this.clearTouch(); this.closeSettings(false); this.actions.menu(); break;
        case 'mute': this.actions.mute(); break;
        case 'fullscreen': this.actions.fullscreen(); break;
        case 'settings': this.openSettings(target); break;
        case 'close-settings': this.closeSettings(); break;
      }
    });
    this.el('setting-volume').addEventListener('input', event=>this.actions.setVolume(Number((event.target as HTMLInputElement).value)/100));
    this.el('setting-muted').addEventListener('change', ()=>this.actions.mute());
    this.el('setting-quality').addEventListener('change', event=>this.actions.setQuality((event.target as HTMLSelectElement).value as RaceView['quality']));
    this.el('setting-motion').addEventListener('change', event=>this.actions.setReducedMotion((event.target as HTMLInputElement).checked));
    this.el('setting-auto').addEventListener('change', event=>this.actions.setAutoAccelerate((event.target as HTMLInputElement).checked));
  }

  private bindTouch() {
    for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-input]')) {
      const key = button.dataset.input as keyof InputState;
      button.addEventListener('pointerdown', event=>{
        event.preventDefault();
        if(this.latest?.phase !== 'racing' && this.latest?.phase !== 'countdown') return;
        this.heldPointers.set(event.pointerId,key); button.setPointerCapture(event.pointerId);
        button.classList.add('held'); this.actions.input(key,true);
      });
      const release = (event:PointerEvent)=>{
        if(!this.heldPointers.has(event.pointerId)) return;
        this.heldPointers.delete(event.pointerId);
        if(!Array.from(this.heldPointers.values()).includes(key)) {button.classList.remove('held');this.actions.input(key,false);}
        if(button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      };
      button.addEventListener('pointerup',release); button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
      button.addEventListener('contextmenu',event=>event.preventDefault());
    }
    window.addEventListener('blur',()=>this.clearTouch());
    document.addEventListener('visibilitychange',()=>{if(document.hidden) this.clearTouch();});
  }

  private clearTouch() {
    for(const key of new Set(this.heldPointers.values())) this.actions.input(key,false);
    this.heldPointers.clear(); this.root.querySelectorAll('.touch-button.held').forEach(el=>el.classList.remove('held'));
  }

  private openSettings(origin:HTMLElement) {
    this.settingsOpen=true; this.settingsReturn=origin; this.el('settings-screen').hidden=false;
    this.el('menu-screen').inert=true; this.el('pause-screen').inert=true;
    this.el('setting-volume').focus({preventScroll:true});
  }

  private closeSettings(restoreFocus=true) {
    this.settingsOpen=false; this.el('settings-screen').hidden=true;
    this.el('menu-screen').inert=false; this.el('pause-screen').inert=false;
    if(restoreFocus) this.settingsReturn?.focus({preventScroll:true});
  }

  update(view:RaceView) {
    this.latest=view;
    const activeRace = view.phase === 'racing' || view.phase === 'countdown' || view.phase === 'paused';
    if(this.previousPhase !== view.phase) {
      this.previousPhase=view.phase; this.root.dataset.phase=view.phase;
      this.el('loading-screen').hidden=view.phase!=='loading'; this.el('menu-screen').hidden=view.phase!=='menu';
      this.el('race-hud').hidden=!activeRace; this.el('pause-screen').hidden=view.phase!=='paused';
      this.el('results-screen').hidden=view.phase!=='results'; this.el('countdown').hidden=view.phase!=='countdown';
      this.el('race-hud').inert=view.phase==='paused';
      if(view.phase !== 'racing' && view.phase !== 'countdown') this.clearTouch();
      if(view.phase==='paused') this.el('resume-race').focus({preventScroll:true});
      if(view.phase==='results') this.el('retry-race').focus({preventScroll:true});
      if(view.phase==='menu' && this.settingsOpen) this.closeSettings(false);
    }
    this.root.classList.toggle('reduced-motion',view.reducedMotion);
    this.root.classList.toggle('is-boosting',view.boosting);
    this.root.classList.toggle('auto-accelerate',view.autoAccelerate);
    if(view.phase==='loading') {
      const percentage=Math.round(Math.min(1,Math.max(0,view.loading))*100);
      this.setText('loading-text',view.loadingText);this.setText('loading-value',`${percentage}%`);
      this.el('loading-bar').style.transform=`scaleX(${percentage/100})`;
    }
    if(this.previousCharacter !== view.character) {
      this.previousCharacter=view.character;
      const character=CHARACTERS.find(c=>c.id===view.character)!;
      this.root.style.setProperty('--character-color',character.color);
      this.setText('character-name',character.name);this.setText('character-en',character.en);this.setText('showcase-name',character.en);
      this.setText('character-tag',character.tag);this.setText('character-description',character.description);
      this.setText('character-index',`0${CHARACTERS.indexOf(character)+1} / 04`);
      this.el('stat-speed').style.width=`${character.speed/1.2*100}%`;
      this.el('stat-handling').style.width=`${character.handling/1.2*100}%`;
      this.el('stat-acceleration').style.width=`${character.acceleration/1.2*100}%`;
      this.root.querySelectorAll<HTMLElement>('[data-character]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.character===view.character)));
    }
    if(this.previousTrack !== view.track) {
      this.previousTrack=view.track;
      const track=TRACKS.find(t=>t.id===view.track)!;
      this.setText('race-track-name',track.name);this.setText('minimap-track',track.en);this.setText('result-track',`${track.name} · ${view.laps} 圈竞速`);
      this.root.querySelectorAll<HTMLElement>('[data-track]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.track===view.track)));
    }
    this.setText('menu-best',view.best===null?'等待你的第一个纪录':clockText(view.best,3));
    this.setText('menu-laps',String(view.laps));
    this.syncSettings(view);
    if(activeRace) {
      this.setText('race-position',String(view.position));this.setText('race-lap',String(Math.min(view.laps,Math.max(1,view.lap))));
      this.setText('race-laps',String(view.laps));this.setText('race-time',clockText(view.time));this.setText('race-best',view.best===null?'—':clockText(view.best));
      this.setText('race-speed',String(Math.max(0,Math.round(view.speed))).padStart(3,'0'));
      this.el('speed-arc').style.strokeDasharray=`${Math.min(100,Math.max(0,view.speed/260*100))} 100`;
      const energy=Math.min(1,Math.max(0,view.energy/100)), drift=Math.min(1,Math.max(0,view.drift));
      this.el('energy-fill').style.transform=`scaleX(${energy})`;this.el('drift-fill').style.transform=`scaleX(${drift})`;
      this.el('energy-meter').setAttribute('aria-valuenow',String(Math.round(energy*100)));
      this.setText('energy-status',view.boosting?'全速释放中':energy>=.4?'氮气可用':'漂移积蓄氮气');
      this.el('energy-meter').classList.toggle('ready',energy>=.4);this.el('boost-active').hidden=!view.boosting;
      const boostButton=this.root.querySelector<HTMLElement>('[data-input="boost"]')!;
      boostButton.classList.toggle('ready',energy>=.4);
      this.setText('race-message',view.message); this.el('race-message').dataset.kind=view.messageKind;
      this.el('race-message').classList.toggle('visible',Boolean(view.message));
      const countdown=view.countdown>0?String(Math.ceil(view.countdown)):'GO';
      this.setText('countdown-number',countdown);this.setText('countdown-label',view.countdown>0?'准备发车':'全速出发');
      for(let i=0;i<4;i++) {
        const standing=view.standings[i];this.el(`standing-${i}`).hidden=!standing;
        if(standing) {this.setText(`standing-name-${i}`,standing.name);this.el(`standing-dot-${i}`).style.background=standing.color;this.el(`standing-${i}`).classList.toggle('you',standing.id===view.character);}
      }
      const now=performance.now();if(now-this.lastMapFrame>60) {this.drawMap(view);this.lastMapFrame=now;}
    }
    if(view.phase==='results') {
      this.setText('result-position',String(view.resultPosition));
      this.setText('result-place-label',['冠军','亚军','季军','完赛'][Math.max(0,Math.min(3,view.resultPosition-1))]!);
      this.setText('results-title',view.resultPosition===1?'冠军，属于你！':'冲线，漂亮！');
      this.setText('result-time',clockText(view.time,3));this.el('new-record').hidden=!view.newBest;
      for(let i=0;i<4;i++) {
        const result=view.finishTimes[i];this.el(`result-row-${i}`).hidden=!result;
        if(result) {this.setText(`result-name-${i}`,result.name);this.setText(`result-finish-${i}`,result.time===null?'尚未完赛':clockText(result.time,3));this.el(`result-player-${i}`).hidden=!result.player;this.el(`result-row-${i}`).classList.toggle('you',result.player);}
      }
    }
  }

  private syncSettings(view:RaceView) {
    const volume=this.el('setting-volume') as HTMLInputElement;
    if(document.activeElement !== volume) volume.value=String(Math.round(view.volume*100));
    this.setText('volume-value',`${Math.round(view.volume*100)}%`);
    (this.el('setting-muted') as HTMLInputElement).checked=view.muted;
    (this.el('setting-quality') as HTMLSelectElement).value=view.quality;
    (this.el('setting-motion') as HTMLInputElement).checked=view.reducedMotion;
    (this.el('setting-auto') as HTMLInputElement).checked=view.autoAccelerate;
    const muteButton=this.root.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
    if(muteButton.dataset.muted !== String(view.muted)) {
      muteButton.dataset.muted=String(view.muted);muteButton.innerHTML=icon(view.muted?'muted':'sound');
      muteButton.setAttribute('aria-label',view.muted?'开启声音':'关闭声音');muteButton.title=view.muted?'开启声音':'关闭声音';
      muteButton.setAttribute('aria-pressed',String(view.muted));
    }
  }

  private drawMap(view:RaceView) {
    const ctx=this.mapContext;if(!ctx || !view.minimap.length) return;
    const width=220,height=170,pad=17;
    ctx.clearRect(0,0,width,height);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const point of view.minimap) {minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
    const scale=Math.min((width-pad*2)/Math.max(1,maxX-minX),(height-pad*2)/Math.max(1,maxY-minY));
    const map=(x:number,y:number)=>({x:(x-(minX+maxX)/2)*scale+width/2,y:(y-(minY+maxY)/2)*scale+height/2});
    ctx.beginPath();view.minimap.forEach((point,i)=>{const p=map(point.x,point.y);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.closePath();
    ctx.strokeStyle='rgba(3,10,18,.8)';ctx.lineWidth=11;ctx.lineJoin='round';ctx.stroke();
    ctx.strokeStyle='rgba(146,192,203,.65)';ctx.lineWidth=4;ctx.stroke();
    const first=map(view.minimap[0]!.x,view.minimap[0]!.y);ctx.fillStyle='#ffffff';ctx.fillRect(first.x-3,first.y-5,6,10);
    const markers=[...view.markers].sort((a,b)=>Number(a.player)-Number(b.player));
    for(const marker of markers) {const p=map(marker.x,marker.y);ctx.beginPath();ctx.arc(p.x,p.y,marker.player?5.5:3.5,0,Math.PI*2);ctx.fillStyle=marker.player?'#71fbff':marker.color;ctx.fill();ctx.lineWidth=marker.player?2:1;ctx.strokeStyle=marker.player?'#fff':'#07141f';ctx.stroke();}
  }
}
