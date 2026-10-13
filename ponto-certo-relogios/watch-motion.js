'use strict';
(() => {
  const pointer=window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const selector='.hero-stage, .product-visual, .detail-visual';
  const states=new Map();
  const watchVariables=['--watch-x','--watch-y','--watch-rx','--watch-ry','--watch-rz'];
  let active=null,frame=0,previous=0;
  const clamp=n=>Math.max(-1,Math.min(1,n));
  const enabled=()=>pointer.matches&&!reduced.matches;
  function createState(host){
    const hero=host.classList.contains('hero-stage');
    const base=host.getBoundingClientRect();
    const layers=[];
    function add(element,reference,profile){
      if(!element||!reference)return;
      const b=reference.getBoundingClientRect();
      layers.push({element,kind:'xy',x:0,y:0,tx:0,ty:0,...profile,bounds:{cx:b.left-base.left+b.width/2,cy:b.top-base.top+b.height/2,width:b.width,height:b.height}});
    }
    const image=host.querySelector('.watch-image');
    if(hero){
      add(image,host.querySelector('.hero-watch'),{kind:'watch',ampX:18,ampY:11,tau:240,reach:120,tiltX:3.5,tiltY:6.5,turn:1.4});
      const top=host.querySelector('.hero-title-solid');
      const bottom=host.querySelector('.hero-title-outline');
      const orbit=host.querySelector('.orbit');
      const dot=host.querySelector('.orbit-dot');
      add(top,top,{ampX:-2.8,ampY:-1.8,tau:260,reach:45});
      add(bottom,bottom,{ampX:2,ampY:1.3,tau:320,reach:45});
      add(orbit,orbit,{ampX:-1.8,ampY:-1.2,tau:340,reach:65});
      add(orbit,orbit,{kind:'outer',ampX:.9,ampY:.65,tau:430,reach:85});
      add(dot,dot,{ampX:.7,ampY:.7,tau:240,reach:32});
      host.querySelectorAll('.hero-picker>button').forEach((button,i)=>add(button,button,{ampX:1.2,ampY:.9,tau:190+i*30,reach:22}));
    }else add(image,host,{kind:'watch',ampX:9,ampY:5.85,tau:95,reach:0,tiltX:6,tiltY:9,turn:2.5});
    return {host,hero,layers};
  }
  function cleanState(state){for(const l of state.layers){const vars=l.kind==='watch'?watchVariables:l.kind==='outer'?['--outer-x','--outer-y']:['--layer-x','--layer-y'];vars.forEach(v=>l.element.style.removeProperty(v));}}
  function reset(state){state.layers.forEach(l=>{l.tx=0;l.ty=0;});}
  function requestFrame(){if(!frame){previous=performance.now();frame=requestAnimationFrame(animate);}}
  function animate(time){
    frame=0;const dt=Math.max(1,Math.min(40,time-previous));previous=time;let moving=false;
    for(const [host,state] of states){
      if(!host.isConnected){cleanState(state);states.delete(host);if(active===state)active=null;continue;}
      let resting=true;
      for(const l of state.layers){
        const ease=1-Math.exp(-dt/l.tau);l.x+=(l.tx-l.x)*ease;l.y+=(l.ty-l.y)*ease;
        if(l.tx!==0||l.ty!==0||Math.abs(l.x)>.001||Math.abs(l.y)>.001)resting=false;
        const set=(name,value,unit='px')=>l.element.style.setProperty(name,`${value.toFixed(3)}${unit}`);
        if(l.kind==='watch'){
          set('--watch-x',l.x*l.ampX);set('--watch-y',l.y*l.ampY);
          set('--watch-rx',-l.y*l.tiltX,'deg');set('--watch-ry',l.x*l.tiltY,'deg');set('--watch-rz',l.x*l.turn,'deg');
        }else if(l.kind==='outer'){set('--outer-x',l.x*l.ampX);set('--outer-y',l.y*l.ampY);}
        else{set('--layer-x',l.x*l.ampX);set('--layer-y',l.y*l.ampY);}
        if(Math.abs(l.tx-l.x)>.001||Math.abs(l.ty-l.y)>.001)moving=true;
      }
      if(resting){cleanState(state);states.delete(host);if(active===state)active=null;}
    }
    if(moving)frame=requestAnimationFrame(animate);
  }
  document.addEventListener('pointermove',event=>{
    if(!enabled()||event.pointerType==='touch')return;
    const host=event.target.closest(selector);
    if(active&&active.host!==host){reset(active);active=null;requestFrame();}
    if(!host)return;
    const rect=host.getBoundingClientRect();const hero=host.classList.contains('hero-stage');
    const centralWidth=Math.min(rect.width,680);const left=rect.left+(rect.width-centralWidth)/2;
    if(hero&&(event.clientX<left||event.clientX>left+centralWidth)){if(active){reset(active);active=null;requestFrame();}return;}
    if(!rect.width||!rect.height)return;
    let state=states.get(host);if(!state){state=createState(host);states.set(host,state);}active=state;
    const px=event.clientX-rect.left,py=event.clientY-rect.top;
    for(const l of state.layers){
      const dx=px-l.bounds.cx,dy=py-l.bounds.cy;
      const outside=Math.hypot(Math.max(0,Math.abs(dx)-l.bounds.width/2),Math.max(0,Math.abs(dy)-l.bounds.height/2));
      const influence=state.hero?Math.max(0,1-outside/l.reach):1;
      l.tx=clamp(dx/Math.max(l.bounds.width/2,16))*influence;
      l.ty=clamp(dy/Math.max(l.bounds.height/2,16))*influence;
    }
    requestFrame();
  },{passive:true});
  document.addEventListener('pointerout',event=>{if(active&&(!event.relatedTarget||!active.host.contains(event.relatedTarget))){reset(active);active=null;requestFrame();}},{passive:true});
  function rest(){for(const state of states.values())reset(state);active=null;requestFrame();}
  function clear(){cancelAnimationFrame(frame);frame=0;for(const state of states.values())cleanState(state);states.clear();active=null;}
  window.addEventListener('blur',rest);window.addEventListener('scroll',rest,{passive:true});window.addEventListener('resize',clear,{passive:true});
  pointer.addEventListener('change',clear);reduced.addEventListener('change',clear);
  if(document.fonts)document.fonts.ready.then(clear);
})();
