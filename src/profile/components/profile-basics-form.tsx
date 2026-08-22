"use client";

import Link from "next/link";
import { useActionState } from "react";
import { initialProfileFormState, type ProfileFormState } from "../types";
import styles from "@/styles/pages/profile.module.css";

type ProfileBasicsFormProps = {
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  profile: {
    displayName: string | null;
    contactEmail: string | null;
    phone: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    website: string | null;
    headline: string | null;
    careerDirection: string | null;
  };
};

type BasicsField = {
  name: keyof ProfileBasicsFormProps["profile"];
  label: string;
  type?: "text" | "email" | "url" | "tel";
  autocomplete?: string;
};

const fields: readonly BasicsField[] = [
  { name: "displayName", label: "Name", autocomplete: "name" },
  { name: "contactEmail", label: "Contact email", type: "email", autocomplete: "email" },
  { name: "phone", label: "Phone", type: "tel", autocomplete: "tel" },
  { name: "country", label: "Country", autocomplete: "country-name" },
  { name: "region", label: "State, province, or region", autocomplete: "address-level1" },
  { name: "city", label: "City or locality", autocomplete: "address-level2" },
  { name: "website", label: "Personal website", type: "url", autocomplete: "url" },
  { name: "headline", label: "Professional headline" },
];

export function ProfileBasicsForm({ action, profile }: ProfileBasicsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProfileFormState);

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? <div className={styles.errorSummary} role="alert">{state.message}</div> : null}
      <div className={styles.formFields}>
        {fields.map((field) => {
          const errors = state.fieldErrors?.[field.name];
          return (
            <div className={styles.field} key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <input
                aria-describedby={errors?.length ? `${field.name}-error` : undefined}
                aria-invalid={Boolean(errors?.length)}
                autoComplete={field.autocomplete}
                defaultValue={state.values?.[field.name] ?? profile[field.name] ?? ""}
                id={field.name}
                name={field.name}
                type={field.type ?? "text"}
              />
              {errors?.length ? <p className={styles.fieldError} id={`${field.name}-error`}>{errors.join(" ")}</p> : null}
            </div>
          );
        })}
        <div className={styles.fieldWide}>
          <label htmlFor="careerDirection">Career direction</label>
          <textarea
            aria-describedby="careerDirection-hint"
            defaultValue={state.values?.careerDirection ?? profile.careerDirection ?? ""}
            id="careerDirection"
            name="careerDirection"
            rows={6}
          />
          <p className={styles.fieldHint} id="careerDirection-hint">
            Record the kind of work, field, level, or direction you are pursuing. Leave it blank if it is not settled.
          </p>
        </div>
      </div>
      <div className={styles.formActions}>
        <button
          className={styles.primaryButton}
          disabled={pending}
          name="intent"
          type="submit"
          value="continue"
        >
          {pending ? "Saving..." : "Save and continue"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={pending}
          name="intent"
          type="submit"
          value="stay"
        >
          Save only
        </button>
        <Link className={styles.quietLink} href="/profile">Cancel</Link>
      </div>
    </form>
  );
}
