import { PREVIEW_SIGNING_LINK } from "../draft/poa-display-copy";
import {ageAtFlight} from '@snapshot/lib/claims/passenger-age';
import {documentPassengers,passengerDocumentCoverage} from '@snapshot/lib/claims/passenger-documents';
const now=Date.UTC(2026,10,12,8,30);
const passengers=documentPassengers({passengers:[{fullName:'Maya Levi'},{fullName:'Noam Levi'}]});
export const requests:any[]=[];
const fileUrl='./sample-document.svg';
export const fixtureState:any={
 profile:{email:'maya@example.test',displayName:'Maya Levi',phoneNumber:'+972500000000',emailVerified:true,phoneVerified:false,notificationsEmail:true,notificationsSMS:false,notificationsInApp:true,payoutComplete:false,preferredLanguage:localStorage.getItem('delaypay.locale')||'en',address:'',city:'',postalCode:'',country:'IL',nationalIdMasked:'•••••••••',passportMasked:'••••••••',ibanMasked:'',ibanHolderName:''},
 cases:[{id:'sample-case',caseId:'DP-24081',status:'AwaitingDocuments',clientName:'Maya Levi',airline:'Lufthansa',flightNumber:'LH 691',departureDate:'2026-11-02',origin:'TLV',destination:'FRA',createdAt:now-5*86400000,updatedAt:now-86400000,passengerCount:2,passengers,customerDocuments:[],completion:50,missingItems:[],activity:[],readinessStatus:'not_ready',readinessScore:40,compensationDisplay:{amount:800,currency:'EUR',confirmed:false},compensationAmount:800,compensationCurrency:'EUR',delayHours:4,disruptionType:'delayed',bookingReference:'DEMO81',airlineStatus:{stage:'documents',label:''},financialStatus:null},
 {id:'sample-paid',caseId:'DP-23964',status:'Paid',clientName:'Maya Levi',airline:'El Al',flightNumber:'LY 315',departureDate:'2026-10-15',origin:'TLV',destination:'LHR',createdAt:now-20*86400000,updatedAt:now-2*86400000,passengerCount:1,passengers:passengers.slice(0,1),customerDocuments:[],completion:100,missingItems:[],activity:[],readinessStatus:'ready',compensationDisplay:{amount:400,currency:'EUR',confirmed:true},compensationAmount:400,compensationCurrency:'EUR'}],
 messages:[], callbacks:[], notifications:[], invoices:[{id:'sample-invoice',caseId:'DP-23964',amount:400,currency:'EUR',feeCurrency:'EUR',successFeePercentage:25,successFeeAmount:118,vatApplicable:true,netAmount:282,status:'pending',createdAt:now-86400000,dueDate:now+7*86400000,paymentUrl:'./provider-preview.html?kind=payment'}],gmail:{connected:false},poa:false,uploads:0
};
// Reference suggestions are local examples for the mockup, not live flight schedules.
const previewAirlines = [
 {airline:"Lufthansa",iata:"LH",nameHe:"לופטהנזה"}, {airline:"El Al",iata:"LY",nameHe:"אל על"},
 {airline:"British Airways",iata:"BA",nameHe:"בריטיש איירווייז"}, {airline:"Air France",iata:"AF",nameHe:"אייר פראנס"},
 {airline:"KLM",iata:"KL",nameHe:"קיי אל אם"}, {airline:"Turkish Airlines",iata:"TK",nameHe:"טורקיש איירליינס"},
 {airline:"Ryanair",iata:"FR",nameHe:"ריינאייר"}, {airline:"Wizz Air",iata:"W6",nameHe:"וויז אייר"},
];
const previewFlights = [
 {flightNumber:"LH691",airline:"Lufthansa",airlineIata:"LH",origin:"TLV",destination:"FRA",originIata:"TLV",destinationIata:"FRA",originName:"Tel Aviv",destinationName:"Frankfurt"},
 {flightNumber:"LY315",airline:"El Al",airlineIata:"LY",origin:"TLV",destination:"LHR",originIata:"TLV",destinationIata:"LHR",originName:"Tel Aviv",destinationName:"London Heathrow"},
];
function previewFlightResults(query:string) { const needle=query.replace(/\s/g,"").toLowerCase(); return previewFlights.filter(f=>f.flightNumber.toLowerCase().includes(needle)); }
function json(value:any,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}
function bodyOf(init:RequestInit){if(typeof init.body==='string'){try{return JSON.parse(init.body);}catch{}}return {};}
function coverage(c:any){return {...c,passengerDocuments:passengerDocumentCoverage({passengers:c.passengers,passengerCount:c.passengerCount,customerDocuments:c.customerDocuments})};}
export function installFixtures(){
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(input:any,init:any={})=>{
  const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:String(input),location.href);const method=init.method||input?.method||'GET';
  // Windows file URLs resolve /api to /C:/api; keep sample transport local.
  const path=url.pathname.replace(/^\/[A-Za-z]:\/api\//,'/api/');
  if(!path.startsWith('/api/')){
   if(url.origin===location.origin||url.protocol==='blob:'||url.protocol==='data:')return nativeFetch(input,init);
   throw new Error('Preview external service blocked: '+url.hostname);
  }
  const body=bodyOf(init);requests.push({path,method,body:typeof init.body==='string'?body:init.body instanceof FormData?'FormData':null});
  window.dispatchEvent(new Event('preview-request'));
  const state=sessionStorage.getItem('preview.fixture-state')||'normal';
  if(state==='error'&&method==='GET'&&!path.includes('/auth/'))return json({ok:false,error:'preview_transport_failure'},503);
  if(state==='loading'&&method==='GET')return new Promise((_,reject)=>init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
  if(path==='/api/ref/airlines') { const q=(url.searchParams.get('q')??'').trim().toLowerCase();return json({ok:true,results:previewAirlines.filter(a=>[a.airline,a.iata,a.nameHe].some(v=>v.toLowerCase().includes(q)))}); }
  if(path==='/api/client/auth/methods')return json({ok:true,sms:true,smsEnabled:true,smsAvailable:true,methods:['email','sms']});
  if(path.includes('/auth/request-'))return json({ok:true});
  if(path.includes('/auth/verify-'))return body.code==='246810'?json({ok:true,customToken:'preview-token',isNewCustomer:false}):json({ok:false,code:'INVALID_CODE'},400);
  if(path==='/api/client/overview')return json({ok:true,overview:{cases:state==='empty'?[]:fixtureState.cases.map(coverage),items:[]}});
  if(path==='/api/client/profile'){
   if(method==='PATCH'||method==='POST'){Object.assign(fixtureState.profile,body);return json({ok:true,profile:fixtureState.profile});}
   return json({ok:true,profile:fixtureState.profile});
  }
  if(path==='/api/client/intake-passengers'){
   if(fixtureState.passengerSaveFailure)return json({ok:false,error:'preview_passenger_save_failed'},503);
   fixtureState.userProfiles??=[];
   const list=(body.passengers??[]).map((p:any,i:number)=>{
    const minor=(ageAtFlight(p.dateOfBirth,body.departureDate||'2026-11-18')??99)<18;const id=p.id||'passenger-'+crypto.randomUUID();let user=fixtureState.userProfiles.find((u:any)=>u.passengerId===id||i===0&&!minor&&u.userId==='preview-user');
    if(!user){user={userId:i===0&&!minor?'preview-user':'sample-user-'+crypto.randomUUID(),passengerId:id,accountStatus:minor?'guardian_managed':i===0?'active':'pending_verification'};fixtureState.userProfiles.push(user);}
    Object.assign(user,{guardianUserId:minor?'preview-user':undefined,fullName:p.fullName,dateOfBirth:p.dateOfBirth,email:p.email??'',phone:p.phone??''});
    return {...p,id,userId:user.userId,accountStatus:user.accountStatus};
   });return json({ok:true,passengers:list});
  }
  if(path==='/api/client/quick-claim'){
   if(fixtureState.passengerSaveFailure)return json({ok:false,error:'preview_passenger_save_failed'},503);
   const existing = method === 'PATCH' ? fixtureState.cases.find((item: any) => item.id === body.caseDocId) : null;
   if (method === 'PATCH' && !existing) return json({ok:false,error:'not_found'},404);
   const id = existing?.id ?? 'sample-new-' + fixtureState.cases.length;
   fixtureState.userProfiles??=[];
   const roster=body.passengers||[{fullName:body.clientName||'Maya Levi'}];
   const pp=documentPassengers({passengers:roster}).map((p:any,i:number)=>{const raw=roster[i]??{};const minor=(ageAtFlight(raw.dateOfBirth,body.departureDate||'2026-11-18')??99)<18;let user=fixtureState.userProfiles.find((u:any)=>u.passengerId===(raw.id??p.id)||i===0&&!minor&&u.userId==='preview-user');if(!user){user={userId:i===0&&!minor?'preview-user':'sample-user-'+crypto.randomUUID(),passengerId:raw.id??p.id,accountStatus:minor?'guardian_managed':i===0?'active':'pending_verification'};fixtureState.userProfiles.push(user);}Object.assign(user,{guardianUserId:minor?'preview-user':undefined,fullName:raw.fullName,dateOfBirth:raw.dateOfBirth,email:raw.email??'',phone:raw.phone??''});return {...raw,...p,userId:user.userId,accountStatus:user.accountStatus};});
   const passengerIds = new Set(pp.map((person: any) => person.id));
   const latestScans = new Map<string, any>();
   for (const scan of fixtureState.scanDrafts ?? []) {
    if (passengerIds.has(scan.passengerId)) latestScans.set(scan.passengerId + ':' + scan.documentKind, scan);
   }
   const scannedDocuments = Array.from(latestScans.values(), scan => {
    const owners = (scan.passengerIds ?? []).filter((id: string) => passengerIds.has(id));
    const hasFlightDetails = ['flightNumber', 'origin', 'destination', 'departureDate'].every(key => Boolean(scan.fields?.[key]));
    return {
     id: scan.id, fileName: scan.fileName, url: fileUrl, uploadedAt: now,
     documentKind: scan.documentKind === 'booking' ? 'e_ticket' : scan.documentKind,
     passengerIds: owners,
     coverageExcluded: owners.length === 0 || (scan.documentKind === 'booking' && !hasFlightDetails),
    };
   });
   if (existing) {
    const flightKeys = ['clientName','airline','flightNumber','departureDate','origin','destination','bookingReference','ticketNumber'];
    const peopleKey = (people: any[]) => JSON.stringify(people.map(p => [p.id,p.fullName,p.dateOfBirth,p.guardianConfirmed]));
    const signingChanged = [...flightKeys, 'disruptionType'].some(key => existing[key] !== body[key]) ||
     peopleKey(existing.passengers ?? []) !== peopleKey(pp);
    const otherDocuments = existing.customerDocuments.filter((doc: any) => !String(doc.id).startsWith('sample-scan-'));
    const { caseDocId: _caseDocId, ...details } = body;
    Object.assign(existing, details, {
     passengers: pp, passengerCount: pp.length, customerDocuments: [...scannedDocuments, ...otherDocuments],
     ocrReviewConfirmed: false,
     ocrReviewFields: Object.fromEntries(flightKeys.map(key => [key, body[key] ?? ''])),
     ...(signingChanged ? { previewPoaSigned: false } : {}),
    });
    return json({ok:true,caseDocId:id,caseId:existing.caseId,case:coverage(existing)});
   }
   fixtureState.cases.unshift({...fixtureState.cases[0],...body,id,caseId:'DP-DEMO-'+fixtureState.cases.length,passengers:pp,passengerCount:pp.length,customerDocuments:scannedDocuments,previewPoaSigned:false,status:'AwaitingDocuments',createdAt:now,activity:[]});
   return json({ok:true,caseDocId:id,caseId:fixtureState.cases[0].caseId});
  }
  const caseMatch=path.match(/^\/api\/client\/cases\/([^/]+)(.*)$/);
  if(caseMatch){const c=fixtureState.cases.find((x:any)=>x.id===caseMatch[1])||fixtureState.cases[0];const suffix=caseMatch[2];
   if(!suffix){if(method==='PATCH'&&fixtureState.reviewSaveFailure)return json({ok:false,error:'preview_review_save_failed'},503);if(method==='PATCH'&&body.previewOcrReview===true){
    const changedFlight = ['clientName','airline','flightNumber','departureDate','origin','destination','bookingReference','ticketNumber'].some(key=>typeof body[key]==='string' && body[key] !== (c[key] ?? ''));
    const people = (list: any[]) => JSON.stringify(list.map(p=>[p.id,p.fullName,p.dateOfBirth]));
    if (changedFlight || (Array.isArray(body.reviewedPassengers) && people(c.passengers ?? []) !== people(body.reviewedPassengers))) c.previewPoaSigned = false;
    for(const key of ['clientName','airline','flightNumber','departureDate','origin','destination','bookingReference','ticketNumber'])if(typeof body[key]==='string')c[key]=body[key];if(Array.isArray(body.reviewedPassengers)){c.passengers=body.reviewedPassengers.map((p:any)=>({...p,checked:undefined,ocrReviewConfirmed:true}));for(const p of c.passengers){const user=fixtureState.userProfiles?.find((u:any)=>u.userId===p.userId);if(user){user.fullName=p.fullName;user.dateOfBirth=p.dateOfBirth;}}}else if(typeof body.clientName==='string'&&c.passengers?.[0])c.passengers[0].fullName=body.clientName;c.ocrReviewConfirmed=true;c.ocrReviewFields=Object.fromEntries(['clientName','airline','flightNumber','departureDate','origin','destination','bookingReference','ticketNumber'].map(key=>[key,c[key]??'']));}return json({ok:true,case:coverage(c)});}
   if (suffix === '/preview-receipt-samples' && c.id === 'sample-case' && method === 'POST' && Array.isArray(body)) {
    const existing = new Set(c.customerDocuments.map((doc: any) => doc.id));
    c.customerDocuments.push(...body.filter(doc => doc.documentKind === 'receipt' && !existing.has(doc.id)));
    return json({ ok: true });
   }
   if(suffix==='/documents'){
    if (init.body instanceof FormData) {
     const form = init.body;
     const kind = String(form.get('documentKind') || 'other');
     const files = [...form.getAll('files'), ...form.getAll('file')].filter((file): file is File => file instanceof File);
     const replacesId = form.get('replacesReceiptId');
     const replaced = files.length === 1 && kind === 'pir'
      ? c.customerDocuments.find((doc: any) => doc.documentKind === 'pir' && !doc.storageMissing)
      : kind === 'receipt' && files.length === 1
       ? c.customerDocuments.find((doc: any) => doc.id === replacesId && doc.documentKind === 'receipt' && doc.receiptOcrOk === false)
       : undefined;
     if (replacesId && !replaced) return json({ ok: false, error: 'invalid_receipt_replacement' }, 400);
     const uploaded = files.map(file => {
      const sample = /(?:^|[^A-Z])(EUR|ILS|NIS|USD|GBP|€|£|\$)[ _-]?(\d+(?:[.,]\d{1,2})?)/i.exec(file.name);
      const token = sample?.[1]?.toUpperCase() ?? 'EUR';
      const aliases: Record<string, string> = { '€': 'EUR', '£': 'GBP', '$': 'USD', NIS: 'ILS' };
      const amount = sample ? Number(sample[2].replace(',', '.')) : 24.9;
      const pending = kind === 'receipt' && /pending/i.test(file.name);
      const readable = !/unreadable|no-ocr/i.test(file.name) && amount > 0;
      return {
       id: replaced?.id ?? 'sample-doc-' + (++fixtureState.uploads),
       fileName: file.name, documentKind: kind, passengerIds: form.getAll('passengerIds').map(String),
       uploadedAt: now, url: fileUrl, size: file.size, mimeType: file.type,
       ...(kind === 'receipt' ? {
        pendingReview: pending, receiptOcrOk: pending ? undefined : readable,
        receiptAmount: readable && !pending ? amount : null,
        receiptCurrency: readable && !pending ? (aliases[token] ?? token) : null,
       } : {}),
      };
     });
     if (replaced) {
      const revisions = kind === 'pir' ? (fixtureState.pirRevisions ??= []) : (fixtureState.receiptRevisions ??= []);
      revisions.push({ ...replaced, caseId: c.id });
      c.customerDocuments[c.customerDocuments.indexOf(replaced)] = uploaded[0];
     } else c.customerDocuments.push(...uploaded);
     return json({ ok: true, uploaded });
    }
    return json({ok:true,documents:c.customerDocuments});
   }
   if(suffix==='/messages'||suffix==='/chat'){if(method==='POST')fixtureState.messages.push({id:'msg-'+Date.now(),role:'customer',sender:'customer',text:body.text||body.message,body:body.text||body.message,createdAt:now,read:true});return json({ok:true,messages:fixtureState.messages,communicationId:fixtureState.messages.at(-1)?.id});}
   if(suffix==='/communications')return json({ok:true,communications:[],items:[]});
   if(suffix==='/callback-slots')return json({ok:true,slots:[{start:now+86400000,end:now+90000000,timezone:'Asia/Jerusalem',available:true}]});
   if(suffix==='/callback'){if(method==='POST')fixtureState.callbacks.push({id:'sample-callback',caseDocId:c.id,clientId:'preview-maya',requestedAt:now,requestedSlotStart:body.slotStart,requestedSlotEnd:body.slotStart+3600000,timezone:'Asia/Jerusalem',status:'pending',contactPhone:body.contactPhone,customerNote:body.customerNote,updatedAt:now});return json({ok:true,callback:null,request:fixtureState.callbacks.at(-1),requests:fixtureState.callbacks});}
   if(suffix.startsWith('/callback/')&&suffix.endsWith('/cancel')){fixtureState.callbacks=[];return json({ok:true});}
   if (suffix === '/poa') {
    if (method === 'POST' && body?.previewSign === true) c.previewPoaSigned = true;
    const isSigned = c.previewPoaSigned === true || fixtureState.poa === true;
    return json({ ok: true, status: isSigned ? 'signed' : 'pending', isSigned,
     signingLink: PREVIEW_SIGNING_LINK, poaUrl: PREVIEW_SIGNING_LINK });
   }
   if(suffix==='/poa/passengers'){const adults=c.passengers.slice(1).filter((p:any)=>(ageAtFlight(p.dateOfBirth,c.departureDate)??99)>=18);return json({ok:true,requiresPassengerPoa:adults.length>0,pendingCount:adults.length,signedCount:0,hasPrimaryContact:true,automationPaused:false,caseClosed:c.status==='Paid',passengers:adults.map((p:any)=>({passengerId:p.id,passengerName:p.fullName,status:'pending',signingLink:'https://app.easydo.co.il/forms/preview-only'}))});}
   if(suffix==='/read')return json({ok:true});
  }
  if(path==='/api/client/invoices')return json({ok:true,invoices:state==='empty'?[]:fixtureState.invoices});
  if(path.includes('/invoices/')&&path.endsWith('/pdf'))return json({ok:true,url:'./provider-preview.html?kind=invoice'});
  if(path.startsWith('/api/client/documents/')){
   const docs=fixtureState.cases.flatMap((c:any)=>c.customerDocuments);const d=docs.find((x:any)=>x.id===path.split('/').pop())||{id:'sample-document',fileName:'booking-confirmation.svg',documentKind:'e_ticket',uploadedAt:now,caseId:'sample-case',url:fileUrl,mimeType:'image/svg+xml',size:512};
   if(method==='DELETE')return json({ok:true});
   return json({ok:true,document:d});
  }
  if(path==='/api/client/notifications')return json({ok:true,notifications:state==='empty'?[]:fixtureState.notifications,unreadCount:0});
  if(path.endsWith('/notifications/subscribe'))return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('event: connected\ndata: {}\n\n'));init.signal?.addEventListener('abort',()=>{try{controller.close();}catch{}});}}),{headers:{'Content-Type':'text/event-stream'}});
  if(path.includes('/notifications/'))return json({ok:true});
  if(path==='/api/client/gmail/status')return state==='unavailable'?json({ok:false},404):json({ok:true,...fixtureState.gmail,...(state==='connected'?{connected:true,email:'maya@example.test',connectedAt:now-86400000,lastScanAt:now}:{} )});
  if(path==='/api/client/gmail/oauth-start')return json({ok:true,url:'./provider-preview.html?kind=gmail'});
  if(path==='/api/client/gmail/disconnect'){fixtureState.gmail={connected:false};return json({ok:true});}
  if(path==='/api/client/gmail/scan')return json({ok:true,candidates:[],scanned:0,total:0});
  if(path==='/api/client/gmail/import')return json({ok:true,imported:0});
  if(path==='/api/flights/suggest'){const results=previewFlightResults(url.searchParams.get('q')??'');return json({ok:true,results,suggestions:results,items:results,flights:results});}
  if(path==='/api/client/flight-check')return json({ok:true,result:{flightNumber:body.flightNumber||'LH 691',status:'landed',departureAirport:'TLV',arrivalAirport:'FRA',delayMinutes:240,airline:'Lufthansa'},flight:null});
  if(path==='/api/client/verified-compensation')return json({ok:true,verified:false,found:false});
  if(path==='/api/client/scan-drafts'){
   if(fixtureState.scanSaveFailure)return json({ok:false,error:'preview_scan_save_failed'},503);
   if(fixtureState.scanSaveDelay)await new Promise(resolve=>setTimeout(resolve,fixtureState.scanSaveDelay));
   const saved={id:'sample-scan-'+crypto.randomUUID(),documentKind:body.documentKind,fileName:body.fileName,fields:body.fields,passengerId:body.passengerId,passengerIds:body.passengerIds,savedAt:new Date().toISOString()};
   fixtureState.scanDrafts??=[];fixtureState.scanDrafts.push(saved);return json({ok:true,saved:true,...saved});
  }
  if(path==='/api/client/ocr-extract'){
   const requestedKind=init.body instanceof FormData?init.body.get('documentKind'):null;const fileName=init.body instanceof FormData?String((init.body.get('file')as File)?.name??''):'';const kind=requestedKind==='auto'?(/passport|identity|id-card/i.test(fileName)?'passport':/booking|reservation/i.test(fileName)?'booking':'boarding_pass'):requestedKind;
   const fields=kind==='passport'?{clientName:'Maya Cohen',dateOfBirth:'1990-04-12',passportNumber:'DEMO12345',nationality:'ISR',expiryDate:'2031-04-12'}:kind==='booking'?{clientName:'Maya Cohen',airline:'Lufthansa',flightNumber:'LH691',origin:'TLV',destination:'FRA',departureDate:'2026-11-02',bookingReference:'DEMO81',ticketNumber:'DEMO-123',passengerCount:2,passengers:[{fullName:'Maya Cohen',dateOfBirth:'1990-04-12',type:'adult'},{fullName:'Noam Cohen',dateOfBirth:'2011-08-21',type:'child'}]}:{clientName:'Maya Cohen',airline:'Lufthansa',flightNumber:'LH691',origin:'TLV',destination:'FRA',departureDate:'2026-11-02',bookingReference:'DEMO81'};
   return fixtureState.ocrFailure?json({ok:false,error:'preview_ocr_unavailable'},503):json(fixtureState.ocrResult??{ok:true,found:true,fields,confidence:0.9});
  }
  if(path==='/api/client/me/export')return json({ok:true,profile:fixtureState.profile,cases:fixtureState.cases});
  if(path.includes('send-phone-verification'))return json({ok:true,phone:fixtureState.profile.phoneNumber,canSend:true});
  if(path.includes('verify-email')||path.includes('verify-phone')||path.includes('resend-verification'))return json({ok:true});
  if(path==='/api/client/me')return json({ok:true,user:{uid:'preview-maya',roles:[]},role:'customer'});
  if(path==='/api/client/support'||path.startsWith('/api/auth/')||path.includes('/keep-signed-in')||path.includes('/marketing/')||path.includes('/events'))return json({ok:true});
  // Unknown endpoints are visible in diagnostics and fail rather than claiming success.
  console.warn('[preview unhandled API]',method,path);return json({ok:false,error:'preview_endpoint_not_configured'},501);
 };
}



