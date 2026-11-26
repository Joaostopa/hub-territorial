'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowUpRight, Building2, Copy, Download, FolderKanban, MapPin, MapPinned, Pencil, Plus, Target, Trash2, Upload, Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Area, Listing, cities, distance, median} from '@/lib/domain';
import {Filter, matches} from '@/lib/market';
import {csvText, download} from '@/lib/browser';
import {PRODUCT_TYPES, PROJECT_STATUS, Project, loadProjects, sanitize, saveProjects} from '@/lib/projects';
import catalog from '@/lib/curitiba-projects.json';

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', {maximumFractionDigits: 0}));
const money = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: digits, minimumFractionDigits: digits});
const compact = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' mi' : v >= 1e3 ? 'R$ ' + (v / 1e3).toLocaleString('pt-BR', {maximumFractionDigits: 0}) + ' mil' : money(v);
const pct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toLocaleString('pt-BR', {maximumFractionDigits: 0}) + '%';
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const textKey = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const statusTone: Record<string, string> = {'Prospecção': 'tone-blue', 'Viabilidade': 'tone-amber', 'Aprovado': 'tone-green', 'Em lançamento': 'tone-teal', 'Arquivado': 'tone-gray'};

type Rival = {name: string; builder?: string; stage?: string; lat?: number; lon?: number; url?: string};
type Props = {
  city: string;
  onCity: (city: string) => void;
  listings: Listing[];
  mesh: any;
  area: Area;
  rivals: Rival[];
  onOpenMap: (p: Project) => void;
  onCount: (n: number) => void;
};

const emptyForm = (city: string, area: Area) => ({
  nome: '', cidade: city, status: 'Prospecção', tipo: 'apartamento', finalidade: 'venda',
  modo: 'bairro', bairro: '', lat: area.lat, lon: area.lon, raio: area.radius,
  quartos: '', area: '', preco: '', unidades: '', notas: '',
});

function baseFilter(p: Project, mesh: any): Filter {
  return {
    purpose: p.finalidade,
    scope: p.local.modo === 'bairro' ? 'neighborhood' : 'area',
    neighborhood: p.local.modo === 'bairro' ? p.local.bairro : '',
    area: p.local.modo === 'raio' ? {lat: p.local.lat, lon: p.local.lon, radius: p.local.raio} : {lat: 0, lon: 0, radius: 1},
    source: 'all', type: 'all', rooms: 0, minPrice: 0, maxPrice: 0, minArea: 0, maxArea: 0, stage: 'all',
    boundaries: mesh?.geojson?.features,
  };
}

/** Recorte de mercado de um projeto: anúncios da região, posição do preço alvo e comparáveis. */
function analyze(p: Project, listings: Listing[], mesh: any) {
  const f = baseFilter(p, mesh);
  const sameType = (r: Listing) => p.tipo === 'apartamento' ? r.tipo === 'apartamento' : p.tipo === 'casa' ? /casa|sobrado/.test(r.tipo) : p.tipo === 'terreno' ? /terreno|lote/.test(r.tipo) : /comercial|sala|loja/.test(r.tipo);
  const region = listings.filter((r) => matches(r, f));
  const typed = region.filter(sameType);
  const pool = typed.length >= 5 ? typed : region;
  const cityPool = listings.filter((r) => r.finalidade === p.finalidade && sameType(r));
  const m2 = (rows: Listing[]) => median(rows.filter((r) => r.area_m2).map((r) => r.preco / r.area_m2!));
  const regionM2 = m2(pool), cityM2 = m2(cityPool);
  const projectM2 = p.preco && p.area ? p.preco / p.area : null;
  const sortedM2 = pool.filter((r) => r.area_m2).map((r) => r.preco / r.area_m2!).sort((a, b) => a - b);
  const percentile = projectM2 != null && sortedM2.length >= 5 ? sortedM2.filter((v) => v <= projectM2).length / sortedM2.length : null;
  const comparables = pool
    .filter((r) => (p.quartos == null || (p.quartos >= 4 ? (r.quartos ?? 0) >= 4 : r.quartos === p.quartos)) && (p.area == null || (r.area_m2 != null && Math.abs(r.area_m2 / p.area - 1) <= 0.25)))
    .map((r) => ({...r, m2: r.area_m2 ? r.preco / r.area_m2 : null, gap: projectM2 && r.area_m2 ? r.preco / r.area_m2 / projectM2 - 1 : null}))
    .sort((a, b) => (a.area_m2 && p.area ? Math.abs(a.area_m2 - p.area) : 9e9) - (b.area_m2 && p.area ? Math.abs(b.area_m2 - p.area) : 9e9));
  const rent = listings.filter((r) => matches(r, {...f, purpose: 'aluguel'}) && sameType(r));
  const sale = listings.filter((r) => matches(r, {...f, purpose: 'venda'}) && sameType(r));
  const rentM2 = rent.filter((r) => r.area_m2).length >= 3 ? m2(rent) : null, saleM2 = sale.length >= 5 ? m2(sale) : null;
  let population: number | null = null, homes: number | null = null;
  if (p.local.modo === 'bairro') {
    const feature = mesh?.geojson?.features?.find((ft: any) => textKey(ft.properties.nome || ft.properties.name) === textKey((p.local as any).bairro));
    population = feature?.properties?.populacao ?? null;
    homes = feature?.properties?.domicilios ?? null;
  }
  return {
    region, pool, typedOnly: pool === typed, regionM2, cityM2, projectM2, percentile, comparables,
    ticket: median(pool.map((r) => r.preco)), areaMedian: median(pool.filter((r) => r.area_m2).map((r) => r.area_m2!)),
    yieldYear: rentM2 && saleM2 ? (rentM2 * 12) / saleM2 : null, population, homes,
  };
}

