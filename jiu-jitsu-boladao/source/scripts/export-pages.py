"""Export the full course interface for GitHub Pages with the hosted API."""
from pathlib import Path
import html
import sys

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'github-pages' / 'jiu-jitsu-boladao'
out.mkdir(parents=True, exist_ok=True)
source = (root / 'public/site.html').read_text()
api = 'https://jiu-jitsu-boladao-modelo-2.batatabarbuda.chatgpt.site'


def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError(f'Expected one match, found {source.count(old)}: {old[:80]}')
    source = source.replace(old, new)


bootstrap = f'''<script>
const courseApi = {api!r};
const courseTokenKey = 'jbb_course_token';
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {{}}) => {{
  const path = typeof input === 'string' ? input : input.url;
  if (!path.startsWith('/api/')) return originalFetch(input, init);
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const token = localStorage.getItem(courseTokenKey);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  return originalFetch(courseApi + path, {{...init, headers, credentials: 'omit'}});
}};
async function setProtectedVideo(video, id) {{
  if (!id) {{ video.dataset.lessonId = ''; video.pause(); video.removeAttribute('src'); video.load(); return; }}
  if (video.dataset.lessonId === id && video.getAttribute('src')) return;
  video.dataset.lessonId = id;
  video.pause(); video.removeAttribute('src'); video.load();
  try {{
    const response = await fetch('/api/video-ticket?id=' + encodeURIComponent(id), {{cache:'no-store'}});
    if (!response.ok) throw Error();
    const data = await response.json();
    if (video.dataset.lessonId === id) {{ video.src = data.url; video.load(); }}
  }} catch {{ if (video.dataset.lessonId === id) video.dataset.lessonId = ''; }}
}}
</script>'''
replace_once('<script>\nconst menuToggle=', bootstrap + '\n<script>\nconst menuToggle=')
source = source.replace('href="/conta"', 'href="conta/"')
source = source.replace("location.href='/conta'", "location.href='conta/'")
source = source.replace("$('#access-signin').href='/conta'", "$('#access-signin').href='conta/'")
source = source.replace("location.href='/site.html'", "location.href='site.html'")
source = source.replace('href="/site.html"', 'href="site.html"')
source = source.replace("location.href='/site.html'", "location.href='site.html'")
source = source.replace("'/assets/professor-em-pe.webp'", "'assets/professor-em-pe.webp'")
source = source.replace("'/api/professor-photo?v='+", "courseApi+'/api/professor-photo?v'+") if False else source
source = source.replace("?'/api/professor-photo?v='+", "?courseApi+'/api/professor-photo?v='+")
old = "const video=$('#daily-video'),hasVideo=!!latest?.has_video,src=hasVideo?'/api/lesson-video?id='+encodeURIComponent(latest.id):'';\n  if(video.getAttribute('src')!==src){video.pause();if(src)video.src=src;else video.removeAttribute('src');video.load()}"
new = "const video=$('#daily-video'),hasVideo=!!latest?.has_video;\n  setProtectedVideo(video,hasVideo?latest.id:null);"
replace_once(old, new)
old = "const video=$('#lesson-video'),hasVideo=!!lesson.has_video,src=hasVideo?'/api/lesson-video?id='+encodeURIComponent(lesson.id):'';\n  if(video.getAttribute('src')!==src){video.pause();if(src)video.src=src;else video.removeAttribute('src');video.load()}"
new = "const video=$('#lesson-video'),hasVideo=!!lesson.has_video;\n  setProtectedVideo(video,hasVideo?lesson.id:null);"
replace_once(old, new)
replace_once("}finally{location.href='site.html'}});", "}finally{localStorage.removeItem(courseTokenKey);location.href='site.html'}});")
source = source.replace('src="/assets/', 'src="assets/')
source = source.replace('<meta name="theme-color"', '<meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color"')
(out / 'index.html').write_text(source)
(out / 'site.html').write_text(source)
assets = out / 'assets'
assets.mkdir(exist_ok=True)
for path in (root / 'public/assets').iterdir():
    if path.is_file(): (assets / path.name).write_bytes(path.read_bytes())
(out / 'favicon.svg').write_bytes((root / 'public/favicon.svg').read_bytes())

