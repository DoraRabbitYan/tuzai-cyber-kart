export type CharacterId = 'rabbit' | 'sheep' | 'dog' | 'dragon';
export type TrackId = 'city' | 'canyon' | 'dock';
export type Phase = 'loading' | 'menu' | 'countdown' | 'racing' | 'paused' | 'results';
export const CHARACTERS = [
  {id:'rabbit',name:'霓虹兔',en:'NOVA',tag:'漂移专家',color:'#fc65c4',speed:1.00,handling:1.10,acceleration:1.00,description:'轻盈入弯，把每一次漂移变成下一次超越。'},
  {id:'sheep',name:'雷霆羊',en:'BOLT',tag:'稳定先锋',color:'#ffbf62',speed:0.98,handling:0.98,acceleration:1.08,description:'稳健车身与强劲牵引，在碰撞中保持节奏。'},
  {id:'dog',name:'疾风犬',en:'SCOUT',tag:'操控大师',color:'#b3ed62',speed:0.97,handling:1.20,acceleration:1.04,description:'精准转向，贴着内线穿过每一个连续弯。'},
  {id:'dragon',name:'焰尾龙',en:'EMBER',tag:'极速新星',color:'#ff8157',speed:1.06,handling:0.94,acceleration:0.96,description:'释放涡轮潜能，在长直道上点燃速度。'},
] as const;
export const TRACKS = [
  {id:'city',name:'霓虹都市',en:'NEON METROPOLIS',tag:'雨夜 · 高架环线',difficulty:'入门',color:'#4ae7ed',image:'city.jpg',description:'越过城市天际线，在霓虹雨夜追逐极限。'},
  {id:'canyon',name:'晶能峡谷',en:'CRYSTAL CANYON',tag:'落日 · 连续发卡弯',difficulty:'进阶',color:'#ffb35c',image:'canyon.jpg',description:'穿行赤岩与青色晶簇，把握起伏中的每个弯心。'},
  {id:'dock',name:'轨道船坞',en:'ORBITAL DOCK',tag:'太空 · 工业环道',difficulty:'挑战',color:'#a8a3ff',image:'dock.jpg',description:'地球悬于天际，在轨道设施之间全速穿梭。'},
] as const;
export interface InputState { throttle:boolean; brake:boolean; left:boolean; right:boolean; drift:boolean; boost:boolean; }
export interface RaceView {
  phase:Phase; character:CharacterId; track:TrackId; loading:number; loadingText:string;
  speed:number; lap:number; laps:number; position:number; time:number; best:number|null;
  energy:number; drift:number; boosting:boolean; countdown:number; muted:boolean; volume:number;
  quality:'auto'|'high'|'low'; reducedMotion:boolean; autoAccelerate:boolean;
  message:string; messageKind:'normal'|'boost'|'warning';
  standings:Array<{id:string;name:string;color:string;progress:number;time:number|null}>;
  minimap:Array<{x:number;y:number}>; markers:Array<{x:number;y:number;color:string;player:boolean}>;
  resultPosition:number; newBest:boolean; finishTimes:Array<{name:string;time:number|null;player:boolean}>;
}
export interface UIActions {
  selectCharacter(id:CharacterId):void; selectTrack(id:TrackId):void; start():void;
  pause():void; resume():void; retry():void; menu():void; mute():void;
  setVolume(value:number):void; setQuality(value:'auto'|'high'|'low'):void;
  setReducedMotion(value:boolean):void; setAutoAccelerate(value:boolean):void;
  input(key:keyof InputState,pressed:boolean):void; fullscreen():void;
}
