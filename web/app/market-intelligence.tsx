'use client';
import {useMemo, useState} from 'react';
import {ArrowDown, ArrowUp, ArrowUpRight, CalendarClock, Download, Home, KeyRound, Percent, Search, TrendingUp} from 'lucide-react';
import {Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Listing, median} from '@/lib/domain';
import {Batch, Exit, periodKey} from '@/lib/market';
import {csvText, download} from '@/lib/browser';

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', {maximumFractionDigits: 0}));
const money = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: digits, minimumFractionDigits: digits});
const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : (v * 100).toLocaleString('pt-BR', {maximumFractionDigits: digits, minimumFractionDigits: digits}) + '%';
const perM2 = (rows: Listing[]) => median(rows.filter((r) => r.area_m2).map((r) => r.preco / r.area_m2!));
const weekLabel = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', timeZone: 'UTC'});

/** Amostras mínimas para publicar um indicador por bairro. */
const MIN_SALE = 5;
const MIN_RENT = 3;

type Row = {
  name: string;
  sale: number;
  rent: number;
  saleM2: number | null;
  rentM2: number | null;
  ticket: number | null;
  area: number | null;
  yieldYear: number | null;
  vsCity: number | null;
};
type SortKey = keyof Omit<Row, 'name'> | 'name';

export function PurposeSplit({sale, rent}: {sale: Listing[]; rent: Listing[]}) {
  const saleM2 = perM2(sale);
  const rentM2 = perM2(rent);
  const yieldYear = saleM2 && rentM2 && sale.length >= MIN_SALE && rent.filter((r) => r.area_m2).length >= MIN_RENT ? (rentM2 * 12) / saleM2 : null;
  return (
    <section className="purpose-split" aria-label="Venda e aluguel lado a lado">
      <div className="split-card sale">
        <div className="split-icon"><Home size={18} /></div>
        <div>
          <span>Venda</span>
          <strong>{n(sale.length)} anúncios</strong>
          <small>{money(median(sale.map((r) => r.preco)))} mediano · {money(saleM2)}/m²</small>
        </div>
      </div>
      <div className="split-card rent">
        <div className="split-icon"><KeyRound size={18} /></div>
        <div>
          <span>Aluguel</span>
          <strong>{n(rent.length)} anúncios</strong>
          <small>{money(median(rent.map((r) => r.preco)))}/mês · {money(rentM2, 2)}/m²</small>
        </div>
      </div>
      <div className="split-card yield">
        <div className="split-icon"><Percent size={18} /></div>
        <div>
          <span>Rentabilidade bruta anunciada</span>
          <strong>{yieldYear == null ? 'Amostra insuficiente' : pct(yieldYear) + ' ao ano'}</strong>
          <small>Aluguel/m² × 12 ÷ venda/m² · preços pedidos</small>
        </div>
      </div>
    </section>
  );
}

