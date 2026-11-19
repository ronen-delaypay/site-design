import type {QuickClaimFormData} from '@/components/client/QuickClaimForm';
import type {ExtractedClaimFields} from '@/lib/client/ocr-extract-fields';
export const scanKeys=['clientName','airline','flightNumber','departureDate','origin','destination','bookingReference','ticketNumber'] as const;
const nameKey = (name: string) => (name ?? '').normalize('NFKC').toLocaleLowerCase('en')
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

type OcrPerson = { fullName?: string; passengerName?: string; dateOfBirth?: string };
type ScanFields = ExtractedClaimFields & { passengers?: OcrPerson[]; dateOfBirth?: string };

export function matchBookingPassengers(form: QuickClaimFormData, fields: ScanFields, edited: ReadonlySet<string>) {
  const roster = [...form.passengers];
  const names = (Array.isArray(fields.passengers) ? fields.passengers : []).slice(0, 20).flatMap(person => {
    const rawName = person?.fullName ?? person?.passengerName;
    const fullName = typeof rawName === "string" ? rawName.trim() : "";
    if (!fullName || !nameKey(fullName)) return [];
    const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(person.dateOfBirth ?? '') ? person.dateOfBirth : undefined;
    return [{ fullName, dateOfBirth }];
  });
  const originalRoster = [...roster];
  const passengerIds: string[] = [];

  for (const person of names) {
    const key = nameKey(person.fullName);
    const sameName = names.filter(other => nameKey(other.fullName) === key);
    if (sameName.length > 1 && (!person.dateOfBirth ||
        sameName.filter(other => other.dateOfBirth === person.dateOfBirth).length > 1)) continue;
    const matches = originalRoster.filter(row => nameKey(row.fullName) === key &&
      (!person.dateOfBirth || !row.dateOfBirth || row.dateOfBirth === person.dateOfBirth));
    const exact = matches.filter(row => person.dateOfBirth && row.dateOfBirth === person.dateOfBirth);
    if (exact.length > 1 || (exact.length === 0 && matches.length > 1)) continue;
    const match = exact[0] ?? matches[0];
    if (match?.id && passengerIds.includes(match.id)) continue;
    const index = match ? roster.indexOf(match) : roster.findIndex(row => row.id &&
      !passengerIds.includes(row.id) && !row.fullName?.trim() &&
      !edited.has(`passenger:${row.id}:fullName`) &&
      (!row.dateOfBirth || row.dateOfBirth === person.dateOfBirth));
    if (index < 0 && roster.length >= 20) continue;
    const current = roster[index];
    const id = current?.id ?? crypto.randomUUID();
    const updated = {
      ...current,
      id,
      fullName: current?.fullName || person.fullName,
      dateOfBirth: current?.dateOfBirth || (!edited.has(`passenger:${id}:dateOfBirth`) ? person.dateOfBirth ?? '' : ''),
      guardianConfirmed: current?.guardianConfirmed ?? false,
    };
    if (index >= 0) roster[index] = updated;
    else roster.push(updated);
    passengerIds.push(id);
  }
  const primaryName = roster[0]?.fullName;
  const clientName = primaryName && !form.clientName.trim() && !edited.has('clientName') ? primaryName : form.clientName;
  return { form: { ...form, clientName, passengers: roster, passengerCount: String(roster.length) }, passengerIds };
}

export function mergeScanIntoForm(previous:QuickClaimFormData,fields:ScanFields,edited:ReadonlySet<string>,passengerId?:string,kind?:string){
 const next={...previous};
 const namedBooking=kind==='booking' && Boolean(fields.passengers?.length);
 const index=Math.max(0,previous.passengers.findIndex(p=>p.id===passengerId));
 const protectedField=(field:string)=>edited.has(`passenger:${passengerId}:${field}`);
 for(const key of scanKeys){const value=fields[key];if(typeof value==='string'&&value.trim()&&!edited.has(key)&&(key!=='clientName'||!namedBooking&&index===0&&!protectedField('fullName')))next[key]=value.trim();}
 const currentId=passengerId??(next.passengers[index] as any)?.id;const personIndex=Math.max(0,next.passengers.findIndex((p:any)=>p.id===currentId));
 if(fields.clientName?.trim()&&!namedBooking&&!protectedField('fullName')&&(personIndex!==0||!edited.has('passengerName')&&!edited.has('clientName')))next.passengers=next.passengers.map((p:any,i:number)=>i===personIndex?{...p,fullName:fields.clientName!.trim()}:p);
 const dob=(fields as any).dateOfBirth;if(!namedBooking&&typeof dob==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(dob)&&!protectedField('dateOfBirth')&&(personIndex!==0||!edited.has('passengers[0].dateOfBirth')))next.passengers=next.passengers.map((p:any,i:number)=>i===personIndex?{...p,dateOfBirth:dob}:p);
 return next;
}
