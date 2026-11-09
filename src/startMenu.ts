import './startMenu.css';

/** Keeps the game's scene visible while the player establishes an online session. */
export function showStartMenu<T>(connect:(name:string)=>Promise<T>):Promise<T>{
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='game-start';
  overlay.innerHTML=`<main class="start-panel" aria-labelledby="start-title"><div class="start-title-block"><span class="start-edition">ÇEVRİMİÇİ DÜNYA</span><h1 id="start-title">SONSUZ<br><span>ŞEHİRLER</span></h1><p>Şehrini kur. Sokakları keşfet.</p></div><form class="start-form"><label for="start-name">OYUNCU ADI</label><input id="start-name" name="name" maxlength="20" minlength="2" autocomplete="nickname" spellcheck="false" placeholder="Adını yaz" required><p class="start-error" role="status" aria-live="polite"></p><button class="start-play" type="submit"><span>OYUNA GİR</span><span aria-hidden="true">›</span></button></form><div class="start-guide"><div><b>M</b> HARİTA</div><div><b>N</b> ŞEHİR YÖNETİMİ</div><div><b>E</b> ETKİLEŞİM</div></div></main>`;
  document.body.appendChild(overlay);
  const form=overlay.querySelector<HTMLFormElement>('form')!,input=overlay.querySelector<HTMLInputElement>('input')!,button=overlay.querySelector<HTMLButtonElement>('button')!,error=overlay.querySelector<HTMLElement>('.start-error')!;
  try{input.value=localStorage.getItem('sonsuz-sehirler-name')??'';if(input.value&&localStorage.getItem('sonsuz-sehirler-token')){input.readOnly=true;overlay.querySelector('label')!.textContent='KAYITLI OYUNCU';}}catch{/* storage may be unavailable */}
  const stop=(event:Event)=>event.stopPropagation();for(const event of ['keydown','keyup','pointerdown','pointerup','mousedown','mouseup','wheel','contextmenu'])overlay.addEventListener(event,stop);
  form.addEventListener('submit',async event=>{
   event.preventDefault();const name=input.value.trim();if(name.length<2){error.textContent='En az iki karakterli bir oyuncu adı yaz.';input.focus();return;}
   button.disabled=true;input.disabled=true;button.firstElementChild!.textContent='BAĞLANIYOR';error.textContent='Dünya sunucusuna bağlanılıyor…';
   try{const session=await connect(name);try{localStorage.setItem('sonsuz-sehirler-name',name);}catch{/* storage may be unavailable */}overlay.remove();resolve(session);}
   catch(reason){error.textContent=reason instanceof Error?reason.message:'Bağlantı kurulamadı. Tekrar dene.';button.disabled=false;input.disabled=false;button.firstElementChild!.textContent='TEKRAR DENE';button.focus();}
  });
  requestAnimationFrame(()=>input.focus());
 });
}