export function NeighborhoodRadar({sale, rent, city, onNeighborhood, canOpen}: {sale: Listing[]; rent: Listing[]; city: string; onNeighborhood: (name: string) => void; canOpen: (name: string) => boolean}) {
  const [sort, setSort] = useState<{key: SortKey; desc: boolean}>({key: 'sale', desc: true});
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const cityM2 = perM2(sale);
    const groups = new Map<string, {sale: Listing[]; rent: Listing[]}>();
    const add = (r: Listing, k: 'sale' | 'rent') => {
      const name = r.bairro || 'Bairro não informado';
      const g = groups.get(name) || {sale: [], rent: []};
      g[k].push(r);
      groups.set(name, g);
    };
    sale.forEach((r) => add(r, 'sale'));
    rent.forEach((r) => add(r, 'rent'));
    return [...groups].map(([name, g]): Row => {
      const saleM2 = g.sale.length >= MIN_SALE ? perM2(g.sale) : null;
      const rentAreas = g.rent.filter((r) => r.area_m2).length;
      const rentM2 = rentAreas >= MIN_RENT ? perM2(g.rent) : null;
      return {
        name,
        sale: g.sale.length,
        rent: g.rent.length,
        saleM2,
        rentM2,
        ticket: g.sale.length >= MIN_SALE ? median(g.sale.map((r) => r.preco)) : null,
        area: g.sale.length >= MIN_SALE ? median(g.sale.filter((r) => r.area_m2).map((r) => r.area_m2!)) : null,
        yieldYear: saleM2 && rentM2 ? (rentM2 * 12) / saleM2 : null,
        vsCity: saleM2 && cityM2 ? saleM2 / cityM2 - 1 : null,
      };
    });
  }, [sale, rent]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number)) * dir;
    });
  }, [rows, sort, query]);
  const maxSale = Math.max(1, ...rows.map((r) => r.sale));
  const shownRows = all || query ? visible : visible.slice(0, 12);
  const header = (key: SortKey, label: string, title?: string) => (
    <th aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} title={title}>
      <button type="button" onClick={() => setSort((s) => ({key, desc: s.key === key ? !s.desc : key !== 'name'}))}>
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );
  return (
    <section className="panel radar-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">RADAR DE BAIRROS</span>
          <h2>Preço, oferta e rentabilidade por bairro</h2>
          <p className="small muted">Clique nos títulos para ordenar. Indicadores aparecem com pelo menos {MIN_SALE} anúncios de venda ou {MIN_RENT} de aluguel com área.</p>
        </div>
        <div className="radar-tools">
          <label className="radar-search"><Search size={15} /><Input aria-label="Buscar bairro" placeholder="Buscar bairro" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => download('radar-bairros-' + city + '.csv', csvText(visible.map((r) => ({bairro: r.name, anuncios_venda: r.sale, anuncios_aluguel: r.rent, venda_m2_mediana: r.saleM2, aluguel_m2_mediana: r.rentM2, ticket_mediano: r.ticket, area_mediana: r.area, rentabilidade_bruta_anual: r.yieldYear, diferenca_vs_cidade: r.vsCity}))), 'text/csv;charset=utf-8')}>
            <Download size={14} />CSV
          </Button>
        </div>
      </div>
      <div className="radar-scroll">
        <table className="radar-table">
          <thead>
            <tr>
              {header('name', 'Bairro')}
              {header('sale', 'Oferta venda')}
              {header('saleM2', 'Venda R$/m²')}
              {header('vsCity', 'vs. cidade', 'Diferença do R$/m² de venda em relação à mediana da seleção')}
              {header('ticket', 'Ticket mediano')}
              {header('area', 'Área mediana')}
              {header('rent', 'Oferta aluguel')}
              {header('rentM2', 'Aluguel R$/m²')}
              {header('yieldYear', 'Rentab. bruta', 'Aluguel/m² × 12 ÷ venda/m²; preços anunciados')}
              <th aria-label="Abrir no mapa" />
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.name}>
                <th scope="row">
                  <span>{r.name}</span>
                  <i className="radar-bar" style={{width: (100 * r.sale) / maxSale + '%'}} />
                </th>
                <td>{n(r.sale)}</td>
                <td>{money(r.saleM2)}</td>
                <td className={r.vsCity == null ? '' : r.vsCity >= 0 ? 'up' : 'down'}>{r.vsCity == null ? '—' : (r.vsCity >= 0 ? '+' : '') + pct(r.vsCity, 0)}</td>
                <td>{money(r.ticket)}</td>
                <td>{r.area == null ? '—' : n(r.area) + ' m²'}</td>
                <td>{n(r.rent)}</td>
                <td>{money(r.rentM2, 2)}</td>
                <td>{r.yieldYear == null ? '—' : <span className="yield-chip">{pct(r.yieldYear)}</span>}</td>
                <td>
                  <Button variant="ghost" size="icon" aria-label={'Abrir ' + r.name + ' no mapa'} disabled={!canOpen(r.name)} onClick={() => onNeighborhood(r.name)}>
                    <ArrowUpRight size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty-chart">Os bairros aparecem conforme a cobertura da base e dos filtros.</p>}
      </div>
      {!query && visible.length > 12 && (
        <Button variant="ghost" size="sm" className="radar-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Mostrar só os 12 primeiros' : 'Ver os ' + visible.length + ' bairros'}
        </Button>
      )}
      <p className="small muted">Preços pedidos nos anúncios, não valores de transação. A rentabilidade compara medianas de imóveis diferentes e serve como sinal de triagem.</p>
    </section>
  );
}

