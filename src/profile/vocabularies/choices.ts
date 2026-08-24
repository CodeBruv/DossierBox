/**
 * Closed and semi-closed answer sets for dossier fields.
 *
 * The rule this file exists to enforce: if the answer to a question is reasonably
 * standard anywhere in the world, the user picks it rather than types it. Typing is
 * reserved for the things only they can tell us — a role, an employer, what they did.
 *
 * Every set that could plausibly fail someone keeps a controlled custom path, because a
 * global product that only understands the qualifications of five countries is a worse
 * product than one that admits it does not know. Custom values are stored verbatim; the
 * curated options exist to make the common case one tap, not to constrain the record.
 */

export type ChoiceOption = {
  value: string;
  label: string;
};

/**
 * Sentinel for the "something else" branch of a select. It is never stored: choosing it
 * reveals a text input which takes over the field's form name, so what reaches the server
 * is either a curated value or the user's own words, and never this marker.
 */
export const CUSTOM_CHOICE = "__custom";

/* Dates --------------------------------------------------------------------- */

/**
 * Months by name. Stored as the integer the columns already hold, so nothing migrates,
 * but nobody has to know whether their course started in month 9 or month 10.
 */
export const monthOptions: readonly ChoiceOption[] = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

/* Experience ---------------------------------------------------------------- */

/**
 * How the work was arranged. `full-time` is the common case and prints nothing in a
 * document — stating it adds no information — while every other value is a qualifier a
 * reader wants ("Contract", "Internship", "Volunteer").
 *
 * `employment` is retained by the stored union but deliberately absent here: rows created
 * before this list existed still read and render, and new entries get the more precise
 * answer instead of inheriting an ambiguity.
 */
export const experienceTypeOptions: readonly ChoiceOption[] = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "freelance", label: "Freelance" },
  { value: "internship", label: "Internship" },
  { value: "volunteering", label: "Volunteer" },
  { value: "apprenticeship", label: "Apprenticeship" },
  { value: "employment", label: "Employment" },
  { value: "other", label: "Other" },
];

/** Offered when creating; `employment` is legacy and stays out of the picker. */
export const offeredExperienceTypeOptions: readonly ChoiceOption[] = experienceTypeOptions.filter(
  (option) => option.value !== "employment",
);

/** Where the work happened, for roles whose location is an arrangement rather than a place. */
export const workArrangementOptions: readonly ChoiceOption[] = [
  { value: "On-site", label: "On-site" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "Remote", label: "Remote" },
];

/* Languages ----------------------------------------------------------------- */

/**
 * Proficiency as employers phrase it, coarse enough that a person can place themselves
 * without a test result. CEFR levels are offered alongside because much of Europe states
 * them, and refusing to accept "C1" would make the field wrong for that market.
 */
export const languageProficiencyOptions: readonly ChoiceOption[] = [
  { value: "Native", label: "Native" },
  { value: "Bilingual", label: "Bilingual" },
  { value: "Fluent", label: "Fluent" },
  { value: "Professional working proficiency", label: "Professional working proficiency" },
  { value: "Limited working proficiency", label: "Limited working proficiency" },
  { value: "Conversational", label: "Conversational" },
  { value: "Basic", label: "Basic" },
  { value: "C2 (CEFR)", label: "C2 — Mastery (CEFR)" },
  { value: "C1 (CEFR)", label: "C1 — Advanced (CEFR)" },
  { value: "B2 (CEFR)", label: "B2 — Upper intermediate (CEFR)" },
  { value: "B1 (CEFR)", label: "B1 — Intermediate (CEFR)" },
  { value: "A2 (CEFR)", label: "A2 — Elementary (CEFR)" },
  { value: "A1 (CEFR)", label: "A1 — Beginner (CEFR)" },
];

/* Education ----------------------------------------------------------------- */

/**
 * Level of study, in ascending order, named so the same option is recognisable across
 * education systems. It is not a mapping to any single national framework — it is the
 * vocabulary a reader in any market can interpret.
 *
 * Deliberately not required, and deliberately does not assume a university degree: school
 * leaving certificates, apprenticeships and vocational awards are first-class answers.
 */
