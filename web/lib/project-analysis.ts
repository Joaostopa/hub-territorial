import {Listing, distance, median} from './domain';
import {Filter, matches, textKey} from './market';
import type {Project} from './projects';
import catalog from './curitiba-projects.json';

export type Rival = {name: string; builder?: string; stage?: string; lat?: number; lon?: number; url?: string};
/** Rascunho aceito pelos cálculos: o projeto pode estar incompleto enquanto é criado. */
export type Draft = Pick<Project, 'cidade' | 'tipo' | 'finalidade' | 'local' | 'quartos' | 'area' | 'preco' | 'unidades' | 'custoTerreno' | 'custoObraM2' | 'fatorConstruida' | 'despesasPct'>;

/** Amostras mínimas para publicar um indicador. */
export const MIN_SAMPLE = 5;

export const roomBand = (q: number | null | undefined) => (q == null || q <= 0 ? null : q >= 4 ? 4 : q);
const m2 = (rows: Listing[]) => median(rows.filter((r) => r.area_m2).map((r) => r.preco / r.area_m2!));

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function sameType(tipo: string) {
  return (r: Listing) =>
    tipo === 'apartamento' ? r.tipo === 'apartamento'
      : tipo === 'casa' ? /casa|sobrado/.test(r.tipo)
        : tipo === 'terreno' ? /terreno|lote/.test(r.tipo)
          : /comercial|sala|loja/.test(r.tipo);
}

export function regionFilter(p: Pick<Draft, 'finalidade' | 'local'>, mesh: any): Filter {
  return {
    purpose: p.finalidade,
    scope: p.local.modo === 'bairro' ? 'neighborhood' : 'area',
    neighborhood: p.local.modo === 'bairro' ? p.local.bairro : '',
    area: p.local.modo === 'raio' ? {lat: p.local.lat, lon: p.local.lon, radius: p.local.raio} : {lat: 0, lon: 0, radius: 1},
    source: 'all', type: 'all', rooms: 0, minPrice: 0, maxPrice: 0, minArea: 0, maxArea: 0, stage: 'all',
    boundaries: mesh?.geojson?.features,
  };
}

