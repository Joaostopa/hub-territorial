'use client';
import {useState} from 'react';
import {ArrowUpRight,Building2} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import catalog from '@/lib/curitiba-projects.json';
import {textKey} from '@/lib/market';
export default function ProjectCatalog({city}:{city:string}){
 const [builder,setBuilder]=useState('all'),[stage,setStage]=useState('all'),[query,setQuery]=useState('');
 if(city!=='Curitiba')return null;
 const rows=catalog.filter(p=>(builder==='all'||p.construtora===builder)&&(stage==='all'||p.estagio===stage)&&textKey([p.nome,p.bairro].join(' ')).includes(textKey(query)));
 return <section className="panel catalog-panel"><div className="panel-heading"><div><span className="eyebrow">CATÁLOGO DE CURITIBA</span><h2>Produtos e incorporadoras</h2></div><span className="tag">{rows.length} empreendimentos</span></div><p className="small muted">Fontes oficiais consultadas em 01/10/2026. Catálogo independente dos filtros de anúncios; não representa estoque de unidades.</p><div className="market-period"><label>Construtora<select aria-label="Construtora do catálogo" value={builder} onChange={e=>setBuilder(e.target.value)}><option value="all">Todas</option>{[...new Set(catalog.map(p=>p.construtora))].sort().map(v=><option key={v}>{v}</option>)}</select></label><label>Estágio<select aria-label="Estágio do catálogo" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">Todos</option>{[...new Set(catalog.map(p=>p.estagio))].sort().map(v=><option key={v}>{v}</option>)}</select></label><label>Buscar produto<Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Empreendimento ou bairro"/></label></div><div className="catalog-grid">{rows.map(p=><article className="catalog-card" key={p.id}><div><Building2 size={19}/><span className="tag">{p.estagio}</span></div><small>{p.construtora}</small><h3>{p.nome}</h3><p>{p.bairro||'Bairro não informado'}</p><details><summary>Detalhes do produto</summary><p>{p.detalhes}</p>{p.estagio_evidencia&&<p className="small muted">Evidência do estágio: {p.estagio_evidencia}</p>}</details><a href={p.url} target="_blank" rel="noreferrer">Consultar fonte<ArrowUpRight size={14}/></a></article>)}</div>{!rows.length&&<p>Nenhum empreendimento corresponde à seleção.</p>}</section>
}