export const educationLevelOptions: readonly ChoiceOption[] = [
  { value: "Primary education", label: "Primary education" },
  { value: "Secondary school", label: "Secondary school" },
  { value: "School leaving certificate", label: "School leaving certificate" },
  { value: "Vocational qualification", label: "Vocational qualification" },
  { value: "Apprenticeship", label: "Apprenticeship" },
  { value: "Certificate", label: "Certificate" },
  { value: "Diploma", label: "Diploma" },
  { value: "Higher National Diploma", label: "Higher National Diploma" },
  { value: "Associate degree", label: "Associate degree" },
  { value: "Foundation degree", label: "Foundation degree" },
  { value: "Bachelor's degree", label: "Bachelor's degree" },
  { value: "Postgraduate certificate", label: "Postgraduate certificate" },
  { value: "Postgraduate diploma", label: "Postgraduate diploma" },
  { value: "Master's degree", label: "Master's degree" },
  { value: "Professional doctorate", label: "Professional doctorate" },
  { value: "Doctorate (PhD)", label: "Doctorate (PhD)" },
  { value: "Postdoctoral", label: "Postdoctoral research" },
];

/**
 * Grading systems, chosen first so the grade field can then ask exactly one question.
 * Showing a classification list, three GPA scales and a percentage box at once is how a
 * form ends up asking every user about six systems that do not apply to them.
 */
export const gradingSystemOptions: readonly ChoiceOption[] = [
  { value: "classification", label: "Degree classification (First, Second Class, …)" },
  { value: "credit", label: "Diploma or credit grade (Distinction, Credit, …)" },
  { value: "gpa-4", label: "GPA out of 4.0" },
  { value: "gpa-5", label: "GPA out of 5.0" },
  { value: "gpa-10", label: "GPA out of 10.0" },
  { value: "percentage", label: "Percentage" },
  { value: "letter", label: "Letter grade" },
  { value: "passfail", label: "Pass / fail" },
];

/**
 * The control the grade field becomes once a system is chosen. A scale is a bounded
 * number; a classification is a closed list; anything we have not modelled is text the
 * user owns.
 */
export type GradeControl =
  | { readonly kind: "options"; readonly options: readonly ChoiceOption[] }
  | { readonly kind: "number"; readonly max: number; readonly step: string; readonly hint: string }
  | { readonly kind: "text"; readonly hint: string };

const asOptions = (values: readonly string[]): GradeControl => ({
  kind: "options",
  options: values.map((value) => ({ value, label: value })),
});

export const gradeControls: Readonly<Record<string, GradeControl>> = {
  classification: asOptions([
    "First Class",
    "Second Class Upper",
    "Second Class Lower",
    "Third Class",
    "Pass",
  ]),
  credit: asOptions(["Distinction", "Upper Credit", "Lower Credit", "Credit", "Merit", "Pass"]),
  "gpa-4": { kind: "number", max: 4, step: "0.01", hint: "Out of 4.0" },
  "gpa-5": { kind: "number", max: 5, step: "0.01", hint: "Out of 5.0" },
  "gpa-10": { kind: "number", max: 10, step: "0.01", hint: "Out of 10.0" },
  percentage: { kind: "number", max: 100, step: "0.1", hint: "Out of 100" },
  letter: asOptions(["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−", "D", "E", "F"]),
  passfail: asOptions(["Pass", "Fail"]),
};

/**
 * The control for a grading system, including the custom branch and the case where no
 * system has been chosen yet. Uses `Object.hasOwn` because the key arrives from stored
 * data and a plain lookup would answer for `constructor` and `toString`.
 */
export function gradeControlFor(gradingSystem: string | null | undefined): GradeControl | null {
  if (!gradingSystem) return null;
  if (Object.hasOwn(gradeControls, gradingSystem)) return gradeControls[gradingSystem] as GradeControl;
  return { kind: "text", hint: "Enter the grade exactly as your institution awarded it." };
}
