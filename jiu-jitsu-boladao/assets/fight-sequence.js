const fightExperience=document.querySelector('#fight-experience');
const fightTitle=document.querySelector('#fight-title');
const fightStages=[
  {word:'Base',detail:'Guarda aberta. Criar o ângulo.',kicker:'Ponto de partida'},
  {word:'Controle',detail:'Giro concluído. Controle das costas.',kicker:'Transição'},
  {word:'Finalização',detail:'Costas dominadas. Mata-leão.',kicker:'Desfecho'}
];
let fightCurrent=0,fightTarget=0,fightTimer=0;
function renderFightStage(index){
  fightCurrent=index;
  const step=fightStages[index];
  fightExperience.dataset.active=String(index);
  document.querySelector('#fight-word').textContent=step.word;
  document.querySelector('#fight-detail').textContent=step.detail;
  document.querySelector('#fight-kicker').textContent=step.kicker;
  document.querySelectorAll('#sequencia [data-stage]').forEach(button=>{
    const active=Number(button.dataset.stage)===index;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  if(!motionOff&&!reduce.matches){
    fightTitle.classList.remove('swap');
    void fightTitle.offsetWidth;
    fightTitle.classList.add('swap');
  }
}
function advanceFight(){
  fightTimer=0;
  if(fightCurrent===fightTarget)return;
  renderFightStage(fightCurrent+Math.sign(fightTarget-fightCurrent));
  if(fightCurrent!==fightTarget)fightTimer=setTimeout(advanceFight,850);
}
function showStage(index){
  fightTarget=Math.max(0,Math.min(2,index));
  clearTimeout(fightTimer);
  fightTimer=0;
  if(motionOff||reduce.matches){renderFightStage(fightTarget);return}
  advanceFight();
}
const fight={pause(){clearTimeout(fightTimer);fightTimer=0;fightTarget=fightCurrent}};
document.addEventListener('pause-silhouettes',()=>fight.pause());
document.addEventListener('visibilitychange',()=>{if(document.hidden)fight.pause()});
new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)fight.pause()},{threshold:.05}).observe(document.querySelector('#sequencia'));