/** Mercado de um recorte (bairro ou raio): oferta, preços, mix, faixa de preço e comparáveis do produto. */
export function analyze(p: Draft, listings: Listing[], mesh: any) {
  const f = regionFilter(p, mesh);
  const typeOk = sameType(p.tipo);
  const region = listings.filter((r) => matches(r, f));
  const typed = region.filter(typeOk);
  const pool = typed.length >= MIN_SAMPLE ? typed : region;
  const cityPool = listings.filter((r) => r.finalidade === p.finalidade && typeOk(r));
  const regionM2 = m2(pool), cityM2 = m2(cityPool);
  const projectM2 = p.preco && p.area ? p.preco / p.area : null;

  // Mix por dormitórios no recorte
  const known = pool.filter((r) => roomBand(r.quartos) != null);
  const mix = [1, 2, 3, 4].map((band) => {
    const items = known.filter((r) => roomBand(r.quartos) === band);
    return {
      band, count: items.length, share: known.length ? items.length / known.length : 0,
      area: items.length >= MIN_SAMPLE ? median(items.filter((r) => r.area_m2).map((r) => r.area_m2!)) : null,
      m2: items.length >= MIN_SAMPLE ? m2(items) : null,
      ticket: items.length >= MIN_SAMPLE ? median(items.map((r) => r.preco)) : null,
    };
  });

  // Comparáveis: mesma faixa de dormitórios e área ±25%; amplia quando a amostra é pequena
  const band = roomBand(p.quartos);
  const byRooms = pool.filter((r) => band == null || roomBand(r.quartos) === band);
  const strict = byRooms.filter((r) => p.area == null || (r.area_m2 != null && Math.abs(r.area_m2 / p.area - 1) <= 0.25));
  const compBase = strict.length >= MIN_SAMPLE ? strict : byRooms.length >= MIN_SAMPLE ? byRooms : pool;
  const compLevel = compBase === strict ? 'dormitórios e área parecidos' : compBase === byRooms ? 'mesmos dormitórios, qualquer área' : 'todo o recorte';
  const comparables = strict
    .map((r) => ({...r, m2: r.area_m2 ? r.preco / r.area_m2 : null, gap: projectM2 && r.area_m2 ? r.preco / r.area_m2 / projectM2 - 1 : null}))
    .sort((a, b) => (a.area_m2 && p.area ? Math.abs(a.area_m2 - p.area) : 9e9) - (b.area_m2 && p.area ? Math.abs(b.area_m2 - p.area) : 9e9));
  const compM2 = compBase.filter((r) => r.area_m2).map((r) => r.preco / r.area_m2!).sort((a, b) => a - b);
  const bandM2 = compM2.length >= MIN_SAMPLE
    ? {p10: quantile(compM2, 0.1)!, p25: quantile(compM2, 0.25)!, p50: quantile(compM2, 0.5)!, p75: quantile(compM2, 0.75)!, p90: quantile(compM2, 0.9)!, n: compM2.length, level: compLevel}
    : null;
  const percentile = projectM2 != null && compM2.length >= MIN_SAMPLE ? compM2.filter((v) => v <= projectM2).length / compM2.length : null;

  const rent = listings.filter((r) => matches(r, {...f, purpose: 'aluguel'}) && typeOk(r));
  const sale = listings.filter((r) => matches(r, {...f, purpose: 'venda'}) && typeOk(r));
  const rentM2 = rent.filter((r) => r.area_m2).length >= 3 ? m2(rent) : null, saleM2 = sale.length >= MIN_SAMPLE ? m2(sale) : null;

  let population: number | null = null, homes: number | null = null;
  if (p.local.modo === 'bairro') {
    const key = textKey(p.local.bairro);
    const feature = mesh?.geojson?.features?.find((ft: any) => textKey(ft.properties.nome || ft.properties.name) === key);
    population = feature?.properties?.populacao ?? null;
    homes = feature?.properties?.domicilios ?? null;
  }
  return {
    region, pool, typedOnly: pool === typed, regionM2, cityM2, projectM2, percentile, comparables, bandM2, mix,
    saleCount: sale.length, rentCount: rent.length,
    ticket: median(pool.map((r) => r.preco)), areaMedian: median(pool.filter((r) => r.area_m2).map((r) => r.area_m2!)),
    yieldYear: rentM2 && saleM2 ? (rentM2 * 12) / saleM2 : null, population, homes,
  };
}
export type Analysis = ReturnType<typeof analyze>;

export function competitors(p: Pick<Draft, 'cidade' | 'local'>, rivals: Rival[]) {
  const fromCatalog = (catalog as any[])
    .filter((c) => c.cidade === p.cidade && p.local.modo === 'bairro' && textKey(c.bairro) === textKey(p.local.bairro))
    .map((c) => ({name: c.nome as string, builder: c.construtora as string, stage: c.estagio as string, url: c.url as string, where: c.bairro as string}));
  const own = rivals
    .filter((r) => p.local.modo === 'raio' && r.lat != null && r.lon != null && distance(r.lat, r.lon, {lat: p.local.lat, lon: p.local.lon, radius: p.local.raio}) <= p.local.raio)
    .map((r) => ({name: r.name, builder: r.builder, stage: r.stage, url: r.url, where: 'Dentro do raio'}));
  return [...fromCatalog, ...own];
}

/** Conta de viabilidade simplificada (venda: margem sobre VGV; aluguel: rendimento sobre custo). */
export function viability(p: Draft) {
  const units = p.unidades, area = p.area, price = p.preco;
  if (!units || !area || !price) return null;
  const factor = p.fatorConstruida ?? 1.4;
  const built = area * units * factor;
  const works = p.custoObraM2 ? built * p.custoObraM2 : null;
  const land = p.custoTerreno ?? null;
  if (p.finalidade === 'aluguel') {
    const annual = price * 12 * units;
    const cost = works != null && land != null ? works + land : null;
    return {kind: 'aluguel' as const, annual, built, works, land, cost, yieldOnCost: cost ? annual / cost : null};
  }
  const vgv = price * units;
  const expenses = vgv * ((p.despesasPct ?? 15) / 100);
  const cost = works != null && land != null ? works + land + expenses : null;
  return {kind: 'venda' as const, vgv, built, works, land, expenses, cost, profit: cost != null ? vgv - cost : null, margin: cost != null ? (vgv - cost) / vgv : null};
}

