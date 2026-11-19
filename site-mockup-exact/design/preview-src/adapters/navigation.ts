import {useMemo,useSyncExternalStore} from 'react';
export function current(){return location.hash.startsWith('#/')?location.hash.slice(1):'/en';}
export function navigate(value:string,replace=false){
 const url=new URL(value,location.origin==='null'?'https://preview.invalid':location.origin);const next=url.pathname+url.search+url.hash;
 if(!['localhost','127.0.0.1','portal.delaypay.co.il','delaypay.co.il','www.delaypay.co.il','preview.invalid'].includes(url.hostname)&&url.origin!==location.origin){window.dispatchEvent(new CustomEvent('preview-external',{detail:url.href}));return;}
 if(url.pathname.includes('provider-preview.html')){window.dispatchEvent(new CustomEvent('preview-external',{detail:url.href}));return;}
 if(current()===next)return;
 if(replace){history.replaceState(null,'',location.pathname+location.search+'#'+next);dispatchEvent(new HashChangeEvent('hashchange'));}else location.hash=next;
 if(url.hash)setTimeout(()=>document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView(),35);
}
const router={push:(p:string)=>navigate(p),replace:(p:string)=>navigate(p,true),refresh:()=>dispatchEvent(new CustomEvent('preview-refresh')),back:()=>history.back(),forward:()=>history.forward(),prefetch:()=>Promise.resolve()};
const subscribe=(cb:()=>void)=>{addEventListener('hashchange',cb);return()=>removeEventListener('hashchange',cb);};
export function usePathname(){return useSyncExternalStore(subscribe,()=>current().split(/[?#]/)[0]);}
export function useRouter(){return router;}
export function useSearchParams(){const route=useSyncExternalStore(subscribe,current);return useMemo(()=>new URLSearchParams((route.split('?')[1]||'').split('#')[0]),[route]);}
export function useParams(){const path=usePathname();return useMemo(()=>({caseId:path.match(/\/cases\/([^/]+)/)?.[1],docId:path.match(/\/documents\/([^/]+)/)?.[1],locale:path.split('/')[1]}),[path]);}
export function notFound():never{throw new Error('NEXT_NOT_FOUND');}
export function redirect(url:string):never{navigate(url,true);throw new Error('NEXT_REDIRECT');}
