import "server-only";

import { and, asc, count, eq } from "drizzle-orm";
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
import {
  evaluateDossierFoundation,
  type DossierFoundationReadiness,
} from "./readiness";

type ProfileDefaults = {
  name: string | null;
  email: string | null;
};

export async function getOrCreateProfile(userId: string, defaults: ProfileDefaults) {
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
      displayName: defaults.name,
      contactEmail: defaults.email,
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
}

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

export async function getSectionCounts(profileId: string) {
  const entries = await Promise.all([
    countRows(experiences, profileId),
    countRows(education, profileId),
    countRows(projects, profileId),
    countRows(skills, profileId),
    countRows(credentials, profileId),
    countRows(achievements, profileId),
    countRows(languages, profileId),
    countRows(publications, profileId),
    countRows(memberships, profileId),
    countRows(profileLinks, profileId),
  ]);

  return Object.fromEntries(
    [
      "experience",
      "education",
      "projects",
      "skills",
      "credentials",
      "achievements",
      "languages",
      "publications",
      "memberships",
      "links",
    ].map((section, index) => [section, entries[index]]),
  ) as Record<ProfileSectionKey, number>;
}

export async function getDossierFoundationReadiness(
  profileId: string,
  identity: {
    displayName: string | null;
    headline: string | null;
    careerDirection: string | null;
  },
): Promise<DossierFoundationReadiness> {
  const [experienceEntries, educationEntries, skillEntries, projectEntries] =
    await Promise.all([
      db
        .select({
          role: experiences.role,
          organization: experiences.organization,
          startYear: experiences.startYear,
          endYear: experiences.endYear,
          current: experiences.current,
          description: experiences.description,
        })
        .from(experiences)
        .where(eq(experiences.profileId, profileId)),
      db
        .select({
          institution: education.institution,
          qualification: education.qualification,
          startYear: education.startYear,
          endYear: education.endYear,
          current: education.current,
        })
        .from(education)
        .where(eq(education.profileId, profileId)),
      db
        .select({ name: skills.name })
        .from(skills)
        .where(eq(skills.profileId, profileId)),
      db
        .select({
          name: projects.name,
          role: projects.role,
          context: projects.context,
          url: projects.url,
          startYear: projects.startYear,
          endYear: projects.endYear,
          current: projects.current,
          description: projects.description,
        })
        .from(projects)
        .where(eq(projects.profileId, profileId)),
    ]);

  return evaluateDossierFoundation({
    identity,
    experience: experienceEntries,
    education: educationEntries,
    skills: skillEntries,
    projects: projectEntries,
  });
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

async function countRows(
  table:
    | typeof experiences
    | typeof education
    | typeof projects
    | typeof skills
    | typeof credentials
    | typeof achievements
    | typeof languages
    | typeof publications
    | typeof memberships
    | typeof profileLinks,
  profileId: string,
) {
  const [result] = await db
    .select({ value: count() })
    .from(table)
    .where(eq(table.profileId, profileId));

  return Number(result?.value ?? 0);
}

async function nextPosition(section: ProfileSectionKey, profileId: string) {
  const entries = await listSectionEntries(section, profileId);
  return Math.max(-1, ...entries.map((entry) => entry.position)) + 1;
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
