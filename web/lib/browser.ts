import {pagesRequest} from './pages-api';
const scripts=new Map<string,Promise<void>>();
export function loadScript(url:string){if(!scripts.has(url))scripts.set(url,new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>resolve();s.onerror=()=>{scripts.delete(url);s.remove();reject(Error('Não foi possível carregar um recurso externo. Confira sua conexão.'))};document.head.appendChild(s)}));return scripts.get(url)!}
export function css(url:string){if(document.querySelector(`link[href="${url}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=url;document.head.appendChild(l)}
export async function request(path:string,data?:any){return pagesRequest(path,data)}
export function download(name:string,body:BlobPart,type:string){const u=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
export function csvText(rows:any[]){if(!rows.length)return '';const keys=Object.keys(rows[0]),cell=(v:any)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};return '\ufeff'+[keys.map(cell).join(';'),...rows.map(r=>keys.map(k=>cell(r[k])).join(';'))].join('\r\n')}
