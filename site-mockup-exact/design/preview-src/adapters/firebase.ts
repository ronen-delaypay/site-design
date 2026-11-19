import {auth} from './auth';export async function prepareClientAuth(){return auth;}export function getMissingClientFirebaseKeys(){return [];}export function getClientAuth(){return auth;}export {auth};
export {onAuthStateChanged} from './auth';
