import type {CSSProperties} from "react";
import {colors} from "@/lib/client/portal-theme";
import type {Translator} from "@/lib/i18n";
import {Input} from "@/components/client/Input";
import {ageAtFlight} from "@/lib/claims/passenger-age";
import {makeEmptyPassenger,type PassengerDraft} from "@/components/client/QuickClaimForm";
import {useLocale} from "@/hooks/useLocale";
import {passengerText} from "./passenger-users";
import {BirthDateInput} from "./BirthDateInput";
export interface PassengerListEditorProps {
  passengers: PassengerDraft[];
  departureDate: string;
  /** Pre-fills the first passenger's full name once the client types their own name. */
  primaryClientName: string;
  onChange: (next: PassengerDraft[]) => void;
  tr: Translator;
  rtl: boolean;
  allowAdd?: boolean;
}

export function PassengerListEditor({
  passengers,
  departureDate,
  primaryClientName,
  onChange,
  tr,
  rtl,
  allowAdd = true,
}: PassengerListEditorProps) {
  // Guarantee at least one passenger (the primary). A zero-length list would
  // leave the submit guard with no name to reconcile OCR reads against.
  const [locale]=useLocale();const text=passengerText(locale);
  const list = passengers.length === 0 ? [makeEmptyPassenger()] : passengers;

  const update = (index: number, patch: Partial<PassengerDraft>) => {
    const next = list.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  };
  const addPassenger = () => onChange([...list, {...makeEmptyPassenger(),id:crypto.randomUUID()} as any]);
  const removePassenger = (index: number) => {
    if (list.length <= 1) return; // never drop the primary passenger
    onChange(list.filter((_, i) => i !== index));
  };

  const containerStyle: CSSProperties = {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: 10,
    background: colors.white,
  };
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    background: colors.borderLight ? `${colors.borderLight}22` : "transparent",
  };
  const headerRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  };
  const removeButtonStyle: CSSProperties = {
    background: "transparent",
    border: "none",
    color: colors.danger,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    padding: "4px 8px",
  };
  const addButtonStyle: CSSProperties = {
    alignSelf: rtl ? "flex-end" : "flex-start",
    background: "transparent",
    border: `1px dashed ${colors.borderLight}`,
    color: colors.primary,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    padding: "8px 12px",
    borderRadius: 8,
  };

  return (
    <section style={containerStyle} data-testid="quick-claim-passengers">
      <header style={headerRowStyle}>
        <strong>{tr("claim.passengers.title")}</strong>
        <span style={{ fontSize: 13, color: colors.textMuted }}>
          {tr("claim.passengers.countHint", { count: list.length })}
        </span>
      </header>
      <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
        {tr("claim.passengers.description")}
      </p>

      {list.map((p, index) => {
        const age = ageAtFlight(p.dateOfBirth, departureDate);
        const isMinor = age !== null && age < 18;
        const label = tr(index === 0 ? "claim.passengers.primaryLabel" : "claim.passengers.additionalLabel", {
          index: index + 1,
        });
        // Suggest the primary client's name for passenger #1 only, and only as
        // a placeholder — never overwrite what the customer has typed.
        const namePlaceholder =
          index === 0 && !p.fullName.trim() && primaryClientName.trim()
            ? primaryClientName
            : tr("claim.passengers.fullNamePlaceholder");

        return (
          <div key={index} className="dp-passenger-editor-row" style={rowStyle} data-testid={`quick-claim-passenger-${index}`}>
            <div style={{ gridColumn: "1 / -1", ...headerRowStyle }}>
              <strong style={{ fontSize: 14 }}>{label}</strong>
              {list.length > 1 && index > 0 && (
                <button
                  type="button"
                  onClick={() => removePassenger(index)}
                  style={removeButtonStyle}
                  data-testid={`quick-claim-passenger-${index}-remove`}
                  aria-label={tr("claim.passengers.remove")}
                >
                  {tr("claim.passengers.remove")}
                </button>
              )}
            </div>
            <Input
              data-testid={`quick-claim-passenger-${index}-name`}
              name={`passengers[${index}].fullName`}
              label={tr("claim.passengers.fullName")}
              placeholder={namePlaceholder}
              defaultValue={p.fullName}
              onChange={(event) => update(index, { fullName: event.target.value })}
            />
            <BirthDateInput
              data-testid={`quick-claim-passenger-${index}-dob`}
              name={`passengers[${index}].dateOfBirth`}
              label={tr("claim.passengers.dob")}
              value={p.dateOfBirth}
              onValueChange={(dateOfBirth) => update(index, { dateOfBirth })}
            />
            <Input data-testid={`quick-claim-passenger-${index}-email`} name={`passengers[${index}].email`} type="email" label={text.email} value={(p as any).email??""} onChange={event=>update(index,{email:event.target.value} as any)} />
            <Input data-testid={`quick-claim-passenger-${index}-phone`} name={`passengers[${index}].phone`} type="tel" label={text.phone} value={(p as any).phone??""} onChange={event=>update(index,{phone:event.target.value} as any)} />
            {(p as any).userId&&<p className="dp-passenger-account-status" data-testid={`passenger-user-${index}`} data-user-id={(p as any).userId} style={{gridColumn:"1 / -1",margin:0}}>{(p as any).accountStatus==="active"?text.linked:(p as any).accountStatus==="guardian_managed"?text.guardian:text.pending}</p>}
            {isMinor && (
              <label
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 13,
                  color: colors.text,
                  padding: 8,
                  borderRadius: 8,
                  background: colors.warningBg,
                }}
                data-testid={`quick-claim-passenger-${index}-guardian`}
              >
                <input
                  type="checkbox"
                  checked={p.guardianConfirmed}
                  onChange={(event) => update(index, { guardianConfirmed: event.target.checked })}
                  style={{ marginTop: 2 }}
                  data-testid={`quick-claim-passenger-${index}-guardian-checkbox`}
                />
                <span>{tr("claim.passengers.guardianConfirm", { name: p.fullName || tr("claim.passengers.thisMinor") })}</span>
              </label>
            )}
          </div>
        );
      })}

      {allowAdd && list.length < 20 && (
        <button
          type="button"
          onClick={addPassenger}
          style={addButtonStyle}
          data-testid="quick-claim-passengers-add"
        >
          {tr("claim.passengers.add")}
        </button>
      )}
    </section>
  );
}