export function WeeklyPulse({exits, batches, onTab}: {exits: Exit[]; batches: Batch[]; onTab: (v: string) => void}) {
  const data = useMemo(() => {
    const weeks = new Map<string, {week: string; vendas: number; locacoes: number}>();
    for (const e of exits) {
      if (e.reversed) continue;
      const key = periodKey(e.detected, true);
      const w = weeks.get(key) || {week: key, vendas: 0, locacoes: 0};
      if (e.finalidade === 'venda') w.vendas++;
      else w.locacoes++;
      weeks.set(key, w);
    }
    return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-12).map((w) => ({...w, label: weekLabel(w.week)}));
  }, [exits]);
  const complete = batches.filter((b) => b.complete);
  const dates = [...new Set(batches.map((b) => b.observed.slice(0, 10)))].sort();
  const last = data[data.length - 1];
  return (
    <section className="panel pulse-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">MOVIMENTO SEMANAL</span>
          <h2>Vendas e locações estimadas por semana</h2>
          <p className="small muted">Um anúncio que some de uma coleta completa do mesmo recorte conta como saída. Se ele voltar a aparecer, a contagem é revertida.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onTab('dashboard')}><TrendingUp size={14} />Evolução completa</Button>
      </div>
      {data.length ? (
        <>
          <div className="pulse-kpis">
            <div><span>Última semana</span><strong>{n(last.vendas)}</strong><small>vendas estimadas</small></div>
            <div><span>Última semana</span><strong>{n(last.locacoes)}</strong><small>locações estimadas</small></div>
            <div><span>Coletas completas</span><strong>{n(complete.length)}</strong><small>base da estimativa</small></div>
          </div>
          <div className="pulse-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} margin={{top: 8, right: 8, left: -18, bottom: 0}}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip cursor={{fill: 'var(--muted)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: 12}} />
                <Bar dataKey="vendas" name="Vendas estimadas" fill="var(--chart-sale)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="locacoes" name="Locações estimadas" fill="var(--chart-rent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="pulse-empty">
          <CalendarClock size={26} />
          <div>
            <h3>Ainda não há coletas suficientes para medir o giro semanal</h3>
            <p>
              Hoje a base tem {n(batches.length)} lote(s) de coleta{dates.length ? ' (' + dates.map((d) => new Date(d + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'})).join(', ') + ')' : ''}, sendo {n(complete.length)} completo(s).
              A estimativa começa a partir da segunda coleta completa do mesmo recorte.
            </p>
            <ol>
              <li>Coletar venda e aluguel toda semana, sempre com a mesma busca (cidade, tipo, portais).</li>
              <li>Marcar como completa só a coleta que terminou sem cortes.</li>
              <li>Publicar o novo lote em <code>historico.json</code>.</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

const DAY = 86400000;
const share = (part: number, total: number) => (total ? ((100 * part) / total).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%' : '—');

export function TypologyMix({rows, purpose}: {rows: Listing[]; purpose: string}) {
  const groups = useMemo(() => {
    const defs = [
      {key: '1', label: '1 dorm.', test: (q: number) => q === 1},
      {key: '2', label: '2 dorm.', test: (q: number) => q === 2},
      {key: '3', label: '3 dorm.', test: (q: number) => q === 3},
      {key: '4', label: '4+ dorm.', test: (q: number) => q >= 4},
    ];
    const known = rows.filter((r) => r.quartos != null && r.quartos > 0);
    return {
      known: known.length,
      list: defs.map((d) => {
        const items = known.filter((r) => d.test(r.quartos!));
        return {
          ...d,
          count: items.length,
          ticket: items.length >= MIN_SALE ? median(items.map((r) => r.preco)) : null,
          m2: items.length >= MIN_SALE ? perM2(items) : null,
          area: items.length >= MIN_SALE ? median(items.filter((r) => r.area_m2).map((r) => r.area_m2!)) : null,
        };
      }),
    };
  }, [rows]);
  const max = Math.max(1, ...groups.list.map((g) => g.count));
  return (
    <section className="panel mix-panel">
      <span className="eyebrow">MIX DE PRODUTO</span>
      <h2>Oferta por número de dormitórios</h2>
      <p className="small muted">{purpose === 'aluguel' ? 'Aluguel mensal' : 'Venda'} · {n(groups.known)} anúncios com dormitórios informados</p>
      <div className="mix-list">
        {groups.list.map((g) => (
          <div key={g.key} className="mix-row">
            <div className="mix-label"><strong>{g.label}</strong><small>{share(g.count, groups.known)}</small></div>
            <div className="mix-bar"><i style={{width: (100 * g.count) / max + '%'}} /><span>{n(g.count)}</span></div>
            <dl>
              <div><dt>Ticket</dt><dd>{money(g.ticket)}</dd></div>
              <div><dt>R$/m²</dt><dd>{money(g.m2, purpose === 'aluguel' ? 2 : 0)}</dd></div>
              <div><dt>Área</dt><dd>{g.area == null ? '—' : n(g.area) + ' m²'}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <p className="small muted">Indicadores com pelo menos {MIN_SALE} anúncios por faixa.</p>
    </section>
  );
}

export function ListingAge({rows}: {rows: Listing[]}) {
  const stats = useMemo(() => {
    const ages = rows
      .filter((r) => r.publicado)
      .map((r) => Math.max(0, (new Date(r.data_coleta).getTime() - new Date(r.publicado!).getTime()) / DAY));
    const buckets = [
      {label: 'Até 30 dias', min: 0, max: 30, color: '#14806f'},
      {label: '31 a 90 dias', min: 30, max: 90, color: '#5cc0a8'},
      {label: '91 a 180 dias', min: 90, max: 180, color: '#e8c36a'},
      {label: '181 dias a 1 ano', min: 180, max: 365, color: '#df8f45'},
      {label: 'Mais de 1 ano', min: 365, max: Infinity, color: '#c4583a'},
    ].map((b) => ({...b, count: ages.filter((a) => a >= b.min && a < b.max).length}));
    return {ages, median: median(ages), buckets};
  }, [rows]);
  const total = stats.ages.length;
  return (
    <section className="panel age-panel">
      <span className="eyebrow">LIQUIDEZ APARENTE</span>
      <h2>Há quanto tempo os anúncios estão no ar</h2>
      {total ? (
        <>
          <div className="age-headline">
            <strong>{stats.median == null ? '—' : n(stats.median)} dias</strong>
            <span>idade mediana do anúncio na data da coleta</span>
          </div>
          <div className="age-stack" role="img" aria-label="Distribuição da idade dos anúncios">
            {stats.buckets.map((b) => b.count > 0 && <i key={b.label} style={{flexGrow: b.count, background: b.color}} title={b.label + ': ' + b.count} />)}
          </div>
          <ul className="age-legend">
            {stats.buckets.map((b) => (
              <li key={b.label}><i style={{background: b.color}} />{b.label}<strong>{share(b.count, total)}</strong></li>
            ))}
          </ul>
          <p className="small muted">Calculado nos {n(total)} anúncios ({share(total, rows.length)} da seleção) em que o portal informa a data de publicação. Anúncio antigo pode indicar preço acima do mercado ou baixa procura; republicações zeram a contagem.</p>
        </>
      ) : (
        <p className="small muted pulse-note">Nenhum anúncio desta seleção traz a data de publicação do portal. O indicador aparece quando a coleta incluir esse campo.</p>
      )}
    </section>
  );
}
