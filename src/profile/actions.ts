"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireProfileUser } from "./authorization";
import {
  createSectionEntry,
  deleteOwnedSectionEntry,
  getEnabledSectionKeys,
  getOrCreateProfile,
  replaceEnabledSections,
  updateOwnedSectionEntry,
  updateProfileBasics,
} from "./repository";
import {
  buildDossierFlow,
  parseSaveIntent,
  resolveEntryDestination,
} from "./flow";
import { isProfileSection } from "./sections";
import type { ProfileFormState, ProfileSectionKey } from "./types";
import {
  formStateFromError,
  formStateFromSubmission,
  parseBasicsFormData,
  parseEntryFormData,
  parseSectionSelection,
} from "./validation";

const saveFailureMessage = "We could not save that information. Your existing dossier was not changed.";

export async function saveProfileBasicsAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = parseBasicsFormData(formData);

  if (!result.success) {
    return formStateFromError(result.error, formData);
  }

  const user = await requireProfileUser();
  const intent = parseSaveIntent(formData.get("intent"));
  let destination = "/profile?status=basics-saved";

  try {
    const profile = await getOrCreateProfile(user.id, user);
    await updateProfileBasics(user.id, result.data);

    if (intent === "continue") {
      /**
       * Identity is step one, so "continue" moves into the first section the
       * user selected. When they have not chosen any sections yet, the useful
       * next screen is the picker rather than a dead end.
       */
      const flow = buildDossierFlow(await getEnabledSectionKeys(profile.id));
      destination = flow.steps[1]
        ? `${flow.steps[1].href}?status=basics-saved`
        : "/profile/sections?status=basics-saved";
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("[profile] Failed to save dossier identity", error);
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths();
  redirect(destination);
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
  const intent = parseSaveIntent(formData.get("intent"));
  let destination = "/profile?status=sections-saved";

  try {
    const profile = await getOrCreateProfile(user.id, user);
    await replaceEnabledSections(profile.id, result.data.sections);

    if (intent === "continue") {
      /**
       * Choosing sections is a planning step. Continuing from it should drop the
       * user straight into the first section they picked rather than returning
       * them to a hub they have just finished configuring.
       */
      const flow = buildDossierFlow(result.data.sections);
      destination = flow.steps[1]
        ? `${flow.steps[1].href}?status=sections-saved`
        : "/profile/review?status=sections-saved";
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("[profile] Failed to save dossier sections", error);
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths();
  redirect(destination);
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
  const intent = parseSaveIntent(formData.get("intent"));
  let destination = `/profile/${sectionValue}?status=created`;

  try {
    const profile = await getOrCreateProfile(user.id, user);
    await createSectionEntry(sectionValue, profile.id, result.data as Record<string, unknown>);

    /**
     * The flow is only needed to answer "what comes after this section?", so it
     * is loaded solely for the intent that asks that question. Saving in place
     * or adding another entry stays at one round trip.
     */
    const flow =
      intent === "continue"
        ? buildDossierFlow(await getEnabledSectionKeys(profile.id))
        : undefined;

    destination = resolveEntryDestination(flow, sectionValue, intent);
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[profile] Failed to create ${sectionValue} dossier entry`, error);
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths(sectionValue);
  redirect(destination);
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
  const intent = parseSaveIntent(formData.get("intent"));
  let destination = `/profile/${sectionValue}?status=updated`;

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

    if (intent === "continue") {
      const flow = buildDossierFlow(await getEnabledSectionKeys(profile.id));
      destination = resolveEntryDestination(flow, sectionValue, intent, "updated");
    } else {
      destination = resolveEntryDestination(undefined, sectionValue, intent, "updated");
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[profile] Failed to update ${sectionValue} dossier entry`, error);
    return failureState(formData, saveFailureMessage);
  }

  revalidateProfilePaths(sectionValue);
  redirect(destination);
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
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[profile] Failed to delete ${sectionValue} dossier entry`, error);
    redirect(`/profile/${sectionValue}?status=delete-failed`);
  }

  revalidateProfilePaths(sectionValue);
  redirect(`/profile/${sectionValue}?status=deleted`);
}

function failureState(formData: FormData, message: string): ProfileFormState {
  return formStateFromSubmission(formData, message);
}

function revalidateProfilePaths(section?: ProfileSectionKey) {
  revalidatePath("/profile");
  revalidatePath("/profile/basics");
  revalidatePath("/profile/sections");
  revalidatePath("/profile/review");
  revalidatePath("/home");

  if (section) {
    revalidatePath(`/profile/${section}`);
  }
}
