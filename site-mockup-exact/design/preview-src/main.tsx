import './adapters/location';
import React,{Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {current,navigate,usePathname,useSearchParams} from './adapters/navigation';
import {setPreviewAuth} from './adapters/auth';
import {installFixtures,fixtureState,requests} from './services/fixtures';
import {installUploadTransport} from './services/upload-transport';
import OriginalDashboard from '@snapshot/app/client/page';
import Dashboard from './draft/Dashboard';
import UploadProgressPreview from './draft/UploadProgressPreview';
import Login from '@snapshot/app/client/login/page';
import Account from '@snapshot/app/client/account/page';
import Help from '@snapshot/app/client/help/page';
import Payments from '@snapshot/app/client/payments/page';
import Notifications from '@snapshot/app/client/notifications/page';
import Case from '@snapshot/app/client/cases/[caseId]/page';
import Document from '@snapshot/app/client/documents/[docId]/page';
import Gmail from '@snapshot/app/client/settings/gmail/page';
import Forgot from '@snapshot/app/client/forgot-password/page';
import VerifyEmail from '@snapshot/app/client/verify-email/page';
import VerifyPhone from '@snapshot/app/client/verify-phone/page';
import PoaSigned from '@snapshot/app/client/poa-signed/page';
import AgentSignup from '@snapshot/app/client/agent-signup/page';
import AgentHome from '@snapshot/app/client/agent/page';
import AgentSubmit from '@snapshot/app/client/agent/submit/page';
import AgentLayout from '@snapshot/app/client/agent/layout';
import ClientLayout from '@snapshot/app/client/layout-shell';
import NewClaim from '@snapshot/app/client/new-claim/page';
import SitePage from '@snapshot/app/site/[locale]/page';
import SectionPage from '@snapshot/app/site/[locale]/[section]/page';
import LegalPage from '@snapshot/app/site/[locale]/legal/[document]/page';
import {legacyWebsiteClaimHref} from '@snapshot/lib/website/paths';
import './appearance/preview.css';
import OriginalNotFound from '@snapshot/app/not-found';

installFixtures();
installUploadTransport();
const reviewMode=new URLSearchParams(location.search).get('review')==='1';
document.body.classList.toggle('preview-review',reviewMode);
const appearance=new URLSearchParams(location.search).get('appearance')==='original'?'original':'redesign';
document.body.classList.toggle('preview-redesign',appearance==='redesign');
if(appearance==='redesign')for(const [key,value] of Object.entries(surfaceVariables))document.body.style.setProperty(key,value);
if(!localStorage.getItem('delaypay.locale'))localStorage.setItem('delaypay.locale','en');
const portalRoutes=[['/client/login','Login'],['/client','Dashboard'],['/client/new-claim','New claim (existing redirect)'],['/client/cases/sample-case','Case details'],['/client/documents/sample-document','Document details'],['/client/payments','Payments'],['/client/notifications','Notifications'],['/client/account','Account'],['/client/help','Help'],['/client/settings/gmail','Gmail settings'],['/client/forgot-password','Account recovery'],['/client/verify-email','Email verification'],['/client/verify-phone','Phone verification'],['/client/poa-signed','Signing confirmation'],['/client/agent-signup','Partner signup (existing gate)'],['/client/agent','Partner dashboard (existing gate)'],['/client/agent/submit','Partner submission (existing gate)']];
const legal:any={terms:LegalPage,privacy:LegalPage,cookies:LegalPage,accessibility:LegalPage,'user-declaration':LegalPage};
function NotFound(){return <OriginalNotFound/>;}
class Boundary extends React.Component<any,any>{state={error:null};static getDerivedStateFromError(error:any){return {error};}componentDidCatch(error:any){(window as any).__previewErrors??=[];if(!error.message.startsWith('NEXT_'))(window as any).__previewErrors.push(error.message);}render(){return this.state.error?<NotFound/>:this.props.children;}}
function Gallery(){return <main className="review-gallery"><img src="./images/delaypay-logo.png" alt="DelayPay"/><h1>Current site. New appearance.</h1><p>These screens render the current source components. Product wording and client logic are not rewritten. Authentication and API responses use isolated sample services.</p><h2>Current portal pages</h2><div className="review-links">{portalRoutes.map(([p,label])=><a key={p} href={'#'+p} onClick={()=>{setPreviewAuth(p!=='/client/login');}}>{label}<span>{p}</span></a>)}</div><h2>Current website & legal pages</h2>{['en','he','ar','ru'].map(locale=><section key={locale}><h3>{locale.toUpperCase()}</h3><div className="review-links"><a href={'#/'+locale}>Homepage</a><a href={'#/'+locale+'/help'}>Help</a><a href={'#/'+locale+'/about'}>About</a><a href={'#/'+locale+'/claim'}>Legacy claim redirect</a>{Object.keys(legal).map(slug=><a href={'#/'+locale+'/legal/'+slug} key={slug}>{slug}</a>)}</div></section>)}<p className="review-note">The live deployment uses PORTAL_V2=true. This preview matches it.  Switch “Original / Redesigned” below to compare the same source, data and language.</p><p className="review-note"><a href="?portal=default#/review">Review the live PORTAL_V2=true branch</a> · <a href="?portal=legacy#/review">Review the existing legacy branch</a></p></main>;}
function Product(){const path=usePathname();const search=useSearchParams();const [serverView,setServerView]=useState<any>(null);const [readyPath,setReadyPath]=useState('');
 const normalizedPath=path.replace(/^\/site(?=\/)/,'');
 const locale=normalizedPath.match(/^\/(en|he|ar|ru)(?:\/|$)/)?.[1]||'en';
 useEffect(()=>{
  let disposed=false;setServerView(null);setReadyPath('');
  if(!path.startsWith('/client')&&path!=='/review'){
   const parts=normalizedPath.split('/').filter(Boolean);
   if(parts[1]==='claim'){const next=legacyWebsiteClaimHref('delaypay.co.il',normalizedPath,'?'+search.toString());if(next)navigate(next,true);}
   const Page=parts[1]==='legal'?legal[parts[2]]:['help','about'].includes(parts[1])?SectionPage:parts.length===1?SitePage:null;
   if(Page)Promise.resolve(Page({params:Promise.resolve({locale,section:parts[1],document:parts[2]})})).then(view=>{if(!disposed){setServerView(view);setReadyPath(path);}}).catch(err=>{if(!disposed){setServerView(<NotFound/>);setReadyPath(path);console.warn(err);}});
  }
  if(path==='/client/new-claim')void NewClaim({searchParams:Promise.resolve(Object.fromEntries(search))}).catch(err=>{if(!err.message.startsWith('NEXT_'))console.error(err);});
  return()=>{disposed=true;};
 },[path,search,locale]);
 if(path==='/review')return <Gallery/>;
 if(!path.startsWith('/client'))return <div className="source-marketing" lang={locale} dir={['he','ar'].includes(locale)?'rtl':'ltr'}>{readyPath===path?serverView:null}</div>;
 const pages:any={'/client/upload-progress-preview':UploadProgressPreview,'/client':appearance==='original'?OriginalDashboard:Dashboard,'/client/login':Login,'/client/account':Account,'/client/help':Help,'/client/payments':Payments,'/client/notifications':Notifications,'/client/settings/gmail':Gmail,'/client/forgot-password':Forgot,'/client/verify-email':VerifyEmail,'/client/verify-phone':VerifyPhone,'/client/poa-signed':PoaSigned,'/client/agent-signup':AgentSignup};
 let view:any=pages[path]?React.createElement(pages[path]):path.includes('/client/cases/')?<Case/>:path.includes('/client/documents/')?<Document/>:path==='/client/agent'?<AgentLayout><AgentHome/></AgentLayout>:path==='/client/agent/submit'?<AgentLayout><AgentSubmit/></AgentLayout>:path==='/client/new-claim'?null:<NotFound/>;
 return <div className="source-portal" data-source-route={path}><ClientLayout>{view}</ClientLayout></div>;
}
function ReviewBar(){const path=usePathname();const [locale,setLocale]=useState(localStorage.getItem('delaypay.locale')||'en');const [state,setState]=useState(sessionStorage.getItem('preview.fixture-state')||'normal');const [diagnostic,setDiagnostic]=useState('');
 useEffect(()=>{const receive=(event:any)=>setDiagnostic('External service boundary: '+event.detail);addEventListener('preview-external',receive);return()=>removeEventListener('preview-external',receive);},[]);
 return <aside id="review-controls" aria-label="Mockup review controls"><div><a href="#/review">All existing pages ↗</a><span>Source-faithful preview · Sample services</span></div><div><label>Appearance <select aria-label="Appearance" value={appearance} onChange={event=>{const url=new URL(location.href);url.searchParams.set('appearance',event.target.value);location.href=url.href;}}><option value="redesign">Redesigned</option><option value="original">Original</option></select></label><label>Language <select aria-label="Review language" value={locale} onChange={event=>{const next=event.target.value;localStorage.setItem('delaypay.locale',next);fixtureState.profile.preferredLanguage=next;setLocale(next);if(/^\/(en|he|ar|ru)(?:\/|$)/.test(path))navigate(path.replace(/^\/(en|he|ar|ru)/,'/'+next));else location.reload();}}>{['en','he','ar','ru'].map(l=><option key={l}>{l}</option>)}</select></label><label>Service fixture <select aria-label="Service fixture" value={state} onChange={event=>{setState(event.target.value);sessionStorage.setItem('preview.fixture-state',event.target.value);location.reload();}}>{['normal','empty','error','loading','unavailable','connected'].map(x=><option key={x}>{x}</option>)}</select></label><button onClick={()=>{setDiagnostic(`${requests.length} intercepted requests. No live service was called.`);}}>Diagnostics</button></div>{diagnostic&&<output onClick={()=>setDiagnostic('')}>{diagnostic} ×</output>}</aside>;
}
function App(){const path=usePathname();return <><div id="product-content"><Boundary key={path}><Suspense fallback={null}><Product/></Suspense></Boundary></div>{reviewMode&&<ReviewBar/>}</>;}
document.addEventListener('click',event=>{const a=(event.target as Element)?.closest('a');if(!a||event.defaultPrevented||a.target==='_blank')return;const raw=a.getAttribute('href')||'';if(raw.startsWith('#/')||raw==='#')return;if(raw.startsWith('#')){event.preventDefault();document.querySelector(raw)?.scrollIntoView({behavior:'smooth'});return;}try{const url=new URL(raw,location.href);if(['delaypay.co.il','www.delaypay.co.il','portal.delaypay.co.il'].includes(url.hostname)||url.origin===location.origin&&url.pathname.startsWith('/client')){event.preventDefault();navigate(url.pathname+url.search);}else if(['mailto:','tel:'].includes(url.protocol)||url.hostname==='wa.me'){event.preventDefault();dispatchEvent(new CustomEvent('preview-external',{detail:raw}));}}catch{}});
(window as any).__preview={fixtureState,requests,current,navigate,portalRoutes};
const adaptAssets=()=>document.querySelectorAll<HTMLMediaElement>('img[src^="/"],video[src^="/"],source[src^="/"]').forEach(el=>{const src=el.getAttribute('src')!;if(!src.startsWith('//'))el.setAttribute('src','.'+src);});
new MutationObserver(adaptAssets).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
createRoot(document.getElementById('root')!).render(<App/>);

import './appearance/help-center.css';
import './appearance/shared-surfaces.css';
import {surfaceVariables} from './appearance/surface-tokens';

import './appearance/all-pages.css';

import './appearance/airplane-intake.css';

import "./appearance/footer-alignment.css";

import "./appearance/site-consistency.css";
