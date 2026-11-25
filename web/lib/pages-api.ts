import {cities,normalize,validateArea,clean,safeURL,distance} from './domain';
import {curitibaProfile} from './curitiba-profile';
import londrina from './ibge-londrina.json';
const base=import.meta.env.BASE_URL;
const empty=()=>({listings:[],areas:[],rivals:[],runs:[],meshes:[],reports:[],history:[],batches:[],labels:[],transactions:[]}) as Record<string,any[]>;
function read(city:string){try{const raw=localStorage.getItem('hub-pages-v1:'+city);return raw?{...empty(),...JSON.parse(raw)}:empty()}catch{throw Error('Não foi possível ler seus estudos neste navegador. Verifique as permissões de armazenamento.')}}
function write(city:string,data:unknown){try{localStorage.setItem('hub-pages-v1:'+city,JSON.stringify(data))}catch{throw Error('O navegador não conseguiu salvar. O espaço pode estar cheio; exporte seu histórico antes de continuar.')}}
async function json(url:string){const r=await fetch(url);if(!r.ok)throw Error('Referência indisponível nesta conexão.');return r.json()}
function publicRecord(r:any){const row=normalize({...r,metodo:r.metodo||'Base pública importada; disponibilidade não reconfirmada'});if(/Rua aproximada|CEP aproximado/.test(r.geo_precisao||'')){row.latitude=null;row.longitude=null;row.geo_precisao=r.geo_precisao+' · sem posição individual utilizável'}return row}
let referencePromise:Promise<any>|null=null;
async function reference(){if(!referencePromise)referencePromise=Promise.all([json(base+'curitiba/imoveis.json'),json(base+'curitiba/historico.json')]).then(([rows,h])=>{const published=new Map<string,string>();for(const r of rows){const v=r.published_at||r.created_at;if(v)published.set(String(r.id),v)}return {listings:rows.map(publicRecord),batches:(h.batches||[]).map((b:any,i:number)=>({id:'reference-'+i,scope:JSON.stringify([b.source,'Curitiba',b.purpose,b.coverage]),city:'Curitiba',source:b.source,purpose:b.purpose,observed:b.observed_at,complete:b.complete===true,note:b.note,records:b.records.map((r:any)=>publicRecord(published.has(String(r.id))&&!r.published_at?{...r,published_at:published.get(String(r.id))}:r))}))}}).catch(e=>{referencePromise=null;throw e});return referencePromise}
export async function pagesRequest(path:string,b?:any):Promise<any>{
 if(path==='/reference/curitiba-market.json')return reference();
 const u=new URL(path,location.origin),city=b?.city||u.searchParams.get('city')||'Curitiba';
 const cityInfo=cities.find(c=>c.name===city);if(!cityInfo)throw Error('Cidade inválida.');
 if(u.pathname==='/api/public'){
  if(b.op==='ibge'){if(city==='Curitiba')return curitibaProfile;if(city==='Londrina')return londrina;const url=`https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[${cityInfo.code}]`;const raw=await json(url),population=Number(raw?.[0]?.resultados?.[0]?.series?.[0]?.serie?.['2022']);if(!population)throw Error('Indicadores indisponíveis nesta conexão.');return {city,population,year:2022,ages:[],source:url,checked:new Date().toISOString()}}
  if(b.op==='pois'){if(!['Curitiba','Londrina'].includes(city))throw Error('Entorno ainda não disponível para esta cidade.');const raw=await json(base+(city==='Curitiba'?'curitiba/pois.json':'pois.json'));const cats:any={Restaurantes:'restaurant',Escolas:'school',Mercados:'supermarket',Farmácias:'pharmacy',Academias:'fitness_centre',Hospitais:'hospital'};return {source:'https://www.openstreetmap.org/copyright',checked:raw.data,items:(raw.items||[]).map((r:any)=>({id:r.id||r.url,name:r.nome,category:cats[r.categoria]||r.categoria,lat:r.latitude,lon:r.longitude,distance:distance(r.latitude,r.longitude,b.area)})).filter((r:any)=>r.distance<=b.area.radius)}}
  if(b.op==='geocode'){const q=String(b.q||'').trim();if(q.length<4||q.length>160)throw Error('Digite de 4 a 160 caracteres.');const raw=await json('https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=5&q='+encodeURIComponent(q+', '+city+', Brasil'));return raw.map((r:any)=>({label:clean(r.display_name,300),lat:Number(r.lat),lon:Number(r.lon)}))}
  throw Error('Consulta indisponível.');
 }
 const d=read(city);
 if(!b){if(u.pathname==='/api/market')return {batches:d.batches,labels:d.labels,transactions:d.transactions};let rows:any[]=[];if(city==='Londrina')rows=(await json(base+'imoveis.json')).map(publicRecord);const merged=new Map(rows.map(r=>[r.id,r]));for(const r of d.listings)merged.set(r.id,r);return {...d,listings:[...merged.values()]}}
 const id=(typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')),now=new Date().toISOString();let response:any={ok:true};
 if(u.pathname==='/api/market'){
  if(b.op==='snapshot'){
   if(!Array.isArray(b.records)||b.records.length>2000)throw Error('Cada coleta aceita até 2.000 anúncios.');
   const date=new Date(b.observed_at);if(!b.observed_at||!Number.isFinite(date.getTime())||date.getTime()>Date.now()+600000)throw Error('Informe a data original válida da coleta.');
   if(!b.source||!b.coverage||!['venda','aluguel'].includes(b.purpose))throw Error('Informe fonte, finalidade e escopo.');
   if(b.complete===true&&(!b.note?.trim()||b.truncated||b.failed||b.rejected>0))throw Error('Cobertura completa exige evidência e ausência de falhas.');
   if(!b.records.length&&!b.empty_confirmed)throw Error('Confirme que o resultado vazio é real.');
   const records=b.records.map((r:any)=>normalize({...r,data_coleta:date.toISOString()}));
   if(new Set(records.map((r:any)=>r.id)).size!==records.length)throw Error('Há IDs duplicados.');
   if(records.some((r:any)=>r.cidade!==city||r.fonte!==b.source||r.finalidade!==b.purpose))throw Error('Cidade, fonte e finalidade devem coincidir com o lote.');
   const scope=JSON.stringify([b.source,city,b.purpose,b.coverage]),observed=date.toISOString();
   const old=d.batches.find(r=>r.scope===scope&&r.observed===observed);if(old){if(JSON.stringify(old.records)!==JSON.stringify(records))throw Error('Existe uma coleta deste horário com conteúdo diferente.');return {saved:records.length,duplicate:true}}
   d.batches.push({id,scope,city,source:clean(b.source),purpose:b.purpose,observed,complete:b.complete===true,note:clean(b.note,500),records});response={saved:records.length};
  }else if(b.op==='review'){const r=d.batches.find(r=>r.id===b.id);if(!r)throw Error('Coleta não encontrada.');if(b.complete&&!b.note?.trim())throw Error('Informe a evidência de cobertura completa.');r.complete=!!b.complete;r.note=clean(b.note,500);
  }else if(b.op==='label'){const r=normalize(b.record);if(r.cidade!==city)throw Error('Cidade divergente.');const label={id:r.id,empreendimento:r.empreendimento,incorporadora:r.incorporadora,torre:r.torre,unidade:r.unidade,andar:r.andar,estagio:r.estagio};d.labels=d.labels.filter(x=>x.id!==r.id).concat(label);
  }else if(b.op==='transactions'){if(!Array.isArray(b.records)||b.records.length>40)throw Error('Importe até 40 transações.');for(const item of b.records){if(!item.transacao_id||!item.data_transacao)throw Error('Informe identificação e data da transação.');const r=normalize({...item,data_coleta:item.data_transacao});if(r.cidade!==city)throw Error('Cidade divergente.');const status=item.status_transacao||'confirmada';if(!['confirmada','cancelada'].includes(status))throw Error('Status inválido.');d.transactions=d.transactions.filter(x=>!(x.fonte===r.fonte&&x.transacao_id===String(item.transacao_id))).concat({...r,transacao_id:String(item.transacao_id),data_transacao:r.data_coleta,status_transacao:status})}response={saved:b.records.length};
  }else throw Error('Operação indisponível.');
 }else if(b.op==='save-area'){const name=clean(b.name,100).trim();if(!name)throw Error('Dê um nome à área.');d.areas.push({...validateArea(b.area),_key:id,name,city,filters:b.filters||{},alerts:!!b.alerts,saved:now});
 }else if(b.op==='rival'){const a=validateArea({...b.rival,radius:1});if(!b.rival.name?.trim())throw Error('Informe o nome.');d.rivals.push({_key:id,name:clean(b.rival.name),builder:clean(b.rival.builder),stage:clean(b.rival.stage),url:safeURL(b.rival.url),lat:a.lat,lon:a.lon,city});
 }else if(b.op==='delete'){for(const k of ['areas','rivals','meshes'])d[k]=d[k].filter(r=>r._key!==b.id);
 }else if(b.op==='report'){d.reports.push({_key:id,name:clean(b.name),area:validateArea(b.area),count:Number(b.count)||0,created:now});
 }else if(b.op==='import'){if(!Array.isArray(b.rows)||b.rows.length>300)throw Error('Importe até 300 registros.');let saved=0;const errors:string[]=[];for(const r of b.rows){try{const row=normalize(r);if(row.cidade!==city)throw Error('Cidade divergente.');d.listings=d.listings.filter(x=>x.id!==row.id).concat(row);d.history.push({...row,observed:row.data_coleta});saved++}catch(e){errors.push((e as Error).message)}}response={saved,rejected:errors.length,errors:errors.slice(0,10)};
 }else if(b.op==='mesh'){if(b.geojson?.type!=='FeatureCollection'||!Array.isArray(b.geojson.features)||b.geojson.features.length>1000||!safeURL(b.source))throw Error('Informe a malha oficial e a fonte.');if(b.geojson.features.some((f:any)=>!['Polygon','MultiPolygon'].includes(f.geometry?.type)))throw Error('A malha deve conter polígonos.');d.meshes=[{_key:id,source:safeURL(b.source),geojson:b.geojson}];
 }else throw Error('Esta operação requer o servidor privado. No painel público, importe uma coleta em JSON.');
 write(city,d);return response;
}
