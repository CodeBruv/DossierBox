import "server-only";

import { fingerprintJson } from "./generation-domain";
import {
  acceptGeneratedContentVersion,
  getOwnedGeneratedContentVersion,
} from "./generation-repository";

export type AcceptGeneratedContentInput = {
  userId: string;
  generatedContentVersionId: string;
  title?: string;
  configuration?: Record<string, unknown>;
};

export async function acceptGeneratedContent(input: AcceptGeneratedContentInput) {
  const configuration = input.configuration ?? {};
  return acceptGeneratedContentVersion({
    ...input,
    title: input.title?.trim(),
    configuration,
  });
}

export async function readOwnedGeneratedContent(userId: string, generatedContentVersionId: string) {
  return getOwnedGeneratedContentVersion(userId, generatedContentVersionId);
}

export function acceptanceConfigurationFingerprint(configuration: Record<string, unknown>) {
  return fingerprintJson(configuration);
}
