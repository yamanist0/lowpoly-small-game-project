import './bankPuzzle.css';

type PuzzleKind='atm'|'vault'|'house-door'|'house-safe';
export type SafeDifficulty=0|1|2;
const wires=[{name:'CIRCLE',color:'#5ecfbe',symbol:'●'},{name:'SQUARE',color:'#f1bf66',symbol:'■'},{name:'TRIANGLE',color:'#ed7770',symbol:'▲'},{name:'DIAMOND',color:'#9cb6f1',symbol:'◆'}];
function shuffled<T>(items:readonly T[]){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export class BankPuzzle {
 private readonly overlay=document.createElement('div');
 private done:()=>void=()=>{};private frame=0;private onKey:(e:KeyboardEvent)=>void=()=>{};
 constructor(){this.overlay.className='bank-puzzle-overlay';this.overlay.hidden=true;document.body.appendChild(this.overlay);}
 get isOpen(){return !this.overlay.hidden;}
 close(){if(!this.isOpen)return;this.overlay.hidden=true;cancelAnimationFrame(this.frame);window.removeEventListener('keydown',this.onKey,true);this.overlay.replaceChildren();}
 open(kind:PuzzleKind,done:()=>void,options:{onFailure?:()=>void;difficulty?:SafeDifficulty;atmReward?:number}={}){
  this.close();this.done=done;this.overlay.hidden=false;
  this.overlay.innerHTML=`<section class="bank-puzzle kind-${kind}" role="dialog" aria-modal="true" aria-labelledby="puzzle-title"><header class="bank-puzzle-header"><div><h2 id="puzzle-title"></h2><p data-description></p></div><button type="button" data-close aria-label="Close puzzle">×</button></header><div class="bank-puzzle-body"></div><footer><span data-status role="status" aria-live="polite"></span><span>ESC TO LEAVE</span></footer></section>`;
  const title=this.overlay.querySelector<HTMLElement>('#puzzle-title')!,description=this.overlay.querySelector<HTMLElement>('[data-description]')!,body=this.overlay.querySelector<HTMLElement>('.bank-puzzle-body')!,status=this.overlay.querySelector<HTMLElement>('[data-status]')!;
  const abandon=()=>{this.close();if(options.atmReward!==undefined)options.onFailure?.();};
  this.overlay.querySelector<HTMLButtonElement>('[data-close]')!.addEventListener('click',abandon);
  let tryPin:()=>void=()=>{};
  this.onKey=e=>{if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();abandon();}else if(kind!=='atm'&&e.code==='Space'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)tryPin();}};window.addEventListener('keydown',this.onKey,true);
  if(kind==='atm'){
   title.textContent='ATM WIRING';description.textContent=options.atmReward===undefined?'Connect matching symbols to bypass the cash dispenser.':`$${options.atmReward} | Connect all wires before time runs out. One mistake triggers the alarm.`;status.textContent='Select a wire on the left, then its matching terminal.';
   if(options.atmReward!==undefined){const seconds=30-Math.floor((options.atmReward-500)/1500*18),deadline=performance.now()+seconds*1000;const tick=(now:number)=>{const left=Math.max(0,Math.ceil((deadline-now)/1000));description.textContent=`$${options.atmReward} | ${left}s remaining | One wrong connection fails`;if(now>=deadline){this.close();options.onFailure?.();return;}this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
   body.innerHTML='<div class="wire-board"><div class="wire-side" data-left></div><svg class="wire-lines" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100"></svg><div class="wire-side" data-right></div></div>';
   const left=body.querySelector<HTMLElement>('[data-left]')!,right=body.querySelector<HTMLElement>('[data-right]')!,svg=body.querySelector<SVGElement>('svg')!;const shuffledRight=shuffled(wires);let selected=-1;const linked=new Set<number>();
   const leftButtons:HTMLButtonElement[]=[],rightButtons:HTMLButtonElement[]=[];
   wires.forEach((wire,i)=>{const b=document.createElement('button');b.className='wire-button';b.style.setProperty('--wire-color',wire.color);b.innerHTML=`<span aria-hidden="true">${wire.symbol}</span> ${wire.name}`;b.addEventListener('click',()=>{selected=i;leftButtons.forEach((item,j)=>item.classList.toggle('selected',i===j));status.textContent=`${wire.name} selected. Choose the matching terminal.`;});left.appendChild(b);leftButtons.push(b);});
   shuffledRight.forEach((wire,j)=>{const b=document.createElement('button');b.className='wire-button';b.style.setProperty('--wire-color',wire.color);b.innerHTML=`<span aria-hidden="true">${wire.symbol}</span> ${wire.name}`;b.addEventListener('click',()=>{if(selected<0){status.textContent='Select a wire on the left first.';return;}const i=selected;if(wires[i].name!==wire.name){if(options.atmReward!==undefined){this.close();options.onFailure?.();}else status.textContent='Wrong connection. Try again.';return;}linked.add(i);leftButtons[i].disabled=true;leftButtons[i].classList.remove('selected');b.disabled=true;selected=-1;const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',`M 0 ${12.5+i*25} C 40 ${12.5+i*25}, 60 ${12.5+j*25}, 100 ${12.5+j*25}`);line.setAttribute('stroke',wire.color);svg.appendChild(line);status.textContent=`${linked.size} of 4 connections complete.`;if(linked.size===4){this.close();this.done();}});right.appendChild(b);rightButtons.push(b);});
  }else if(kind==='house-door'){
   title.textContent='PICK THE HOUSE LOCK';description.textContent='Set three pins. A missed timing breaks one lockpick.';
   body.innerHTML='<div class="lock-pins" aria-label="Pin progress"><span></span><span></span><span></span></div><div class="lock-track"><div class="lock-zone"></div><div class="lock-needle"></div></div><div class="lock-values"><span>0</span><span>SPACE OR CLICK WHEN THE NEEDLE IS GREEN</span><span>100</span></div><button class="lock-set" type="button">SET PIN</button>';
   const needle=body.querySelector<HTMLElement>('.lock-needle')!,zone=body.querySelector<HTMLElement>('.lock-zone')!,pins=[...body.querySelectorAll<HTMLElement>('.lock-pins span')];let pin=0,marker=.5,target=.2+Math.random()*.6,start=performance.now();
   const halfWidth=.1,setZone=()=>{zone.style.left=`${(target-halfWidth)*100}%`;zone.style.width=`${halfWidth*200}%`;};setZone();needle.style.left='50%';status.textContent='Pin 1 of 3 | A miss breaks the lockpick.';
   tryPin=()=>{if(Math.abs(marker-target)<=halfWidth){pins[pin].classList.add('set');pin++;if(pin===pins.length){this.close();this.done();return;}target=.2+Math.random()*.6;setZone();status.textContent=`Pin ${pin+1} of 3 | A miss breaks the lockpick.`;}else{this.close();options.onFailure?.();}};
   body.querySelector<HTMLButtonElement>('.lock-set')!.addEventListener('click',tryPin);
   body.querySelector<HTMLElement>('.lock-track')!.addEventListener('click',tryPin);
   const animate=(now:number)=>{marker=(1+Math.sin((now-start)*.0026))/2;needle.style.left=`${marker*100}%`;this.frame=requestAnimationFrame(animate);};this.frame=requestAnimationFrame(animate);
  }else if(kind==='house-safe'){
   const difficulty=options.difficulty??1,names=['EASY','MEDIUM','HARD'],pinsNeeded=2+difficulty,green=[.19,.14,.1][difficulty],yellow=green*2.5;
   title.textContent='CRACK THE SAFE';description.textContent=`${names[difficulty]} LOCK | Listen with the stethoscope and stop the moving pointer in the green zone.`;
   body.innerHTML='<div class="safe-stage"><div class="safe-earpiece" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M11 10v16a14 14 0 0 0 28 0V10M8 10h6M36 10h6M25 40v3a10 10 0 0 0 20 0v-4"/><circle cx="46" cy="35" r="4"/></svg></div><div class="safe-ring"><div class="safe-dial"><span></span><span></span><span></span><span></span></div><div class="safe-pointer"></div></div><div class="safe-signal"><span>SIGNAL</span><strong data-signal>RED</strong><small data-safe-pins></small></div></div><button class="lock-set" type="button">SET THE TUMBLER</button>';
   const ring=body.querySelector<HTMLElement>('.safe-ring')!,dial=body.querySelector<HTMLElement>('.safe-dial')!,pointer=body.querySelector<HTMLElement>('.safe-pointer')!,signal=body.querySelector<HTMLElement>('[data-signal]')!,pinText=body.querySelector<HTMLElement>('[data-safe-pins]')!;
   const g=green*180/Math.PI,y=yellow*180/Math.PI;ring.style.background=`conic-gradient(from -${y}deg,#e9bc67 0deg ${y-g}deg,#78d79c ${y-g}deg ${y+g}deg,#e9bc67 ${y+g}deg ${y*2}deg,#b45a58 ${y*2}deg 360deg)`;
   let count=0,angle=Math.PI*(.5+Math.random()),wheel=0,speed=1.2+difficulty*.35,changeIn=.6,last=performance.now(),currentDiff=Math.PI;
   const refresh=()=>{pinText.textContent=`TUMBLER ${count+1} / ${pinsNeeded}`;status.textContent=`${names[difficulty]} | Tumbler ${count+1} of ${pinsNeeded}`;};refresh();
   tryPin=()=>{if(currentDiff<=green){count++;if(count===pinsNeeded){this.close();this.done();return;}angle=Math.PI*(.5+Math.random());currentDiff=Math.min(angle,Math.PI*2-angle);signal.textContent='RED';signal.dataset.color='RED';refresh();}else{count=0;refresh();status.textContent='Missed the green zone. Start the tumblers again.';}};
   body.querySelector<HTMLButtonElement>('.lock-set')!.addEventListener('click',tryPin);
   const animate=(now:number)=>{const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;changeIn-=dt;if(changeIn<=0){speed=1+Math.random()*.8+difficulty*.4;changeIn=.35+Math.random()*.8;}angle=(angle+speed*dt)%(Math.PI*2);wheel+=dt*.75;currentDiff=Math.min(angle,Math.PI*2-angle);pointer.style.transform=`rotate(${angle}rad)`;dial.style.transform=`rotate(${wheel}rad)`;const color=currentDiff<=green?'GREEN':currentDiff<=yellow?'YELLOW':'RED';signal.textContent=color;signal.dataset.color=color;this.frame=requestAnimationFrame(animate);};this.frame=requestAnimationFrame(animate);
  }else{
   title.textContent='VAULT LOCK';description.textContent='Set three pins. Press SPACE or the button while the marker is in the green zone.';
   body.innerHTML='<div class="lock-pins" aria-label="Pin progress"><span></span><span></span><span></span></div><div class="lock-track"><div class="lock-zone"></div><div class="lock-needle"></div></div><div class="lock-values"><span>0</span><span data-lock-hint>ALIGN THE PIN</span><span>100</span></div><button class="lock-set" type="button">SET PIN</button>';
   const needle=body.querySelector<HTMLElement>('.lock-needle')!,zone=body.querySelector<HTMLElement>('.lock-zone')!,pins=[...body.querySelectorAll<HTMLElement>('.lock-pins span')];let pin=0,marker=0,target=.2+Math.random()*.6,start=performance.now();
   const setZone=()=>{zone.style.left=`${(target-.09)*100}%`;zone.style.width='18%';};setZone();status.textContent='Pin 1 of 3';
   tryPin=()=>{if(Math.abs(marker-target)<=.09){pins[pin].classList.add('set');pin++;if(pin===3){this.close();this.done();return;}target=.2+Math.random()*.6;setZone();status.textContent=`Pin ${pin+1} of 3`;}else status.textContent=`Missed. Try pin ${pin+1} again.`;};
   body.querySelector<HTMLButtonElement>('.lock-set')!.addEventListener('click',tryPin);
   const animate=(now:number)=>{marker=(1+Math.sin((now-start)*.0031))/2;needle.style.left=`${marker*100}%`;this.frame=requestAnimationFrame(animate);};this.frame=requestAnimationFrame(animate);
  }
  this.overlay.querySelector<HTMLButtonElement>('[data-close]')!.focus();
 }
}
