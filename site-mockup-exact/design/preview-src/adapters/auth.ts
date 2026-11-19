const listeners=new Set<(user:any)=>void>();
const identity={uid:'preview-maya',email:'maya@example.test',displayName:'Maya Levi',emailVerified:true,phoneNumber:'+972500000000',getIdToken:async()=> 'preview-service-token',reload:async()=>{}};
let signedIn=!location.hash.includes('/client/login');
export const auth:any={get currentUser(){return signedIn?identity:null;},useDeviceLanguage:()=>{}};
export function onAuthStateChanged(_auth:any,callback:any){listeners.add(callback);queueMicrotask(()=>callback(auth.currentUser));return()=>listeners.delete(callback);}
export async function signInWithCustomToken(){signedIn=true;listeners.forEach(cb=>cb(identity));return {user:identity};}
export async function signOut(){signedIn=false;listeners.forEach(cb=>cb(null));}
export function setPreviewAuth(value:boolean){signedIn=value;}
export const browserLocalPersistence={type:'LOCAL'},browserSessionPersistence={type:'SESSION'},inMemoryPersistence={type:'NONE'};
export async function setPersistence(){}export function getAuth(){return auth;}export async function updateProfile(){}export async function sendEmailVerification(){}export async function sendPasswordResetEmail(){}