style = (root / 'app/conta/style.css').read_text()
account = '''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Minha conta · Jiu-Jitsu Boladão</title><style>*{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}button,input{font:inherit}[hidden]{display:none!important}''' + style + '''</style></head><body><main class="account-page"><header class="account-head"><a class="account-brand" href="../site.html"><span>JIU-JITSU</span><strong>BOLADÃO</strong></a><a class="account-back" href="../site.html">Voltar ao site</a></header><div class="account-shell"><section class="account-story"><span class="account-eyebrow">Acesso ao curso completo</span><h1>Seu jogo<br><em>começa aqui.</em></h1><p>Do Básico ao Avançado. Aulas extras todos os dias. Entre com sua conta para treinar no seu ritmo.</p><div class="account-strike" aria-hidden="true"></div></section><section class="account-panel" aria-label="Sua conta"><div class="account-tabs"><button type="button" data-mode="login" class="selected">Entrar</button><button type="button" data-mode="register">Criar conta</button></div><h2 id="account-title">Entre na sua conta.</h2><p id="account-message" hidden></p><form id="account-form"><label id="email-label">E-mail<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="seu@email.com"></label><label id="phone-label" hidden>Celular<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999"></label><label id="cpf-label" hidden>CPF<input name="cpf" type="text" inputmode="numeric" autocomplete="off" minlength="11" maxlength="14" placeholder="000.000.000-00"></label><label id="password-label">Senha<input name="password" type="password" autocomplete="current-password" required placeholder="Sua senha"></label><button class="account-submit" type="submit"><span id="submit-label">Entrar</span><span aria-hidden="true">↗</span></button></form><button id="forgot" type="button" class="account-minor">Esqueci minha senha</button><p id="account-foot" class="account-foot" hidden></p></section></div></main><script>
const api = ''' + repr(api) + ''';
const tokenKey='jbb_course_token';
let mode=new URLSearchParams(location.search).has('redefinir')?'password':'login';
function select(next){mode=next;const register=next==='register',password=next==='password',forgot=next==='forgot';document.querySelector('#account-title').textContent=register?'Crie sua conta.':password?'Nova senha.':forgot?'Recupere o acesso.':'Entre na sua conta.';document.querySelector('#email-label').hidden=password||forgot;document.querySelector('#phone-label').hidden=!register;document.querySelector('#cpf-label').hidden=!register;document.querySelector('#password-label').hidden=forgot;document.querySelector('#account-form').hidden=forgot;document.querySelector('#forgot').hidden=next!=='login';document.querySelector('#account-foot').hidden=!register&&!forgot;document.querySelector('#account-foot').textContent=register?'Depois de criar a conta, conclua a compra para liberar as aulas.':'Peça ao professor um link individual de redefinição de senha.';document.querySelector('#password-label').firstChild.textContent=password?'Nova senha':'Senha';const pass=document.querySelector('[name=password]');pass.autocomplete=next==='login'?'current-password':'new-password';pass.minLength=next==='login'?0:12;document.querySelector('[name=email]').required=!password&&!forgot;document.querySelector('[name=phone]').required=register;document.querySelector('[name=cpf]').required=register;document.querySelector('#submit-label').textContent=register?'Criar conta':password?'Salvar nova senha':'Entrar';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===(register?'register':'login')));document.querySelector('#account-message').hidden=true}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.mode)));
document.querySelector('#forgot').addEventListener('click',()=>select('forgot'));
document.querySelector('#account-form').addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.currentTarget),button=e.currentTarget.querySelector('[type=submit]'),message=document.querySelector('#account-message');button.disabled=true;message.hidden=true;try{const response=await fetch(api+'/api/account',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({action:mode,email:form.get('email'),password:form.get('password'),phone:form.get('phone'),cpf:form.get('cpf'),reset:new URLSearchParams(location.search).get('redefinir')||''})});const data=await response.json();if(!response.ok)throw Error(data.error||'Tente novamente.');if(mode==='login'||mode==='register'){if(!/^[a-f0-9]{64}$/.test(data.token||''))throw Error('Não foi possível iniciar a sessão.');localStorage.setItem(tokenKey,data.token);location.assign('../site.html?entrar=aluno');return}message.className='account-success';message.textContent=data.message||'Senha atualizada.';message.hidden=false;history.replaceState(null,'','./');select('login');message.hidden=false}catch(error){message.className='account-error';message.textContent=error.message||'Falha de conexão. Tente novamente.';message.hidden=false}finally{button.disabled=false}});
select(mode);
</script></body></html>'''
(out / 'conta').mkdir(exist_ok=True)
(out / 'conta/index.html').write_text(account)
print(f'Exported {out}')
