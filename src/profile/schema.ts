import { randomUUID } from "node:crypto";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "@/auth/schema";
import {
  achievementTypes,
  credentialTypes,
  experienceTypes,
  linkTypes,
  skillTypes,
} from "./types";

const id = () => randomUUID();
const createdAt = () => new Date();

export const profiles = pgTable("profiles", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("displayName"),
  contactEmail: text("contactEmail"),
  phone: text("phone"),
  country: text("country"),
  region: text("region"),
  city: text("city"),
  website: text("website"),
  headline: text("headline"),
  careerDirection: text("careerDirection"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const profileSections = pgTable(
  "profileSections",
  {
    profileId: text("profileId")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .$defaultFn(createdAt)
      .notNull(),
  },
  (table) => ({
    profileSectionKey: primaryKey({ columns: [table.profileId, table.section] }),
  }),
);

export const experiences = pgTable("profileExperiences", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof experienceTypes)[number]>().notNull(),
  organization: text("organization").notNull(),
  role: text("role").notNull(),
  location: text("location"),
  startMonth: integer("startMonth"),
  startYear: integer("startYear"),
  endMonth: integer("endMonth"),
  endYear: integer("endYear"),
  current: boolean("current").notNull().default(false),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const education = pgTable("profileEducation", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  institution: text("institution").notNull(),
  qualification: text("qualification"),
  field: text("field"),
  location: text("location"),
  startMonth: integer("startMonth"),
  startYear: integer("startYear"),
  endMonth: integer("endMonth"),
  endYear: integer("endYear"),
  current: boolean("current").notNull().default(false),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const projects = pgTable("profileProjects", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  context: text("context"),
  url: text("url"),
  startMonth: integer("startMonth"),
  startYear: integer("startYear"),
  endMonth: integer("endMonth"),
  endYear: integer("endYear"),
  current: boolean("current").notNull().default(false),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const skills = pgTable("profileSkills", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").$type<(typeof skillTypes)[number]>().notNull(),
  notes: text("notes"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const credentials = pgTable("profileCredentials", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof credentialTypes)[number]>().notNull(),
  name: text("name").notNull(),
  issuer: text("issuer"),
  identifier: text("identifier"),
  url: text("url"),
  issueMonth: integer("issueMonth"),
  issueYear: integer("issueYear"),
  expiryMonth: integer("expiryMonth"),
  expiryYear: integer("expiryYear"),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const achievements = pgTable("profileAchievements", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof achievementTypes)[number]>().notNull(),
  title: text("title").notNull(),
  issuer: text("issuer"),
  month: integer("month"),
  year: integer("year"),
  description: text("description"),
  experienceId: text("experienceId").references(() => experiences.id, {
    onDelete: "set null",
  }),
  projectId: text("projectId").references(() => projects.id, {
    onDelete: "set null",
  }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const languages = pgTable("profileLanguages", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  proficiency: text("proficiency"),
  notes: text("notes"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const publications = pgTable("profilePublications", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  publisher: text("publisher"),
  month: integer("month"),
  year: integer("year"),
  url: text("url"),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const memberships = pgTable("profileMemberships", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  organization: text("organization").notNull(),
  role: text("role"),
  startMonth: integer("startMonth"),
  startYear: integer("startYear"),
  endMonth: integer("endMonth"),
  endYear: integer("endYear"),
  current: boolean("current").notNull().default(false),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

export const profileLinks = pgTable("profileLinks", {
  id: text("id").$defaultFn(id).notNull().primaryKey(),
  profileId: text("profileId")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof linkTypes)[number]>().notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
    .$defaultFn(createdAt)
    .notNull(),
});

