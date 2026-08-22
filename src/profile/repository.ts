import "server-only";

import { cache } from "react";
import { and, asc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/auth/database";
import {
  achievements,
  credentials,
  education,
  experiences,
  languages,
  memberships,
  profileLinks,
  profiles,
  profileSections,
  projects,
  publications,
  skills,
} from "./schema";
import type { ProfileSectionKey } from "./types";
import type {
  DossierAchievement,
  DossierCredential,
  DossierEducation,
  DossierExperience,
  DossierLanguage,
  DossierLink,
  DossierMembership,
  DossierProject,
  DossierPublication,
  DossierSkill,
  DossierSnapshot,
} from "./dossier";
import {
  evaluateDossierFoundation,
  type DossierFoundationReadiness,
  type EducationRecord,
  type ExperienceRecord,
  type ProjectRecord,
  type SkillRecord,
} from "./readiness";

type ProfileDefaults = {
  name: string | null;
  email: string | null;
};

/**
 * Section key → table. Declared once so counting, positioning and any future
 * cross-section read can be written as a single statement instead of ten.
 */
const sectionTables = {
  experience: experiences,
  education,
  projects,
  skills,
  credentials,
  achievements,
  languages,
  publications,
  memberships,
  links: profileLinks,
} as const;

const sectionKeys = Object.keys(sectionTables) as ProfileSectionKey[];

export async function getOrCreateProfile(userId: string, defaults: ProfileDefaults) {
  return loadOrCreateProfile(userId, defaults.name, defaults.email);
}

/**
 * Request-scoped memoization of the profile lookup.
 *
 * Every authenticated screen needs `profile.id` before it can read anything, and
 * several of them are rendered together, so the same lookup ran repeatedly
 * within one request. `cache` collapses those into one query for the duration of
 * a single server request and shares nothing across requests or users.
 *
 * The arguments are deliberately primitives: `cache` keys on argument identity,
 * so passing the `{ name, email }` object straight through would create a fresh
 * key on every call and memoize nothing.
 *
 * One constraint follows from this: a caller that writes to the profile row and
 * then wants to read the new values back within the same request must use the
 * value it wrote rather than calling this again. Callers currently only need
 * `profile.id`, which does not change.
 */
const loadOrCreateProfile = cache(async function loadOrCreateProfile(
  userId: string,
  name: string | null,
  email: string | null,
) {
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(profiles)
    .values({
      userId,
      displayName: name,
      contactEmail: email,
    })
    .onConflictDoNothing({ target: profiles.userId })
    .returning();

  if (created) {
    return created;
  }

  const concurrent = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  if (!concurrent) {
    throw new Error("Profile could not be created.");
  }

  return concurrent;
});

export async function getProfileByUserId(userId: string) {
  return db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
}

export async function updateProfileBasics(
  userId: string,
  values: Omit<typeof profiles.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">,
) {
  await db
    .update(profiles)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
}

export async function getEnabledSections(profileId: string) {
  return db
    .select()
    .from(profileSections)
    .where(eq(profileSections.profileId, profileId))
    .orderBy(asc(profileSections.position));
}

/**
 * The enabled section keys in the user's chosen order — the exact input
 * `buildDossierFlow` needs. Selecting one column keeps the payload small for
 * the many callers that only need to know the running order.
 */
export async function getEnabledSectionKeys(profileId: string): Promise<string[]> {
  const rows = await db
    .select({ section: profileSections.section })
    .from(profileSections)
    .where(eq(profileSections.profileId, profileId))
    .orderBy(asc(profileSections.position));

  return rows.map((row) => row.section);
}

export async function replaceEnabledSections(
  profileId: string,
  sections: readonly ProfileSectionKey[],
) {
  await db.transaction(async (transaction) => {
    await transaction
      .delete(profileSections)
      .where(eq(profileSections.profileId, profileId));

    if (sections.length) {
      await transaction.insert(profileSections).values(
        sections.map((section, position) => ({
          profileId,
          section,
          position,
        })),
      );
    }
  });
}

/**
 * Entry counts for every section in a **single** round trip.
 *
 * This previously issued ten independent `count(*)` statements. They were
 * wrapped in `Promise.all`, which looked parallel but is not: the pool is
 * deliberately narrow, so the ten statements queued on one connection and the
 * page paid ten sequential network round trips to the database region. Counting
 * with correlated sub-selects against the already-filtered profile row costs
 * one round trip regardless of how many sections exist.
 */
export async function getSectionCounts(profileId: string) {
  const [row] = await db
    .select({
      experience: countFor(experiences),
      education: countFor(education),
      projects: countFor(projects),
      skills: countFor(skills),
      credentials: countFor(credentials),
      achievements: countFor(achievements),
      languages: countFor(languages),
      publications: countFor(publications),
      memberships: countFor(memberships),
      links: countFor(profileLinks),
    })
    .from(profiles)
    .where(eq(profiles.id, profileId));

  return Object.fromEntries(
    sectionKeys.map((section) => [section, Number(row?.[section] ?? 0)]),
  ) as Record<ProfileSectionKey, number>;
}

/**
 * Everything the readiness evaluator needs, in a **single** round trip.
 *
 * This previously issued four selects inside `Promise.all`. That reads as
 * parallel but was not: the pool is narrow, so the four statements queued behind
 * each other on one connection and the page paid four sequential round trips to
 * the database region — on `/home`, the single slowest authenticated screen.
 *
 * Each row set is aggregated into JSON by the same statement that locates the
 * profile, so the cost is one round trip regardless of how many sections the
 * evaluator grows to consider. The scoring rules stay in `readiness.ts`, which
 * is pure and unit-tested; pushing those predicates into SQL would have made
 * them untestable and duplicated the product's definition of "ready".
 */
export async function getDossierFoundationReadiness(
  profileId: string,
  identity: {
    displayName: string | null;
    headline: string | null;
    careerDirection: string | null;
  },
): Promise<DossierFoundationReadiness> {
  const [row] = await db
    .select({
      experience: jsonRowsFor<ExperienceRecord>(experiences, {
        role: experiences.role,
        organization: experiences.organization,
        startYear: experiences.startYear,
        endYear: experiences.endYear,
        current: experiences.current,
        description: experiences.description,
      }),
      education: jsonRowsFor<EducationRecord>(education, {
        institution: education.institution,
        qualification: education.qualification,
        startYear: education.startYear,
        endYear: education.endYear,
        current: education.current,
      }),
      skills: jsonRowsFor<SkillRecord>(skills, { name: skills.name }),
      projects: jsonRowsFor<ProjectRecord>(projects, {
        name: projects.name,
        role: projects.role,
        context: projects.context,
        url: projects.url,
        startYear: projects.startYear,
        endYear: projects.endYear,
        current: projects.current,
        description: projects.description,
      }),
    })
    .from(profiles)
    .where(eq(profiles.id, profileId));

  return evaluateDossierFoundation({
    identity,
    experience: row?.experience ?? [],
    education: row?.education ?? [],
    skills: row?.skills ?? [],
    projects: row?.projects ?? [],
  });
}

/**
 * The whole dossier, in **one** round trip, for composing a document.
 *
 * This deliberately follows {@link getDossierFoundationReadiness} rather than
 * issuing ten selects inside `Promise.all`. That pattern reads as parallel but is
 * not: the connection ceiling is intentionally small for serverless, so the
 * statements queue on one connection and the page pays ten sequential round trips
 * to the database region. Aggregating each section in the same statement that
 * locates the profile keeps the cost flat as sections are added.
 *
 * Only the columns a document can actually present are selected. Internal
 * bookkeeping — ids, `profileId`, `position`, timestamps — is deliberately left
 * behind: a document has no use for it, and it should not travel to the renderer.
 *
 * Returns `null` when the profile does not exist, so the caller decides what that
 * means rather than receiving a hollow snapshot that looks like an empty dossier.
 *
 * It is keyed on `userId`, not `profileId`, for two reasons. The caller — a
 * document page — holds a session, not a profile id, so keying on the profile
 * would force a lookup first and turn one round trip into two. More importantly it
 * makes ownership structural: there is no argument you can pass this function that
 * returns someone else's dossier, so a document can never be composed from another
 * account's career history.
 */
export async function getDossierSnapshot(
  userId: string,
): Promise<DossierSnapshot | null> {
  const [row] = await db
    .select({
      displayName: profiles.displayName,
      headline: profiles.headline,
      careerDirection: profiles.careerDirection,
      contactEmail: profiles.contactEmail,
      phone: profiles.phone,
      city: profiles.city,
      region: profiles.region,
      country: profiles.country,
      website: profiles.website,
      experience: jsonRowsFor<DossierExperience>(experiences, {
        type: experiences.type,
        organization: experiences.organization,
        role: experiences.role,
        location: experiences.location,
        startMonth: experiences.startMonth,
        startYear: experiences.startYear,
        endMonth: experiences.endMonth,
        endYear: experiences.endYear,
        current: experiences.current,
        description: experiences.description,
      }),
      education: jsonRowsFor<DossierEducation>(education, {
        institution: education.institution,
        qualification: education.qualification,
        field: education.field,
        location: education.location,
        startMonth: education.startMonth,
        startYear: education.startYear,
        endMonth: education.endMonth,
        endYear: education.endYear,
        current: education.current,
        description: education.description,
      }),
      projects: jsonRowsFor<DossierProject>(projects, {
        name: projects.name,
        role: projects.role,
        context: projects.context,
        url: projects.url,
        startMonth: projects.startMonth,
        startYear: projects.startYear,
        endMonth: projects.endMonth,
        endYear: projects.endYear,
        current: projects.current,
        description: projects.description,
      }),
      skills: jsonRowsFor<DossierSkill>(skills, {
        name: skills.name,
        type: skills.type,
        notes: skills.notes,
      }),
      credentials: jsonRowsFor<DossierCredential>(credentials, {
        type: credentials.type,
        name: credentials.name,
        issuer: credentials.issuer,
        identifier: credentials.identifier,
        url: credentials.url,
        issueMonth: credentials.issueMonth,
        issueYear: credentials.issueYear,
        expiryMonth: credentials.expiryMonth,
        expiryYear: credentials.expiryYear,
        description: credentials.description,
      }),
      achievements: jsonRowsFor<DossierAchievement>(achievements, {
        type: achievements.type,
        title: achievements.title,
        issuer: achievements.issuer,
        month: achievements.month,
        year: achievements.year,
        description: achievements.description,
      }),
      languages: jsonRowsFor<DossierLanguage>(languages, {
        language: languages.language,
        proficiency: languages.proficiency,
        notes: languages.notes,
      }),
      publications: jsonRowsFor<DossierPublication>(publications, {
        title: publications.title,
        publisher: publications.publisher,
        month: publications.month,
        year: publications.year,
        url: publications.url,
        description: publications.description,
      }),
      memberships: jsonRowsFor<DossierMembership>(memberships, {
        organization: memberships.organization,
        role: memberships.role,
        startMonth: memberships.startMonth,
        startYear: memberships.startYear,
        endMonth: memberships.endMonth,
        endYear: memberships.endYear,
        current: memberships.current,
        description: memberships.description,
      }),
      links: jsonRowsFor<DossierLink>(profileLinks, {
        type: profileLinks.type,
        label: profileLinks.label,
        url: profileLinks.url,
      }),
    })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  if (!row) return null;

  return {
    identity: {
      displayName: row.displayName,
      headline: row.headline,
      careerDirection: row.careerDirection,
      contactEmail: row.contactEmail,
      phone: row.phone,
      city: row.city,
      region: row.region,
      country: row.country,
      website: row.website,
    },
    experience: row.experience,
    education: row.education,
    projects: row.projects,
    skills: row.skills,
    credentials: row.credentials,
    achievements: row.achievements,
    languages: row.languages,
    publications: row.publications,
    memberships: row.memberships,
    links: row.links,
  };
}

export async function listSectionEntries(section: ProfileSectionKey, profileId: string) {
  switch (section) {
    case "experience":
      return db.select().from(experiences).where(eq(experiences.profileId, profileId)).orderBy(asc(experiences.position), asc(experiences.createdAt));
    case "education":
      return db.select().from(education).where(eq(education.profileId, profileId)).orderBy(asc(education.position), asc(education.createdAt));
    case "projects":
      return db.select().from(projects).where(eq(projects.profileId, profileId)).orderBy(asc(projects.position), asc(projects.createdAt));
    case "skills":
      return db.select().from(skills).where(eq(skills.profileId, profileId)).orderBy(asc(skills.position), asc(skills.createdAt));
    case "credentials":
      return db.select().from(credentials).where(eq(credentials.profileId, profileId)).orderBy(asc(credentials.position), asc(credentials.createdAt));
    case "achievements":
      return db.select().from(achievements).where(eq(achievements.profileId, profileId)).orderBy(asc(achievements.position), asc(achievements.createdAt));
    case "languages":
      return db.select().from(languages).where(eq(languages.profileId, profileId)).orderBy(asc(languages.position), asc(languages.createdAt));
    case "publications":
      return db.select().from(publications).where(eq(publications.profileId, profileId)).orderBy(asc(publications.position), asc(publications.createdAt));
    case "memberships":
      return db.select().from(memberships).where(eq(memberships.profileId, profileId)).orderBy(asc(memberships.position), asc(memberships.createdAt));
    case "links":
      return db.select().from(profileLinks).where(eq(profileLinks.profileId, profileId)).orderBy(asc(profileLinks.position), asc(profileLinks.createdAt));
  }
}

export async function getOwnedSectionEntry(
  section: ProfileSectionKey,
  profileId: string,
  itemId: string,
) {
  switch (section) {
    case "experience":
      return db.query.experiences.findFirst({ where: and(eq(experiences.id, itemId), eq(experiences.profileId, profileId)) });
    case "education":
      return db.query.education.findFirst({ where: and(eq(education.id, itemId), eq(education.profileId, profileId)) });
    case "projects":
      return db.query.projects.findFirst({ where: and(eq(projects.id, itemId), eq(projects.profileId, profileId)) });
    case "skills":
      return db.query.skills.findFirst({ where: and(eq(skills.id, itemId), eq(skills.profileId, profileId)) });
    case "credentials":
      return db.query.credentials.findFirst({ where: and(eq(credentials.id, itemId), eq(credentials.profileId, profileId)) });
    case "achievements":
      return db.query.achievements.findFirst({ where: and(eq(achievements.id, itemId), eq(achievements.profileId, profileId)) });
    case "languages":
      return db.query.languages.findFirst({ where: and(eq(languages.id, itemId), eq(languages.profileId, profileId)) });
    case "publications":
      return db.query.publications.findFirst({ where: and(eq(publications.id, itemId), eq(publications.profileId, profileId)) });
    case "memberships":
      return db.query.memberships.findFirst({ where: and(eq(memberships.id, itemId), eq(memberships.profileId, profileId)) });
    case "links":
      return db.query.profileLinks.findFirst({ where: and(eq(profileLinks.id, itemId), eq(profileLinks.profileId, profileId)) });
  }
}

export async function createSectionEntry(
  section: ProfileSectionKey,
  profileId: string,
  values: Record<string, unknown>,
) {
  const position = await nextPosition(section, profileId);

  const safeValues = withoutProtectedFields(values);

  switch (section) {
    case "experience":
      await db.insert(experiences).values({ ...(safeValues as typeof experiences.$inferInsert), profileId, position }); break;
    case "education":
      await db.insert(education).values({ ...(safeValues as typeof education.$inferInsert), profileId, position }); break;
    case "projects":
      await db.insert(projects).values({ ...(safeValues as typeof projects.$inferInsert), profileId, position }); break;
    case "skills":
      await db.insert(skills).values({ ...(safeValues as typeof skills.$inferInsert), profileId, position }); break;
    case "credentials":
      await db.insert(credentials).values({ ...(safeValues as typeof credentials.$inferInsert), profileId, position }); break;
    case "achievements":
      await db.insert(achievements).values({ ...(safeValues as typeof achievements.$inferInsert), profileId, position }); break;
    case "languages":
      await db.insert(languages).values({ ...(safeValues as typeof languages.$inferInsert), profileId, position }); break;
    case "publications":
      await db.insert(publications).values({ ...(safeValues as typeof publications.$inferInsert), profileId, position }); break;
    case "memberships":
      await db.insert(memberships).values({ ...(safeValues as typeof memberships.$inferInsert), profileId, position }); break;
    case "links":
      await db.insert(profileLinks).values({ ...(safeValues as typeof profileLinks.$inferInsert), profileId, position }); break;
  }
}

export async function updateOwnedSectionEntry(
  section: ProfileSectionKey,
  profileId: string,
  itemId: string,
  values: Record<string, unknown>,
) {
  const updatedAt = new Date();
  const safeValues = withoutProtectedFields(values);

  switch (section) {
    case "experience":
      return db.update(experiences).set({ ...(safeValues as typeof experiences.$inferInsert), updatedAt }).where(and(eq(experiences.id, itemId), eq(experiences.profileId, profileId))).returning({ id: experiences.id });
    case "education":
      return db.update(education).set({ ...(safeValues as typeof education.$inferInsert), updatedAt }).where(and(eq(education.id, itemId), eq(education.profileId, profileId))).returning({ id: education.id });
    case "projects":
      return db.update(projects).set({ ...(safeValues as typeof projects.$inferInsert), updatedAt }).where(and(eq(projects.id, itemId), eq(projects.profileId, profileId))).returning({ id: projects.id });
    case "skills":
      return db.update(skills).set(safeValues as typeof skills.$inferInsert).where(and(eq(skills.id, itemId), eq(skills.profileId, profileId))).returning({ id: skills.id });
    case "credentials":
      return db.update(credentials).set({ ...(safeValues as typeof credentials.$inferInsert), updatedAt }).where(and(eq(credentials.id, itemId), eq(credentials.profileId, profileId))).returning({ id: credentials.id });
    case "achievements":
      return db.update(achievements).set({ ...(safeValues as typeof achievements.$inferInsert), updatedAt }).where(and(eq(achievements.id, itemId), eq(achievements.profileId, profileId))).returning({ id: achievements.id });
    case "languages":
      return db.update(languages).set(safeValues as typeof languages.$inferInsert).where(and(eq(languages.id, itemId), eq(languages.profileId, profileId))).returning({ id: languages.id });
    case "publications":
      return db.update(publications).set({ ...(safeValues as typeof publications.$inferInsert), updatedAt }).where(and(eq(publications.id, itemId), eq(publications.profileId, profileId))).returning({ id: publications.id });
    case "memberships":
      return db.update(memberships).set({ ...(safeValues as typeof memberships.$inferInsert), updatedAt }).where(and(eq(memberships.id, itemId), eq(memberships.profileId, profileId))).returning({ id: memberships.id });
    case "links":
      return db.update(profileLinks).set({ ...(safeValues as typeof profileLinks.$inferInsert), updatedAt }).where(and(eq(profileLinks.id, itemId), eq(profileLinks.profileId, profileId))).returning({ id: profileLinks.id });
  }
}

export async function deleteOwnedSectionEntry(
  section: ProfileSectionKey,
  profileId: string,
  itemId: string,
) {
  switch (section) {
    case "experience":
      return db.delete(experiences).where(and(eq(experiences.id, itemId), eq(experiences.profileId, profileId))).returning({ id: experiences.id });
    case "education":
      return db.delete(education).where(and(eq(education.id, itemId), eq(education.profileId, profileId))).returning({ id: education.id });
    case "projects":
      return db.delete(projects).where(and(eq(projects.id, itemId), eq(projects.profileId, profileId))).returning({ id: projects.id });
    case "skills":
      return db.delete(skills).where(and(eq(skills.id, itemId), eq(skills.profileId, profileId))).returning({ id: skills.id });
    case "credentials":
      return db.delete(credentials).where(and(eq(credentials.id, itemId), eq(credentials.profileId, profileId))).returning({ id: credentials.id });
    case "achievements":
      return db.delete(achievements).where(and(eq(achievements.id, itemId), eq(achievements.profileId, profileId))).returning({ id: achievements.id });
    case "languages":
      return db.delete(languages).where(and(eq(languages.id, itemId), eq(languages.profileId, profileId))).returning({ id: languages.id });
    case "publications":
      return db.delete(publications).where(and(eq(publications.id, itemId), eq(publications.profileId, profileId))).returning({ id: publications.id });
    case "memberships":
      return db.delete(memberships).where(and(eq(memberships.id, itemId), eq(memberships.profileId, profileId))).returning({ id: memberships.id });
    case "links":
      return db.delete(profileLinks).where(and(eq(profileLinks.id, itemId), eq(profileLinks.profileId, profileId))).returning({ id: profileLinks.id });
  }
}

type SectionTable = (typeof sectionTables)[ProfileSectionKey];

/**
 * `count(*)` for one section, correlated to the profile row being selected.
 * Cast to `int` so the driver hands back a JS number rather than a bigint
 * string.
 */
function countFor(table: SectionTable) {
  return sql<number>`(select count(*)::int from ${table} where ${table.profileId} = ${profiles.id})`;
}

/**
 * Rows of one section as a JSON array, correlated to the profile row being
 * selected — the row-level equivalent of {@link countFor}.
 *
 * Only the requested columns are aggregated, so a section with long descriptions
 * does not drag its whole body across the wire when the caller needs a handful of
 * fields. `coalesce` guarantees an array rather than SQL NULL for an empty
 * section, so callers never have to special-case it.
 *
 * The JSON keys come from this module's own object literals, never from user
 * input, which is why they can be emitted as raw identifiers. Column references
 * still go through Drizzle, so they remain correctly qualified and quoted.
 *
 * The aggregate is ordered by the section's own `position`, then `createdAt`, to
 * match {@link listSectionEntries}. `json_agg` has no inherent order, so without
 * this a generated document could list the same experience in a different order
 * on each render — the one thing a career document must never do.
 */
function jsonRowsFor<T>(table: SectionTable, columns: Record<string, AnyPgColumn>) {
  const pairs = Object.entries(columns).map(
    ([alias, column]) => sql`${sql.raw(`'${alias.replace(/'/g, "''")}'`)}, ${column}`,
  );

  return sql<T[]>`(
    select coalesce(
      json_agg(
        json_build_object(${sql.join(pairs, sql`, `)})
        order by ${table.position}, ${table.createdAt}
      ),
      '[]'::json
    )
    from ${table}
    where ${table.profileId} = ${profiles.id}
  )`;
}

/**
 * Next ordering position for a new entry.
 *
 * This used to load every row in the section just to read the highest
 * `position`, which meant an insert cost grew with the size of the section.
 * `max(position)` answers the same question with one aggregate.
 */
async function nextPosition(section: ProfileSectionKey, profileId: string) {
  const table = sectionTables[section];

  const [row] = await db
    .select({
      next: sql<number>`(
        select coalesce(max(${table.position}), -1) + 1
        from ${table}
        where ${table.profileId} = ${profileId}
      )`,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId));

  return Number(row?.next ?? 0);
}

function withoutProtectedFields(values: Record<string, unknown>) {
  const {
    id: _id,
    profileId: _profileId,
    position: _position,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...safeValues
  } = values;

  return safeValues;
}
