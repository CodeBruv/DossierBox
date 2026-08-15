"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfileUser } from "./authorization";
import {
  createSectionEntry,
  deleteOwnedSectionEntry,
  getOrCreateProfile,
  replaceEnabledSections,
  updateOwnedSectionEntry,
  updateProfileBasics,
} from "./repository";
import { isProfileSection } from "./sections";
import type { ProfileFormState, ProfileSectionKey } from "./types";
import {
  formStateFromError,
  parseBasicsFormData,
  parseEntryFormData,
  parseSectionSelection,
} from "./validation";

const saveFailureMessage = "We could not save that information. Your existing profile was not changed.";

export async function saveProfileBasicsAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = parseBasicsFormData(formData);

  if (!result.success) {
    return formStateFromError(result.error, formData);
  }

  const user = await requireProfileUser();

  try {
    await getOrCreateProfile(user.id, user);
    await updateProfileBasics(user.id, result.data);
  } catch {
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths();
  redirect("/profile?status=basics-saved");
}

export async function saveProfileSectionsAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = parseSectionSelection(formData);

  if (!result.success) {
    return formStateFromError(result.error, formData);
  }

  const user = await requireProfileUser();

  try {
    const profile = await getOrCreateProfile(user.id, user);
    await replaceEnabledSections(profile.id, result.data.sections);
  } catch {
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths();
  redirect("/profile?status=sections-saved");
}

export async function createProfileEntryAction(
  sectionValue: string,
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  if (!isProfileSection(sectionValue)) {
    return failureState(formData, "This profile section is not supported.");
  }

  const result = parseEntryFormData(sectionValue, formData);

  if (!result.success) {
    return formStateFromError(result.error, formData);
  }

  const user = await requireProfileUser();

  try {
    const profile = await getOrCreateProfile(user.id, user);
    await createSectionEntry(sectionValue, profile.id, result.data as Record<string, unknown>);
  } catch {
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths(sectionValue);
  redirect(`/profile/${sectionValue}?status=created`);
}

export async function updateProfileEntryAction(
  sectionValue: string,
  itemId: string,
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  if (!isProfileSection(sectionValue)) {
    return failureState(formData, "This profile section is not supported.");
  }

  const result = parseEntryFormData(sectionValue, formData);

  if (!result.success) {
    return formStateFromError(result.error, formData);
  }

  const user = await requireProfileUser();

  try {
    const profile = await getOrCreateProfile(user.id, user);
    const updated = await updateOwnedSectionEntry(
      sectionValue,
      profile.id,
      itemId,
      result.data as Record<string, unknown>,
    );

    if (!updated.length) {
      return failureState(formData, "That profile entry was not found or does not belong to you.");
    }
  } catch {
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths(sectionValue);
  redirect(`/profile/${sectionValue}?status=updated`);
}

export async function deleteProfileEntryAction(
  sectionValue: string,
  itemId: string,
): Promise<void> {
  if (!isProfileSection(sectionValue)) {
    redirect("/profile");
  }

  const user = await requireProfileUser();

  try {
    const profile = await getOrCreateProfile(user.id, user);
    await deleteOwnedSectionEntry(sectionValue, profile.id, itemId);
  } catch {
    redirect(`/profile/${sectionValue}?status=delete-failed`);
  }

  revalidateProfilePaths(sectionValue);
  redirect(`/profile/${sectionValue}?status=deleted`);
}

function failureState(formData: FormData, message: string): ProfileFormState {
  const values: Record<string, string> = {};
  const multipleValues: Record<string, string[]> = {};

  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") {
      continue;
    }

    values[name] = value;
    multipleValues[name] = [...(multipleValues[name] ?? []), value];
  }

  return {
    status: "error",
    message,
    values,
    multipleValues,
  };
}

function revalidateProfilePaths(section?: ProfileSectionKey) {
  revalidatePath("/profile");
  revalidatePath("/profile/basics");
  revalidatePath("/profile/sections");

  if (section) {
    revalidatePath(`/profile/${section}`);
  }
}
