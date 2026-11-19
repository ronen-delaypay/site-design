export const collection=(...args:any[])=>({args});export const query=(...args:any[])=>({args});export const orderBy=(...args:any[])=>({args});export const limit=(...args:any[])=>({args});
export function onSnapshot(_query:any,next:any){let active=true;queueMicrotask(()=>{if(active)next({docs:[],empty:true,size:0});});return()=>{active=false;};}
