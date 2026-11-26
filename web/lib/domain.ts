export type City={name:string;code:string;uf:string;lat:number;lon:number;mesh:boolean};
export const cities:City[]=[
 {name:'Curitiba',code:'4106902',uf:'PR',lat:-25.4284,lon:-49.2733,mesh:true},
 {name:'Londrina',code:'4113700',uf:'PR',lat:-23.3045,lon:-51.1696,mesh:true},
 {name:'Maringá',code:'4115200',uf:'PR',lat:-23.4205,lon:-51.9331,mesh:true},
 {name:'Ponta Grossa',code:'4119905',uf:'PR',lat:-25.0945,lon:-50.1633,mesh:true},
 {name:'Cascavel',code:'4104808',uf:'PR',lat:-24.9555,lon:-53.4552,mesh:true},
 {name:'Foz do Iguaçu',code:'4108304',uf:'PR',lat:-25.5163,lon:-54.5854,mesh:true},
 {name:'São José dos Pinhais',code:'4125506',uf:'PR',lat:-25.5313,lon:-49.2031,mesh:true},
 {name:'Campinas',code:'3509502',uf:'SP',lat:-22.9056,lon:-47.0608,mesh:false},
 {name:'Sorocaba',code:'3552205',uf:'SP',lat:-23.5015,lon:-47.4526,mesh:false},
 {name:'Ribeirão Preto',code:'3543402',uf:'SP',lat:-21.1775,lon:-47.8103,mesh:true},
 {name:'Jundiaí',code:'3525904',uf:'SP',lat:-23.1857,lon:-46.8978,mesh:true},
 {name:'Piracicaba',code:'3538709',uf:'SP',lat:-22.7253,lon:-47.6492,mesh:true},
 {name:'Santos',code:'3548500',uf:'SP',lat:-23.9608,lon:-46.3336,mesh:true},
 {name:'Campo Grande',code:'5002704',uf:'MS',lat:-20.4697,lon:-54.6201,mesh:true},
 {name:'Três Lagoas',code:'5008305',uf:'MS',lat:-20.7849,lon:-51.7007,mesh:true},
];
export type Area={lat:number;lon:number;radius:number};
export type Listing={id:string;fonte:string;id_externo:string;cidade:string;titulo:string;bairro:string;finalidade:string;tipo:string;preco:number;area_m2:number|null;quartos:number|null;vagas:number|null;latitude:number|null;longitude:number|null;geo_precisao:string;url:string;data_coleta:string;metodo:string;condominio:number|null;iptu:number|null;empreendimento?:string;incorporadora?:string;torre?:string;unidade?:string;andar?:string;estagio?:string;publicado?:string};
export function distance(lat:number,lon:number,a:Area){const r=Math.PI/180,dlat=(lat-a.lat)*r,dlon=(lon-a.lon)*r,h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(lat*r)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)))}
export function median(a:number[]){if(!a.length)return null;const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
export function numeric(v:unknown){if(v==null||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;let s=String(v).replace(/[^\d,.-]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return s&&Number.isFinite(n)?n:null}
export function clean(v:unknown,max=200){return String(v??'').replace(/<[^>]*>/g,'').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[contato removido]').replace(/(?:\+55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]\d{4}/g,'[contato removido]').slice(0,max)}
export function safeURL(v:unknown){try{const u=new URL(String(v));if(u.protocol!=='https:'||u.username||u.password)return '';u.search='';u.hash='';return u.href}catch{return ''}}
export function normalize(r:any):Listing{const preco=numeric(r.preco),area=numeric(r.area_m2),rawLat=numeric(r.latitude),rawLon=numeric(r.longitude),city=cities.find(c=>c.name===r.cidade);let lat=rawLat,lon=rawLon;if(city&&lat!=null&&lon!=null&&distance(lat,lon,{lat:city.lat,lon:city.lon,radius:0})>100){lat=null;lon=null;}if(!city||!preco||preco<=0||!r.fonte||!r.id_externo||!['venda','aluguel'].includes(r.finalidade))throw Error('Informe fonte, id_externo, cidade válida, finalidade e preço positivo.');if(area!=null&&area<=0)throw Error('Área deve ser positiva.');if((lat===null)!==(lon===null)||lat!=null&&(lat< -90||lat>90||lon!< -180||lon!>180))throw Error('Coordenadas inválidas.');const date=r.data_coleta?new Date(r.data_coleta):new Date();if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()+86400000)throw Error('Data inválida.');const fonte=clean(r.fonte,80),id_externo=String(r.id_externo).slice(0,160);return {id:encodeURIComponent(fonte+'|'+id_externo+'|'+r.finalidade),fonte,id_externo,cidade:city.name,titulo:clean(r.titulo||'Imóvel'),bairro:clean(r.bairro,120),finalidade:r.finalidade,tipo:clean(r.tipo||'outro',40),preco,area_m2:area,quartos:numeric(r.quartos),vagas:numeric(r.vagas),latitude:lat,longitude:lon,geo_precisao:lat==null?'sem coordenadas':clean(r.geo_precisao||'origem não verificada',80),url:safeURL(r.url),data_coleta:date.toISOString(),metodo:clean(r.metodo||'importação',100),condominio:numeric(r.condominio),iptu:numeric(r.iptu),empreendimento:clean(r.empreendimento,180),incorporadora:clean(r.incorporadora,180),torre:clean(r.torre,80),unidade:clean(r.unidade,80),andar:clean(r.andar,30),estagio:clean(r.estagio,80),publicado:(()=>{const v=r.publicado||r.published_at||r.created_at;if(!v)return undefined;const t=new Date(v);return Number.isFinite(t.getTime())&&t<=date?t.toISOString():undefined})()}}
export function validateArea(a:any):Area{if(!a||typeof a.lat!=='number'||typeof a.lon!=='number'||typeof a.radius!=='number'||![a.lat,a.lon,a.radius].every(Number.isFinite)||Math.abs(a.lat)>90||Math.abs(a.lon)>180||a.radius<.05||a.radius>30)throw Error('Área inválida. Raio permitido: 50 m a 30 km.');return {lat:a.lat,lon:a.lon,radius:a.radius}}