export type Signal = {tone: 'good' | 'warn' | 'risk' | 'info'; title: string; detail: string};

/** Parecer automático por regras: pontos fortes, alertas e riscos do produto no recorte. */
export function verdict(p: Draft, a: Analysis, rivalsCount: number): Signal[] {
  const out: Signal[] = [];
  const pctTxt = (v: number) => (v * 100).toLocaleString('pt-BR', {maximumFractionDigits: 0}) + '%';
  if (a.pool.length < 10) out.push({tone: 'warn', title: 'Amostra pequena', detail: `Só ${a.pool.length} anúncios no recorte. Amplie o raio ou confirme os números em campo antes de decidir.`});
  if (a.projectM2 != null && a.bandM2) {
    const {p25, p50, p75} = a.bandM2;
    if (a.projectM2 > p75 * 1.05) out.push({tone: 'risk', title: 'Preço acima do mercado', detail: `R$/m² do projeto acima de 75% dos comparáveis (${pctTxt(a.projectM2 / p50 - 1)} vs. mediana). Exige diferencial claro para vender no ritmo.`});
    else if (a.projectM2 < p25 * 0.95) out.push({tone: 'warn', title: 'Preço abaixo da faixa', detail: `R$/m² ${pctTxt(1 - a.projectM2 / p50)} abaixo da mediana. Tende a vender rápido, mas pode estar deixando margem na mesa.`});
    else out.push({tone: 'good', title: 'Preço dentro da faixa da região', detail: `R$/m² entre o 1º e o 3º quartil dos comparáveis (mediana ${a.bandM2.p50.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: 0})}/m²).`});
  }
  const band = roomBand(p.quartos);
  const slot = band != null ? a.mix.find((m) => m.band === band) : null;
  const knownTotal = a.mix.reduce((s, m) => s + m.count, 0);
  if (slot && knownTotal >= 20) {
    if (slot.share >= 0.4) out.push({tone: 'warn', title: 'Tipologia muito ofertada', detail: `${pctTxt(slot.share)} dos anúncios do recorte têm ${band === 4 ? '4+' : band} dorm. A concorrência direta é grande.`});
    else if (slot.share <= 0.12) out.push({tone: 'good', title: 'Tipologia pouco ofertada', detail: `Só ${pctTxt(slot.share)} da oferta tem ${band === 4 ? '4+' : band} dorm. Pode ser uma lacuna; valide a demanda.`});
  }
  if (slot?.area && p.area) {
    const diff = p.area / slot.area - 1;
    if (Math.abs(diff) >= 0.25) out.push({tone: 'info', title: diff > 0 ? 'Área maior que o padrão' : 'Área menor que o padrão', detail: `Mediana da região para essa tipologia: ${Math.round(slot.area)} m² (${diff > 0 ? '+' : ''}${pctTxt(diff)}).`});
  }
  if (rivalsCount >= 3) out.push({tone: 'warn', title: 'Concorrência de lançamentos', detail: `${rivalsCount} empreendimentos cadastrados na mesma região.`});
  const v = viability(p);
  if (v?.kind === 'venda' && v.margin != null) {
    if (v.margin < 0.12) out.push({tone: 'risk', title: 'Margem apertada', detail: `Margem estimada de ${pctTxt(v.margin)} sobre o VGV. Revise custos ou preço.`});
    else if (v.margin >= 0.2) out.push({tone: 'good', title: 'Margem saudável', detail: `Margem estimada de ${pctTxt(v.margin)} sobre o VGV.`});
    else out.push({tone: 'info', title: 'Margem moderada', detail: `Margem estimada de ${pctTxt(v.margin)} sobre o VGV.`});
  }
  if (a.yieldYear != null && p.finalidade === 'venda') out.push({tone: 'info', title: 'Apelo para investidor', detail: `Rentabilidade bruta anunciada da região: ${pctTxt(a.yieldYear)} ao ano.`});
  return out;
}
