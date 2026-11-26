'use client';
import {useMemo, useState} from 'react';
import {AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Info, MapPin, Target, TrendingUp, Users, XCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Area, Listing, cities} from '@/lib/domain';
import {PRODUCT_TYPES, PROJECT_STATUS, Project, sanitize} from '@/lib/projects';
import {Draft, Rival, analyze, competitors, roomBand, verdict, viability} from '@/lib/project-analysis';

const n = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toLocaleString('pt-BR', {maximumFractionDigits: d}));
const money = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: d, minimumFractionDigits: d}));
const compact = (v: number | null | undefined) =>
  v == null ? '—' : Math.abs(v) >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' mi' : Math.abs(v) >= 1e3 ? 'R$ ' + (v / 1e3).toLocaleString('pt-BR', {maximumFractionDigits: 0}) + ' mil' : money(v);
const pct = (v: number | null | undefined, signed = false) => {
  if (v == null) return '—';
  const r = Math.round(v * 1000) / 10;
  return (signed && r > 0 ? '+' : '') + (r === 0 ? 0 : r).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%';
};
/** Aceita "650.000", "650000", "1,4" e "1.4". */
const num = (v: string) => {
  const s = v.trim();
  if (!s) return null;
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  const x = Number(norm);
  return Number.isFinite(x) && x > 0 ? x : null;
};
const asText = (v: number | null | undefined) => (v == null ? '' : Number.isInteger(v) && v >= 1000 ? v.toLocaleString('pt-BR') : String(v).replace('.', ','));
const brl = (v: number) => Math.round(v).toLocaleString('pt-BR');
const roomLabel = (b: number) => (b >= 4 ? '4+ dorm.' : b + ' dorm.');

const STEPS = [
  {id: 'onde', label: 'Onde', hint: 'Região do projeto'},
  {id: 'produto', label: 'Produto', hint: 'Tipologia e área'},
  {id: 'preco', label: 'Preço', hint: 'Posicionamento'},
  {id: 'viabilidade', label: 'Viabilidade', hint: 'VGV e margem'},
  {id: 'resumo', label: 'Resumo', hint: 'Parecer e salvar'},
] as const;

type Form = {
  nome: string; cidade: string; status: string; tipo: string; finalidade: 'venda' | 'aluguel';
  modo: 'bairro' | 'raio'; bairro: string; lat: number; lon: number; raio: string;
  quartos: number | null; area: string; preco: string; unidades: string;
  custoTerreno: string; custoObraM2: string; fatorConstruida: string; despesasPct: string; notas: string;
};

function fromProject(p: Project | null, city: string, area: Area): Form {
  return {
    nome: p?.nome ?? '', cidade: p?.cidade ?? city, status: p?.status ?? 'Prospecção', tipo: p?.tipo ?? 'apartamento', finalidade: p?.finalidade ?? 'venda',
    modo: p?.local.modo ?? 'bairro', bairro: p?.local.modo === 'bairro' ? p.local.bairro : '',
    lat: p?.local.modo === 'raio' ? p.local.lat : area.lat, lon: p?.local.modo === 'raio' ? p.local.lon : area.lon,
    raio: asText(p?.local.modo === 'raio' ? p.local.raio : area.radius),
    quartos: p?.quartos ?? null, area: asText(p?.area), preco: asText(p?.preco), unidades: asText(p?.unidades),
    custoTerreno: asText(p?.custoTerreno), custoObraM2: asText(p?.custoObraM2), fatorConstruida: asText(p?.fatorConstruida ?? 1.4), despesasPct: asText(p?.despesasPct ?? 15),
    notas: p?.notas ?? '',
  };
}

