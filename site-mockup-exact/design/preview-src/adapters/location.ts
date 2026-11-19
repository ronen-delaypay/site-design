import {current,navigate} from './navigation';
// The application still requests the same URL and redirect target. This adapter
// maps Next.js-style full-page navigation to the mockup's static host.
Object.defineProperty(globalThis,'__previewLocation',{value:{
 get pathname(){return current().split(/[?#]/)[0];},get search(){const query=(current().split('?')[1]||'').split('#')[0];return query?'?'+query:'';},get hash(){return current().includes('#')?'#'+current().split('#')[1]:'';},get origin(){return location.origin;},get host(){return location.host;},get hostname(){return location.hostname;},get protocol(){return location.protocol;},
 get href(){return location.origin+current();},set href(value:string){navigate(value);},
 replace:(value:string)=>navigate(value,true),assign:(value:string)=>navigate(value),reload:()=>location.reload(),toString:()=>location.origin+current()
},configurable:false});
window.open=((value:string)=>{dispatchEvent(new CustomEvent('preview-external',{detail:value}));return null;}) as any;
Object.defineProperty(globalThis,'__previewHistory',{value:{get state(){return history.state;},replaceState:(_state:any,_title:string,url?:string|URL)=>{if(url)navigate(String(url),true);},pushState:(_state:any,_title:string,url?:string|URL)=>{if(url)navigate(String(url));},back:()=>history.back(),forward:()=>history.forward(),go:(n:number)=>history.go(n)}});
