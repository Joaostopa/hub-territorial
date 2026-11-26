import {cities} from './domain';

export const PROJECT_STATUS = ['Prospecção', 'Viabilidade', 'Aprovado', 'Em lançamento', 'Arquivado'] as const;
export const PRODUCT_TYPES = [
  {value: 'apartamento', label: 'Apartamento'},
  {value: 'casa', label: 'Casa / sobrado'},
  {value: 'terreno', label: 'Terreno / lote'},
  {value: 'comercial', label: 'Comercial'},
] as const;

export type Project = {
  id: string;
  nome: string;
  cidade: string;
  status: (typeof PROJECT_STATUS)[number];
  tipo: string;
  finalidade: 'venda' | 'aluguel';
  local: {modo: 'bairro'; bairro: string} | {modo: 'raio'; lat: number; lon: number; raio: number; rotulo: string};
  quartos: number | null;
  area: number | null;
  preco: number | null;
  unidades: number | null;
  /** Viabilidade (opcional): custo do terreno em R$, custo de obra por m² construído, área construída ÷ privativa, despesas em % do VGV. */
  custoTerreno: number | null;
  custoObraM2: number | null;
  fatorConstruida: number | null;
  despesasPct: number | null;
  notas: string;
  criado: string;
  atualizado: string;
};

const KEY = 'hub-territorial:projetos:v1';
const text = (v: unknown, max: number) => String(v ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max);
const positive = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

/** Valida um projeto vindo do formulário ou de um arquivo importado. */
export function sanitize(raw: any): Project {
  const nome = text(raw?.nome, 120);
  if (!nome) throw Error('Dê um nome ao projeto.');
  const cidade = cities.find((c) => c.name === raw?.cidade)?.name;
  if (!cidade) throw Error('Escolha uma cidade da lista.');
  const status = PROJECT_STATUS.includes(raw?.status) ? raw.status : 'Prospecção';
  const tipo = PRODUCT_TYPES.some((t) => t.value === raw?.tipo) ? raw.tipo : 'apartamento';
  const finalidade = raw?.finalidade === 'aluguel' ? 'aluguel' : 'venda';
  let local: Project['local'];
  if (raw?.local?.modo === 'raio') {
    const lat = Number(raw.local.lat), lon = Number(raw.local.lon), raio = Number(raw.local.raio);
    if (![lat, lon, raio].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || raio < 0.1 || raio > 30) throw Error('Área do projeto inválida.');
    local = {modo: 'raio', lat, lon, raio, rotulo: text(raw.local.rotulo, 120) || 'Raio de ' + raio + ' km'};
  } else {
    const bairro = text(raw?.local?.bairro, 120);
    if (!bairro) throw Error('Escolha o bairro ou use a área atual do mapa.');
    local = {modo: 'bairro', bairro};
  }
  const now = new Date().toISOString();
  const date = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : now);
  return {
    id: typeof raw?.id === 'string' && /^[\w-]{6,64}$/.test(raw.id) ? raw.id : 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    nome,
    cidade,
    status,
    tipo,
    finalidade,
    local,
    quartos: positive(raw?.quartos, 20),
    area: positive(raw?.area, 100000),
    preco: positive(raw?.preco, 1e10),
    unidades: positive(raw?.unidades, 100000),
    custoTerreno: positive(raw?.custoTerreno, 1e11),
    custoObraM2: positive(raw?.custoObraM2, 1e6),
    fatorConstruida: positive(raw?.fatorConstruida, 5),
    despesasPct: positive(raw?.despesasPct, 90),
    notas: text(raw?.notas, 4000),
    criado: date(raw?.criado),
    atualizado: date(raw?.atualizado),
  };
}

export function loadProjects(): Project[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.flatMap((r) => { try { return [sanitize(r)]; } catch { return []; } }) : [];
  } catch {
    return [];
  }
}

export function saveProjects(list: Project[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw Error('O navegador não conseguiu salvar os projetos. Exporte um backup antes de continuar.');
  }
}
