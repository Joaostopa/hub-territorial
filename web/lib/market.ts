import {Listing,Area,distance,median} from './domain';
export type Batch={id:string;scope:string;source:string;city:string;purpose:string;observed:string;complete:boolean;note:string;records:Listing[]};
export type Exit=Listing&{event:string;detected:string;lastSeen:string;reversed:string|null;batchId:string;unit:string};
export type Filter={purpose:string;scope:string;area:Area;neighborhood:string;source:string;type:string;rooms:number;minPrice:number;maxPrice:number;minArea:number;maxArea:number;stage:string;boundaries?:any[]};
export const textKey=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function unitKey(r:Listing){return r.empreendimento&&r.torre&&r.unidade?JSON.stringify([textKey(r.cidade),textKey(r.empreendimento),textKey(r.torre),textKey(r.unidade),r.finalidade]):r.id}
function insideRing(x:number,y:number,ring:number[][]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside}return inside}
const neighborhoodIndexes=new WeakMap<any[],Map<string,any[]>>();
const geometryBounds=new WeakMap<object,[number,number,number,number]>();
function boundsOf(geometry:any){let bounds=geometryBounds.get(geometry);if(bounds)return bounds;bounds=[Infinity,Infinity,-Infinity,-Infinity];const visit=(v:any)=>{if(typeof v[0]==='number'){bounds![0]=Math.min(bounds![0],v[0]);bounds![1]=Math.min(bounds![1],v[1]);bounds![2]=Math.max(bounds![2],v[0]);bounds![3]=Math.max(bounds![3],v[1])}else v.forEach(visit)};visit(geometry.coordinates);geometryBounds.set(geometry,bounds);return bounds}
export function inNeighborhood(r:Listing,f:Filter){
 const key=textKey(f.neighborhood),boundaries=f.boundaries;
 let index=boundaries?neighborhoodIndexes.get(boundaries):undefined;
 if(boundaries&&!index){index=new Map();for(const feature of boundaries){const name=textKey(feature.properties.nome||feature.properties.name);const group=index.get(name)||[];group.push(feature);index.set(name,group)}neighborhoodIndexes.set(boundaries,index)}
 const features=index?.get(key)||[];
 if(r.latitude==null||r.longitude==null||!features.length)return textKey(r.bairro)===key;
 return features.some(g=>{const [west,south,east,north]=boundsOf(g.geometry);if(r.longitude!<west||r.longitude!>east||r.latitude!<south||r.latitude!>north)return false;const polygons=g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates;return polygons.some((p:number[][][])=>insideRing(r.longitude!,r.latitude!,p[0])&&!p.slice(1).some(h=>insideRing(r.longitude!,r.latitude!,h)))})
}
export function matches(r:Listing,f:Filter){return r.finalidade===f.purpose&&(f.source==='all'||r.fonte===f.source)&&(f.type==='all'||r.tipo===f.type)&&(r.quartos??0)>=f.rooms&&(!f.minPrice||r.preco>=f.minPrice)&&(!f.maxPrice||r.preco<=f.maxPrice)&&(!f.minArea||(r.area_m2??0)>=f.minArea)&&(!f.maxArea||(r.area_m2!=null&&r.area_m2<=f.maxArea))&&(f.stage==='all'||r.estagio===f.stage)&&
 (f.scope==='city'||f.scope==='neighborhood'&&!!f.neighborhood&&inNeighborhood(r,f)||f.scope==='area'&&r.latitude!=null&&r.longitude!=null&&distance(r.latitude,r.longitude,f.area)<=f.area.radius)}
export function replay(batches:Batch[],legacy:Listing[],f?:Filter){
 const active=new Map<string,Listing>(),seen=new Map<string,Map<string,Listing>>(),exits:Exit[]=[],timeline:{date:string;count:number;price:number|null;m2:number|null}[]=[];
 const old=new Map<string,Listing[]>();
 for(const r of legacy){if(!old.has(r.data_coleta))old.set(r.data_coleta,[]);old.get(r.data_coleta)!.push(r)}
 const all=[...batches,...[...old].map(([observed,records])=>({id:'legacy-'+observed,scope:'legacy',source:'',city:'',purpose:'',observed,complete:false,note:'',records}))].sort((a,b)=>a.observed.localeCompare(b.observed)||a.id.localeCompare(b.id));
 for(const b of all){
  const previous=seen.get(b.scope)||new Map<string,Listing>();seen.set(b.scope,previous);
  const present=new Set(b.records.map(r=>r.id));
  for(const raw of b.records){const r={...raw,data_coleta:b.observed};active.set(r.id,r);previous.set(r.id,r);for(const e of exits)if(!e.reversed&&e.unit===unitKey(r))e.reversed=b.observed;}
  const removed:Listing[]=[];
  if(b.complete){for(const [id,r] of previous){if(!present.has(id)){previous.delete(id);if(active.has(id)){removed.push(active.get(id)!);active.delete(id)}}}
   const live=new Set([...active.values()].map(unitKey));
   for(const r of removed){const unit=unitKey(r);if(live.has(unit)||exits.some(e=>!e.reversed&&e.unit===unit))continue;exits.push({...r,unit,event:r.finalidade==='venda'?'Venda estimada':'Locação estimada',lastSeen:r.data_coleta,detected:b.observed,reversed:null,batchId:b.id})}
  }
  const rows=[...active.values()].filter(r=>!f||matches(r,f));
  timeline.push({date:b.observed,count:rows.length,price:median(rows.map(r=>r.preco)),m2:median(rows.filter(r=>r.area_m2).map(r=>r.preco/r.area_m2!))});
 }
 return {current:[...active.values()],exits,timeline};
}
export function periodKey(date:string,weekly:boolean){const d=new Date(date);if(!weekly)return date.slice(0,7);const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);return d.toISOString().slice(0,10)}
