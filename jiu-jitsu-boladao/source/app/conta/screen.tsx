"use client";

import { FormEvent, useEffect, useState } from "react";

type Mode = "login" | "register" | "forgot" | "password";
type ApiResult = { error?: string; message?: string; redirect?: string };

export default function AccountScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reset, setReset] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setReset(params.get("redefinir") || "");
    if (params.has("redefinir")) setMode("password");
  }, []);

  function select(next: Mode) { setMode(next); setError(""); setMessage(""); }
  async function post(data: Record<string, unknown>): Promise<ApiResult> {
    const response = await fetch("/api/account", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const result = await response.json() as ApiResult;
    return response.ok ? result : { error: result.error || "Tente novamente." };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await post({
        action: mode, email: form.get("email"),
        password: form.get("password"), phone: form.get("phone"), cpf: form.get("cpf"),
        reset,
      });
      if (result.error) { setError(result.error); return; }
      if (mode === "login" || mode === "register") {
        location.assign(result.redirect || "/site.html?entrar=aluno"); return;
      }
      setMessage(result.message || "Senha atualizada.");
      setMode("login");
      history.replaceState(null, "", "/conta");
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setLoading(false); }
  }

  return <main className="account-page">
    <header className="account-head"><a className="account-brand" href="/site.html"><span>JIU-JITSU</span><strong>BOLADÃO</strong></a><a className="account-back" href="/site.html">Voltar ao site</a></header>
    <div className="account-shell">
      <section className="account-story" aria-label="Acesso ao curso"><span className="account-eyebrow">Acesso ao curso completo</span><h1>Seu jogo<br/><em>começa aqui.</em></h1><p>Do Básico ao Avançado. Aulas extras todos os dias. Entre com sua conta para treinar no seu ritmo.</p><div className="account-strike" aria-hidden="true"/></section>
      <section className="account-panel" aria-label="Sua conta">
        <div className="account-tabs" aria-label="Acesso"><button type="button" className={mode === "login" || mode === "forgot" || mode === "password" ? "selected" : ""} onClick={() => select("login")}>Entrar</button><button type="button" className={mode === "register" ? "selected" : ""} onClick={() => select("register")}>Criar conta</button></div>
        <h2>{mode === "register" ? "Crie sua conta." : mode === "forgot" ? "Recupere o acesso." : mode === "password" ? "Nova senha." : "Entre na sua conta."}</h2>
        {message && <p className="account-success" role="status">{message}</p>}
        {error && <p className="account-error" role="alert">{error}</p>}
        {mode === "forgot" ? <><p className="account-foot">Peça ao professor um link individual de redefinição. Ele pode gerar o link no painel do curso; o link vale por uma hora.</p><button type="button" className="account-minor" onClick={() => select("login")}>Voltar ao login</button></> : <form onSubmit={submit}>
          {mode !== "password" && <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="seu@email.com" /></label>}
          {mode === "register" && <><label>Celular<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(11) 99999-9999" /></label><label>CPF<input name="cpf" type="text" inputMode="numeric" autoComplete="off" required minLength={11} maxLength={14} placeholder="000.000.000-00" /></label></>}
          <label>{mode === "password" ? "Nova senha" : "Senha"}<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 12} maxLength={128} required placeholder={mode === "register" ? "Pelo menos 12 caracteres" : "Sua senha"} /></label>
          <button className="account-submit" type="submit" disabled={loading}>{loading ? "Aguarde..." : mode === "register" ? "Criar conta" : mode === "password" ? "Salvar nova senha" : "Entrar"}<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button>
        </form>}
        {mode === "login" && <button type="button" className="account-minor" onClick={() => select("forgot")}>Esqueci minha senha</button>}
        {mode === "register" && <p className="account-foot">Depois de criar a conta, conclua a compra para liberar as aulas.</p>}
      </section>
    </div>
  </main>;
}