function competitors(p: Project, rivals: Rival[]) {
  const fromCatalog = (catalog as any[])
    .filter((c) => c.cidade === p.cidade && p.local.modo === 'bairro' && textKey(c.bairro) === textKey((p.local as any).bairro))
    .map((c) => ({name: c.nome, builder: c.construtora, stage: c.estagio, url: c.url, where: c.bairro}));
  const own = rivals
    .filter((r) => p.local.modo === 'raio' && r.lat != null && r.lon != null && distance(r.lat, r.lon, {lat: p.local.lat, lon: p.local.lon, radius: p.local.raio}) <= p.local.raio)
    .map((r) => ({name: r.name, builder: r.builder, stage: r.stage, url: r.url, where: 'Dentro do raio'}));
  return [...fromCatalog, ...own];
}

export default function ProjectWorkspace({city, onCity, listings, mesh, area, rivals, onOpenMap, onCount}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Project | null | 'new'>(null);
  const [form, setForm] = useState(() => emptyForm(city, area));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setProjects(loadProjects()); setReady(true); }, []);
  useEffect(() => { if (!ready) return; try { saveProjects(projects); } catch (e: any) { setError(e.message); } onCount(projects.filter((p) => p.status !== 'Arquivado').length); }, [projects, ready, onCount]);

  const bairros = useMemo(() => [...new Set<string>([...(mesh?.geojson?.features || []).map((f: any) => f.properties.nome || f.properties.name), ...listings.map((r) => r.bairro)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [mesh, listings]);
  const open = projects.find((p) => p.id === openId) || null;
  const visible = projects
    .filter((p) => (status === 'all' || p.status === status) && (cityFilter === 'all' || p.cidade === cityFilter))
    .sort((a, b) => b.atualizado.localeCompare(a.atualizado));
  const totals = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'Arquivado');
    return {active: active.length, vgv: active.reduce((s, p) => s + (p.preco && p.unidades ? p.preco * p.unidades : 0), 0), units: active.reduce((s, p) => s + (p.unidades || 0), 0), cities: new Set(active.map((p) => p.cidade)).size};
  }, [projects]);

  function startNew() {
    setForm(emptyForm(city, area));
    setError('');
    setEditing('new');
  }
  function startEdit(p: Project) {
    setForm({
      nome: p.nome, cidade: p.cidade, status: p.status, tipo: p.tipo, finalidade: p.finalidade,
      modo: p.local.modo, bairro: p.local.modo === 'bairro' ? p.local.bairro : '',
      lat: p.local.modo === 'raio' ? p.local.lat : area.lat, lon: p.local.modo === 'raio' ? p.local.lon : area.lon, raio: p.local.modo === 'raio' ? p.local.raio : area.radius,
      quartos: p.quartos?.toString() || '', area: p.area?.toString() || '', preco: p.preco?.toString() || '', unidades: p.unidades?.toString() || '', notas: p.notas,
    });
    setError('');
    setEditing(p);
  }
  function submit() {
    try {
      const prev = editing && editing !== 'new' ? editing : null;
      const project = sanitize({
        ...form,
        id: prev?.id,
        criado: prev?.criado,
        atualizado: new Date().toISOString(),
        local: form.modo === 'raio' ? {modo: 'raio', lat: form.lat, lon: form.lon, raio: form.raio, rotulo: 'Raio de ' + Number(form.raio).toLocaleString('pt-BR') + ' km'} : {modo: 'bairro', bairro: form.bairro},
      });
      setProjects((list) => (prev ? list.map((p) => (p.id === prev.id ? project : p)) : [project, ...list]));
      setEditing(null);
      setOpenId(project.id);
      if (project.cidade !== city) onCity(project.cidade);
    } catch (e: any) {
      setError(e.message);
    }
  }
  function openProject(p: Project) {
    if (p.cidade !== city) onCity(p.cidade);
    setOpenId(p.id);
  }
  function duplicate(p: Project) {
    const copy = sanitize({...p, id: undefined, nome: p.nome + ' (cópia)', criado: undefined, atualizado: undefined});
    setProjects((list) => [copy, ...list]);
    setOpenId(copy.id);
  }
  function remove(p: Project) {
    if (!confirm('Excluir o projeto "' + p.nome + '"? Essa ação não pode ser desfeita.')) return;
    setProjects((list) => list.filter((x) => x.id !== p.id));
    setOpenId(null);
  }
  async function importFile(file: File) {
    try {
      if (file.size > 2_000_000) throw Error('Arquivo grande demais (máximo 2 MB).');
      const raw = JSON.parse(await file.text());
      const incoming = (Array.isArray(raw) ? raw : raw?.projetos || []).map(sanitize);
      if (!incoming.length) throw Error('Nenhum projeto encontrado no arquivo.');
      setProjects((list) => {
        const map = new Map(list.map((p) => [p.id, p]));
        incoming.forEach((p: Project) => map.set(p.id, p));
        return [...map.values()];
      });
      setError('');
    } catch (e: any) {
      setError('Importação recusada: ' + e.message);
    }
  }

  const form$ = (key: keyof ReturnType<typeof emptyForm>) => ({value: String(form[key] ?? ''), onChange: (e: any) => setForm((f) => ({...f, [key]: e.target.value}))});
  const editor = (
    <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="project-dialog">
        <DialogHeader>
          <DialogTitle>{editing === 'new' ? 'Novo projeto' : 'Editar projeto'}</DialogTitle>
          <DialogDescription>Defina onde fica o projeto e qual produto você pretende lançar. O mercado da região é calculado automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="project-form">
          <label className="field span-2">Nome do projeto<Input {...form$('nome')} placeholder="Ex.: Residencial Lago Igapó" autoFocus /></label>
          <label className="field">Cidade<select className="form-select" {...form$('cidade')}>{cities.map((c) => <option key={c.code} value={c.name}>{c.name} · {c.uf}</option>)}</select></label>
          <label className="field">Etapa<select className="form-select" {...form$('status')}>{PROJECT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field">Produto<select className="form-select" {...form$('tipo')}>{PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <label className="field">Finalidade<select className="form-select" {...form$('finalidade')}><option value="venda">Venda</option><option value="aluguel">Aluguel</option></select></label>
          <fieldset className="span-2 location-choice">
            <legend>Localização</legend>
            <div className="segmented">
              <button type="button" aria-pressed={form.modo === 'bairro'} onClick={() => setForm((f) => ({...f, modo: 'bairro'}))}><MapPin size={14} />Bairro</button>
              <button type="button" aria-pressed={form.modo === 'raio'} onClick={() => setForm((f) => ({...f, modo: 'raio', lat: area.lat, lon: area.lon, raio: area.radius}))}><Target size={14} />Área atual do mapa</button>
            </div>
            {form.modo === 'bairro' ? (
              <>
                <Input list="project-bairros" {...form$('bairro')} placeholder={form.cidade === city ? 'Digite ou escolha o bairro' : 'Digite o bairro'} />
                <datalist id="project-bairros">{form.cidade === city && bairros.map((b) => <option key={b} value={b} />)}</datalist>
              </>
            ) : (
              <p className="small muted">Usa o círculo selecionado no Mapa de mercado: raio de {Number(form.raio).toLocaleString('pt-BR')} km em {Number(form.lat).toFixed(4)}, {Number(form.lon).toFixed(4)}. Para mudar, ajuste o círculo no mapa e edite o projeto.</p>
            )}
          </fieldset>
          <label className="field">Dormitórios<Input inputMode="numeric" {...form$('quartos')} placeholder="Ex.: 3" /></label>
          <label className="field">Área privativa (m²)<Input inputMode="decimal" {...form$('area')} placeholder="Ex.: 85" /></label>
          <label className="field">{form.finalidade === 'aluguel' ? 'Aluguel alvo (R$/mês)' : 'Preço alvo por unidade (R$)'}<Input inputMode="decimal" {...form$('preco')} placeholder={form.finalidade === 'aluguel' ? 'Ex.: 3500' : 'Ex.: 650000'} /></label>
          <label className="field">Unidades<Input inputMode="numeric" {...form$('unidades')} placeholder="Ex.: 120" /></label>
          <label className="field span-2">Anotações<Textarea rows={3} {...form$('notas')} placeholder="Terreno, premissas, próximos passos…" /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button onClick={submit}>{editing === 'new' ? 'Criar projeto' : 'Salvar alterações'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (open) {
    const loaded = open.cidade === city;
    const a = loaded ? analyze(open, listings, mesh) : null;
    const rivalsHere = competitors(open, rivals);
    const vgv = open.preco && open.unidades && open.finalidade === 'venda' ? open.preco * open.unidades : null;
    const gap = a?.projectM2 && a.regionM2 ? a.projectM2 / a.regionM2 - 1 : null;
    const where = open.local.modo === 'bairro' ? open.local.bairro : open.local.rotulo;
    return (
      <div className="project-detail">
        {editor}
        <Button variant="ghost" size="sm" className="back-link" onClick={() => setOpenId(null)}><ArrowLeft size={15} />Todos os projetos</Button>
        <section className="project-hero">
          <div>
            <span className={'status-badge ' + statusTone[open.status]}>{open.status}</span>
            <h1>{open.nome}</h1>
            <p>{open.cidade} · {where} · {PRODUCT_TYPES.find((t) => t.value === open.tipo)?.label} para {open.finalidade}{open.quartos ? ' · ' + open.quartos + ' dorm.' : ''}{open.area ? ' · ' + n(open.area) + ' m²' : ''}</p>
          </div>
          <div className="project-actions">
            <Button variant="outline" size="sm" onClick={() => onOpenMap(open)}><MapPinned size={15} />Ver no mapa</Button>
            <Button variant="outline" size="sm" onClick={() => startEdit(open)}><Pencil size={15} />Editar</Button>
            <Button variant="outline" size="sm" onClick={() => duplicate(open)}><Copy size={15} />Duplicar</Button>
            <Button variant="ghost" size="sm" onClick={() => remove(open)} aria-label="Excluir projeto"><Trash2 size={15} /></Button>
          </div>
        </section>
        {!a ? (
          <div className="pulse-empty"><MapPin size={24} /><div><h3>Carregando {open.cidade}…</h3><p>Os dados de mercado aparecem quando a cidade termina de carregar.</p></div></div>
        ) : (
          <>
            <div className="market-stats executive-kpis project-kpis">
              <div className="market-stat"><span>Oferta na região</span><strong>{n(a.pool.length)}</strong><small>{a.typedOnly ? 'mesmo tipo de produto' : 'todos os tipos (amostra pequena do produto)'} · {open.finalidade}</small></div>
              <div className="market-stat"><span>R$/m² da região</span><strong>{money(a.regionM2, open.finalidade === 'aluguel' ? 2 : 0)}</strong><small>mediana anunciada · cidade {money(a.cityM2, open.finalidade === 'aluguel' ? 2 : 0)}</small></div>
              <div className="market-stat"><span>R$/m² do projeto</span><strong>{money(a.projectM2, open.finalidade === 'aluguel' ? 2 : 0)}</strong><small>{gap == null ? 'informe preço e área' : pct(gap) + ' vs. mediana da região'}</small></div>
              <div className="market-stat"><span>{vgv != null ? 'VGV estimado' : 'Unidades'}</span><strong>{vgv != null ? compact(vgv) : n(open.unidades)}</strong><small>{vgv != null ? n(open.unidades) + ' unidades × ' + compact(open.preco) : 'informe preço e unidades para o VGV'}</small></div>
            </div>
            {a.percentile != null && (
              <section className="panel position-panel">
                <div className="panel-heading"><div><span className="eyebrow">POSICIONAMENTO DE PREÇO</span><h2>Onde o projeto se encaixa na oferta da região</h2></div></div>
                <div className="position-track" aria-label={'Projeto no percentil ' + Math.round(a.percentile * 100)}>
                  <span className="zone">Mais barato</span><span className="zone">Faixa central</span><span className="zone">Mais caro</span>
                  <i style={{left: Math.min(98, Math.max(2, a.percentile * 100)) + '%'}}><b>Seu projeto</b></i>
                </div>
                <p className="small muted">O R$/m² do projeto fica acima de {Math.round(a.percentile * 100)}% dos anúncios comparáveis da região ({n(a.pool.filter((r) => r.area_m2).length)} com área). Preços pedidos, não valores de venda.</p>
              </section>
            )}
            <div className="overview-columns project-columns">
              <section className="panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">COMPARÁVEIS</span><h2>Anúncios parecidos na região</h2><p className="small muted">{open.quartos ? (open.quartos >= 4 ? '4+ dorm.' : open.quartos + ' dorm.') : 'Qualquer nº de dormitórios'}{open.area ? ' · área entre ' + n(open.area * 0.75) + ' e ' + n(open.area * 1.25) + ' m²' : ''}</p></div>
                  <Button variant="outline" size="sm" disabled={!a.comparables.length} onClick={() => download('comparaveis-' + open.nome + '.csv', csvText(a.comparables.map((r) => ({titulo: r.titulo, bairro: r.bairro, quartos: r.quartos, area_m2: r.area_m2, preco: r.preco, preco_m2: r.m2 && Math.round(r.m2), fonte: r.fonte, url: r.url, coletado: r.data_coleta}))), 'text/csv;charset=utf-8')}><Download size={14} />CSV</Button>
                </div>
                {a.comparables.length ? (
                  <div className="radar-scroll">
                    <table className="radar-table comps-table">
                      <thead><tr><th>Anúncio</th><th>Dorm.</th><th>Área</th><th>Preço</th><th>R$/m²</th><th>vs. projeto</th></tr></thead>
                      <tbody>
                        {a.comparables.slice(0, 12).map((r) => (
                          <tr key={r.id}>
                            <th scope="row"><span>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.bairro || r.titulo}</a> : r.bairro || r.titulo}</span><small>{r.fonte}</small></th>
                            <td>{n(r.quartos)}</td><td>{r.area_m2 ? n(r.area_m2) + ' m²' : '—'}</td><td>{money(r.preco)}</td><td>{money(r.m2, open.finalidade === 'aluguel' ? 2 : 0)}</td>
                            <td className={r.gap == null ? '' : r.gap >= 0 ? 'up' : 'down'}>{r.gap == null ? '—' : pct(r.gap)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="empty-chart">Nenhum anúncio com dormitórios e área parecidos nesta região. Amplie o raio ou revise o produto.</p>}
                {a.comparables.length > 12 && <p className="small muted">Mostrando 12 de {n(a.comparables.length)}. O CSV traz todos.</p>}
              </section>
              <div className="project-side">
                <section className="panel">
                  <span className="eyebrow">MERCADO DA REGIÃO</span>
                  <dl className="project-facts">
                    <div><dt>Ticket mediano</dt><dd>{money(a.ticket)}</dd></div>
                    <div><dt>Área mediana</dt><dd>{a.areaMedian ? n(a.areaMedian) + ' m²' : '—'}</dd></div>
                    <div><dt>Rentabilidade bruta anunciada</dt><dd>{a.yieldYear == null ? 'amostra insuficiente' : (a.yieldYear * 100).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '% a.a.'}</dd></div>
                    {a.population != null && <div><dt><Users size={13} /> População do bairro</dt><dd>{n(a.population)} · {n(a.homes)} domicílios</dd></div>}
                  </dl>
                  <p className="small muted">{a.population != null ? 'Censo IBGE 2022.' : ''} Anúncios observados, não transações.</p>
                </section>
                <section className="panel">
                  <span className="eyebrow">CONCORRÊNCIA</span>
                  <h2><Building2 size={16} /> Empreendimentos na região</h2>
                  {rivalsHere.length ? (
                    <ul className="rival-list">{rivalsHere.slice(0, 8).map((r, i) => <li key={i}><strong>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}</strong><small>{[r.builder, r.stage, r.where].filter(Boolean).join(' · ')}</small></li>)}</ul>
                  ) : <p className="small muted">Nenhum empreendimento cadastrado nesta região. Cadastre concorrentes em “Concorrência” para vê-los aqui.</p>}
                </section>
              </div>
            </div>
          </>
        )}
        {open.notas && <section className="panel"><span className="eyebrow">ANOTAÇÕES</span><p className="project-notes">{open.notas}</p></section>}
        <p className="small muted">Criado em {day(open.criado)} · atualizado em {day(open.atualizado)} · salvo neste navegador.</p>
      </div>
    );
  }

  return (
    <div className="project-workspace">
      {editor}
      <section className="section-heading">
        <div><div className="eyebrow">SEUS ESTUDOS</div><h1>Projetos</h1><p className="muted">Cadastre terrenos e produtos em estudo e veja, para cada um, o mercado da região, os comparáveis e a concorrência.</p></div>
        <div className="actions">
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload size={15} />Importar</Button>
          <Button variant="outline" disabled={!projects.length} onClick={() => download('projetos-hub-territorial.json', JSON.stringify({version: 1, exportado: new Date().toISOString(), projetos: projects}, null, 2), 'application/json')}><Download size={15} />Exportar</Button>
          <Button onClick={startNew}><Plus size={16} />Novo projeto</Button>
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {projects.length ? (
        <>
          <div className="portfolio-strip">
            <div><span>Projetos ativos</span><strong>{n(totals.active)}</strong></div>
            <div><span>Unidades</span><strong>{n(totals.units)}</strong></div>
            <div><span>VGV somado</span><strong>{compact(totals.vgv || null)}</strong></div>
            <div><span>Cidades</span><strong>{n(totals.cities)}</strong></div>
          </div>
          <div className="project-filters">
            <div className="chip-row" role="group" aria-label="Filtrar por etapa">
              {['all', ...PROJECT_STATUS].map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'Todas as etapas' : s}<small>{s === 'all' ? projects.length : projects.filter((p) => p.status === s).length}</small></button>)}
            </div>
            <select className="form-select" aria-label="Filtrar por cidade" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
              <option value="all">Todas as cidades</option>
              {[...new Set(projects.map((p) => p.cidade))].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="project-grid">
            {visible.map((p) => {
              const a = p.cidade === city ? analyze(p, listings, mesh) : null;
              const gap = a?.projectM2 && a.regionM2 ? a.projectM2 / a.regionM2 - 1 : null;
              return (
                <button type="button" className="project-card" key={p.id} onClick={() => openProject(p)}>
                  <div className="project-card-top"><span className={'status-badge ' + statusTone[p.status]}>{p.status}</span><ArrowUpRight size={16} /></div>
                  <h3>{p.nome}</h3>
                  <p className="project-where"><MapPin size={13} />{p.cidade} · {p.local.modo === 'bairro' ? p.local.bairro : p.local.rotulo}</p>
                  <p className="project-product">{[PRODUCT_TYPES.find((t) => t.value === p.tipo)?.label, p.quartos && p.quartos + ' dorm.', p.area && n(p.area) + ' m²', p.preco && compact(p.preco)].filter(Boolean).join(' · ')}</p>
                  <div className="project-card-foot">
                    {gap != null ? <span className={'gap-chip ' + (gap >= 0 ? 'up' : 'down')}>{pct(gap)} vs. R$/m² da região</span> : <span className="muted small">{a ? n(a.pool.length) + ' anúncios na região' : 'Abra para analisar'}</span>}
                    <small>{day(p.atualizado)}</small>
                  </div>
                </button>
              );
            })}
          </div>
          {!visible.length && <p className="empty-chart">Nenhum projeto com esses filtros.</p>}
        </>
      ) : (
        <div className="projects-empty">
          <FolderKanban size={34} />
          <h2>Comece seu primeiro projeto</h2>
          <p>Informe a cidade, o bairro (ou um raio no mapa) e o produto: dormitórios, área e preço alvo. O Hub calcula o R$/m² da região, a posição do seu preço, os anúncios comparáveis e os concorrentes próximos.</p>
          <Button onClick={startNew}><Plus size={16} />Novo projeto</Button>
        </div>
      )}
      <p className="small muted">Projetos ficam salvos neste navegador. Use Exportar para fazer backup ou compartilhar, e Importar para abrir em outro computador.</p>
    </div>
  );
}