function toDraft(f: Form): Draft {
  const raio = num(f.raio) ?? 1.5;
  return {
    cidade: f.cidade, tipo: f.tipo, finalidade: f.finalidade,
    local: f.modo === 'raio' ? {modo: 'raio', lat: f.lat, lon: f.lon, raio, rotulo: 'Raio de ' + n(raio, 2) + ' km'} : {modo: 'bairro', bairro: f.bairro.trim()},
    quartos: f.quartos, area: num(f.area), preco: num(f.preco), unidades: num(f.unidades),
    custoTerreno: num(f.custoTerreno), custoObraM2: num(f.custoObraM2), fatorConstruida: num(f.fatorConstruida), despesasPct: num(f.despesasPct),
  };
}

type Props = {
  initial: Project | null;
  city: string;
  onCity: (city: string) => void;
  listings: Listing[];
  mesh: any;
  area: Area;
  rivals: Rival[];
  onCancel: () => void;
  onSave: (p: Project) => void;
};

export default function ProjectWizard({initial, city, onCity, listings, mesh, area, rivals, onCancel, onSave}: Props) {
  const [form, setForm] = useState<Form>(() => fromProject(initial, city, area));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));
  const bind = (key: keyof Form) => ({value: String(form[key] ?? ''), onChange: (e: any) => set(key, e.target.value)});

  const draft = useMemo(() => toDraft(form), [form]);
  const located = draft.local.modo === 'raio' || !!draft.local.bairro;
  const loaded = form.cidade === city;
  const a = useMemo(() => (loaded && located ? analyze(draft, listings, mesh) : null), [loaded, located, draft, listings, mesh]);
  const rivalsHere = useMemo(() => (located ? competitors(draft, rivals) : []), [located, draft, rivals]);
  const v = viability(draft);
  const signals = a ? verdict(draft, a, rivalsHere.length) : [];
  const bairros = useMemo(
    () => [...new Set<string>([...(mesh?.geojson?.features || []).map((f: any) => f.properties.nome || f.properties.name), ...listings.map((r) => r.bairro)].filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR')),
    [mesh, listings],
  );
  const isRent = form.finalidade === 'aluguel';
  const m2Digits = isRent ? 2 : 0;

  function changeCity(next: string) {
    const c = cities.find((x) => x.name === next)!;
    setForm((f) => ({...f, cidade: next, bairro: '', lat: c.lat, lon: c.lon}));
    if (next !== city) onCity(next);
  }
  function stepError(i: number) {
    if (i === 0) {
      if (!form.nome.trim()) return 'Dê um nome ao projeto.';
      if (form.modo === 'bairro' && !form.bairro.trim()) return 'Escolha o bairro ou use um raio no mapa.';
      if (form.modo === 'raio' && !(num(form.raio)! >= 0.1 && num(form.raio)! <= 30)) return 'O raio deve ficar entre 0,1 e 30 km.';
    }
    return '';
  }
  function go(target: number) {
    for (let i = 0; i < Math.min(target, STEPS.length); i++) {
      const e = stepError(i);
      if (e) { setError(e); setStep(i); return; }
    }
    setError('');
    setStep(target);
  }
  function save() {
    const e = stepError(0);
    if (e) { setError(e); setStep(0); return; }
    try {
      const project = sanitize({
        ...draft, id: initial?.id, criado: initial?.criado, atualizado: new Date().toISOString(),
        nome: form.nome, status: form.status, notas: form.notas,
        local: draft.local.modo === 'raio' ? {...draft.local, rotulo: 'Raio de ' + n(draft.local.raio, 2) + ' km'} : draft.local,
      });
      onSave(project);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Faixa de preço em R$ para a área informada
  const areaN = num(form.area);
  const band = a?.bandM2 && areaN ? {p10: a.bandM2.p10 * areaN, p25: a.bandM2.p25 * areaN, p50: a.bandM2.p50 * areaN, p75: a.bandM2.p75 * areaN, p90: a.bandM2.p90 * areaN} : null;
  const priceN = num(form.preco);
  const sliderMin = band ? Math.floor((band.p10 * 0.8) / 1000) * 1000 : 0;
  const sliderMax = band ? Math.ceil((band.p90 * 1.2) / 1000) * 1000 : 0;
  const markerPos = (value: number) => (band ? Math.min(100, Math.max(0, ((value - sliderMin) / (sliderMax - sliderMin)) * 100)) : 0);
  const step$ = STEPS[step].id;
  const selectedMix = a?.mix.find((m) => m.band === roomBand(form.quartos));

  const regionCard = (
    <aside className="wizard-insight">
      <span className="eyebrow">RAIO-X DA REGIÃO</span>
      {!located ? (
        <p className="small muted">Escolha um bairro ou um raio para ver o mercado da região aqui, ao vivo.</p>
      ) : !loaded ? (
        <p className="small muted">Carregando {form.cidade}…</p>
      ) : a ? (
        <>
          <h3>{draft.local.modo === 'bairro' ? draft.local.bairro : draft.local.rotulo} · {form.cidade}</h3>
          <dl className="insight-grid">
            <div><dt>Anúncios de venda</dt><dd>{n(a.saleCount)}</dd></div>
            <div><dt>Anúncios de aluguel</dt><dd>{n(a.rentCount)}</dd></div>
            <div><dt>R$/m² mediano</dt><dd>{money(a.regionM2, m2Digits)}</dd></div>
            <div><dt>vs. cidade</dt><dd className={a.regionM2 && a.cityM2 ? (a.regionM2 >= a.cityM2 ? 'up' : 'down') : ''}>{a.regionM2 && a.cityM2 ? pct(a.regionM2 / a.cityM2 - 1, true) : '—'}</dd></div>
            <div><dt>Ticket mediano</dt><dd>{compact(a.ticket)}</dd></div>
            <div><dt>Rentab. bruta</dt><dd>{a.yieldYear == null ? '—' : pct(a.yieldYear) + ' a.a.'}</dd></div>
            {a.population != null && <div className="wide"><dt><Users size={12} /> População · domicílios</dt><dd>{n(a.population)} · {n(a.homes)}</dd></div>}
            <div className="wide"><dt><Building2 size={12} /> Empreendimentos cadastrados</dt><dd>{n(rivalsHere.length)}</dd></div>
          </dl>
          {a.pool.length < 10 && <p className="insight-note"><AlertTriangle size={13} /> Amostra pequena: use os números como referência inicial.</p>}
          <p className="small muted">{a.typedOnly ? 'Mesmo tipo de produto' : 'Todos os tipos'} · {form.finalidade} · preços anunciados.</p>
        </>
      ) : null}
    </aside>
  );

  return (
    <div className="project-wizard">
      <div className="wizard-top">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft size={15} />Cancelar</Button>
        <div>
          <span className="eyebrow">{initial ? 'EDITAR PROJETO' : 'NOVO PROJETO'}</span>
          <h1>{form.nome.trim() || 'Projeto sem nome'}</h1>
        </div>
      </div>
      <ol className="wizard-steps" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : ''} onClick={() => go(i)}>
              <span className="dot">{i < step ? <Check size={13} /> : i + 1}</span>
              <span><strong>{s.label}</strong><small>{s.hint}</small></span>
            </button>
          </li>
        ))}
      </ol>
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="wizard-body">
        <section className="panel wizard-main">
          {step$ === 'onde' && (
            <>
              <h2>Onde fica o projeto?</h2>
              <p className="small muted">O Hub usa essa região para calcular preço, concorrência e perfil do entorno.</p>
              <label className="field">Nome do projeto<Input {...bind('nome')} placeholder="Ex.: Residencial Lago Igapó" autoFocus /></label>
              <label className="field">Cidade
                <select className="form-select" value={form.cidade} onChange={(e) => changeCity(e.target.value)}>
                  {cities.map((c) => <option key={c.code} value={c.name}>{c.name} · {c.uf}</option>)}
                </select>
              </label>
              <div className="segmented">
                <button type="button" aria-pressed={form.modo === 'bairro'} onClick={() => set('modo', 'bairro')}><MapPin size={14} />Bairro</button>
                <button type="button" aria-pressed={form.modo === 'raio'} onClick={() => set('modo', 'raio')}><Target size={14} />Raio no mapa</button>
              </div>
              {form.modo === 'bairro' ? (
                <label className="field">Bairro
                  <Input list="wizard-bairros" {...bind('bairro')} placeholder="Digite ou escolha o bairro" />
                  <datalist id="wizard-bairros">{loaded && bairros.map((b) => <option key={b} value={b} />)}</datalist>
                </label>
              ) : (
                <div className="raio-box">
                  <label className="field">Raio (km)<Input inputMode="decimal" {...bind('raio')} /></label>
                  <p className="small muted">Centro em {form.lat.toFixed(4)}, {form.lon.toFixed(4)}.</p>
                  <Button variant="outline" size="sm" disabled={!loaded} onClick={() => setForm((f) => ({...f, lat: area.lat, lon: area.lon, raio: asText(area.radius)}))}><Target size={14} />Usar o círculo atual do Mapa de mercado</Button>
                </div>
              )}
            </>
          )}

          {step$ === 'produto' && (
            <>
              <h2>Qual produto você quer lançar?</h2>
              <div className="form-row">
                <label className="field">Tipo<select className="form-select" {...bind('tipo')}>{PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
                <div className="field">Finalidade
                  <div className="segmented">
                    <button type="button" aria-pressed={form.finalidade === 'venda'} onClick={() => set('finalidade', 'venda')}>Venda</button>
                    <button type="button" aria-pressed={form.finalidade === 'aluguel'} onClick={() => set('finalidade', 'aluguel')}>Aluguel</button>
                  </div>
                </div>
              </div>
              <div className="field">Dormitórios
                <div className="room-picker">
                  {[1, 2, 3, 4].map((b) => (
                    <button key={b} type="button" aria-pressed={form.quartos === b} onClick={() => set('quartos', form.quartos === b ? null : b)}>
                      <strong>{b >= 4 ? '4+' : b}</strong><small>{a ? pct(a.mix.find((m) => m.band === b)!.share) + ' da oferta' : 'dorm.'}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">Área privativa (m²)<Input inputMode="decimal" {...bind('area')} placeholder="Ex.: 85" /></label>
              {selectedMix?.area != null && (
                <p className="hint-line"><Info size={14} />Área mediana de {roomLabel(selectedMix.band)} na região: <strong>{n(selectedMix.area)} m²</strong>
                  <Button variant="ghost" size="sm" onClick={() => set('area', asText(Math.round(selectedMix.area!)))}>Usar</Button></p>
              )}
            </>
          )}

          {step$ === 'preco' && (
            <>
              <h2>{isRent ? 'Qual o aluguel alvo?' : 'Qual o preço alvo por unidade?'}</h2>
              {!areaN && <p className="hint-line warn"><AlertTriangle size={14} />Informe a área na etapa Produto para ver a faixa de preço da região.</p>}
              <label className="field">{isRent ? 'Aluguel por mês (R$)' : 'Preço por unidade (R$)'}<Input inputMode="decimal" {...bind('preco')} placeholder={isRent ? 'Ex.: 3.500' : 'Ex.: 650.000'} /></label>
              {band ? (
                <>
                  <input className="price-slider" type="range" min={sliderMin} max={sliderMax} step={isRent ? 50 : 5000} value={priceN ?? band.p50} onChange={(e) => set('preco', brl(Number(e.target.value)))} aria-label="Ajustar preço" />
                  <div className="price-band" aria-hidden="true">
                    <i className="iqr" style={{left: markerPos(band.p25) + '%', width: markerPos(band.p75) - markerPos(band.p25) + '%'}} />
                    <i className="median" style={{left: markerPos(band.p50) + '%'}} />
                    {priceN != null && <b style={{left: markerPos(priceN) + '%'}}>Seu preço</b>}
                  </div>
                  <div className="band-legend">
                    <button type="button" onClick={() => set('preco', brl(Math.round(band.p25 / 1000) * 1000))}><small>Econômico (25%)</small><strong>{compact(band.p25)}</strong></button>
                    <button type="button" onClick={() => set('preco', brl(Math.round(band.p50 / 1000) * 1000))}><small>Mediana</small><strong>{compact(band.p50)}</strong></button>
                    <button type="button" onClick={() => set('preco', brl(Math.round(band.p75 / 1000) * 1000))}><small>Premium (75%)</small><strong>{compact(band.p75)}</strong></button>
                  </div>
                  <p className="small muted">Faixa calculada com {n(a!.bandM2!.n)} anúncios ({a!.bandM2!.level}) × {n(areaN)} m². Clique numa referência para usá-la.</p>
                  {a!.percentile != null && <p className="position-line">Seu R$/m² ({money(a!.projectM2, m2Digits)}) fica acima de <strong>{Math.round(a!.percentile * 100)}%</strong> dos comparáveis.</p>}
                </>
              ) : areaN ? <p className="small muted">Não há anúncios suficientes na região para montar uma faixa de preço. Amplie o raio ou escolha um bairro vizinho.</p> : null}
            </>
          )}

          {step$ === 'viabilidade' && (
            <>
              <h2>A conta fecha?</h2>
              <p className="small muted">Estimativa rápida. Para custo de obra, use o CUB do seu estado (Sinduscon) ajustado ao padrão de acabamento.</p>
              <div className="form-row">
                <label className="field">Unidades<Input inputMode="numeric" {...bind('unidades')} placeholder="Ex.: 96" /></label>
                <label className="field">Custo do terreno (R$)<Input inputMode="decimal" {...bind('custoTerreno')} placeholder="Ex.: 6.000.000" /></label>
              </div>
              <div className="form-row">
                <label className="field">Custo de obra (R$/m² construído)<Input inputMode="decimal" {...bind('custoObraM2')} placeholder="Ex.: 3.800" /></label>
                <label className="field">Área construída ÷ privativa<Input inputMode="decimal" {...bind('fatorConstruida')} placeholder="1,4" /></label>
              </div>
              {!isRent && <label className="field">Despesas (comercial, impostos, projetos) em % do VGV<Input inputMode="decimal" {...bind('despesasPct')} placeholder="15" /></label>}
              {v ? (
                <div className="viability-grid">
                  {v.kind === 'venda' ? (
                    <>
                      <div><span>VGV</span><strong>{compact(v.vgv)}</strong></div>
                      <div><span>Custo total</span><strong>{compact(v.cost)}</strong><small>{v.cost == null ? 'informe terreno e obra' : `obra ${compact(v.works)} · terreno ${compact(v.land)} · despesas ${compact(v.expenses)}`}</small></div>
                      <div><span>Resultado</span><strong className={v.profit == null ? '' : v.profit >= 0 ? 'down' : 'up'}>{compact(v.profit)}</strong></div>
                      <div><span>Margem sobre VGV</span><strong>{pct(v.margin)}</strong></div>
                    </>
                  ) : (
                    <>
                      <div><span>Receita anual</span><strong>{compact(v.annual)}</strong></div>
                      <div><span>Custo total</span><strong>{compact(v.cost)}</strong></div>
                      <div><span>Rendimento sobre custo</span><strong>{pct(v.yieldOnCost)}</strong><small>ao ano, bruto</small></div>
                      <div><span>Área construída</span><strong>{n(v.built)} m²</strong></div>
                    </>
                  )}
                </div>
              ) : <p className="hint-line"><Info size={14} />Informe área, preço e unidades para calcular.</p>}
            </>
          )}

          {step$ === 'resumo' && (
            <>
              <h2>Parecer do Hub</h2>
              <p className="small muted">Leitura automática a partir dos dados da região. Use como ponto de partida, não como decisão final.</p>
              {signals.length ? (
                <ul className="signal-list">
                  {signals.map((s, i) => (
                    <li key={i} className={'signal ' + s.tone}>
                      {s.tone === 'good' ? <CheckCircle2 size={17} /> : s.tone === 'risk' ? <XCircle size={17} /> : s.tone === 'warn' ? <AlertTriangle size={17} /> : <Info size={17} />}
                      <div><strong>{s.title}</strong><p>{s.detail}</p></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="small muted">Complete produto e preço para receber o parecer.</p>}
              <div className="summary-grid">
                <div><span>Região</span><strong>{draft.local.modo === 'bairro' ? draft.local.bairro : draft.local.rotulo} · {form.cidade}</strong></div>
                <div><span>Produto</span><strong>{[PRODUCT_TYPES.find((t) => t.value === form.tipo)?.label, form.quartos && roomLabel(form.quartos), areaN && n(areaN) + ' m²'].filter(Boolean).join(' · ') || '—'}</strong></div>
                <div><span>{isRent ? 'Aluguel' : 'Preço'}</span><strong>{priceN ? money(priceN) : '—'}{a?.projectM2 ? ' · ' + money(a.projectM2, m2Digits) + '/m²' : ''}</strong></div>
                <div><span>{isRent ? 'Receita anual' : 'VGV'}</span><strong>{v ? compact(v.kind === 'venda' ? v.vgv : v.annual) : '—'}</strong></div>
              </div>
              <div className="form-row">
                <label className="field">Etapa<select className="form-select" {...bind('status')}>{PROJECT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
              </div>
              <label className="field">Anotações<Textarea rows={3} {...bind('notas')} placeholder="Terreno, premissas, próximos passos…" /></label>
            </>
          )}
        </section>

        <div className="wizard-side">
          {regionCard}
          {step$ === 'produto' && a && (
            <aside className="wizard-insight">
              <span className="eyebrow">MIX DA REGIÃO</span>
              <div className="mini-mix">
                {a.mix.map((m) => (
                  <div key={m.band} className={m.band === roomBand(form.quartos) ? 'active' : ''}>
                    <span>{roomLabel(m.band)}</span>
                    <i><b style={{width: Math.max(2, m.share * 100) + '%'}} /></i>
                    <small>{n(m.count)} · {m.area ? n(m.area) + ' m²' : '—'} · {money(m.m2, m2Digits)}/m²</small>
                  </div>
                ))}
              </div>
            </aside>
          )}
          {step$ === 'preco' && a && a.comparables.length > 0 && (
            <aside className="wizard-insight">
              <span className="eyebrow">COMPARÁVEIS MAIS PRÓXIMOS</span>
              <ul className="comp-mini">
                {a.comparables.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <span>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.bairro || r.titulo}</a> : r.bairro || r.titulo}<small>{n(r.quartos)} dorm. · {n(r.area_m2)} m²</small></span>
                    <span><strong>{compact(r.preco)}</strong><small>{money(r.m2, m2Digits)}/m²</small></span>
                  </li>
                ))}
              </ul>
              <p className="small muted">{n(a.comparables.length)} anúncios com dormitórios e área parecidos.</p>
            </aside>
          )}
          {step$ === 'resumo' && rivalsHere.length > 0 && (
            <aside className="wizard-insight">
              <span className="eyebrow">CONCORRÊNCIA</span>
              <ul className="rival-list">{rivalsHere.slice(0, 5).map((r, i) => <li key={i}><strong>{r.name}</strong><small>{[r.builder, r.stage].filter(Boolean).join(' · ')}</small></li>)}</ul>
            </aside>
          )}
        </div>
      </div>

      <div className="wizard-footer">
        <Button variant="outline" disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft size={15} />Voltar</Button>
        <div className="wizard-footer-right">
          {step < STEPS.length - 1 && initial && <Button variant="ghost" onClick={save}>Salvar agora</Button>}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => go(step + 1)}>Próximo: {STEPS[step + 1].label}<ArrowRight size={15} /></Button>
          ) : (
            <Button onClick={save}><TrendingUp size={15} />{initial ? 'Salvar alterações' : 'Criar projeto'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
