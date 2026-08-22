import "server-only";

import { redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";

export type AuthenticatedProfileUser = {
  id: string;
  name: string | null;
  email: string | null;
};

export async function requireProfileUser(): Promise<AuthenticatedProfileUser> {
  if (!authSessionConfiguration) {
    redirect("/auth/sign-in?callbackUrl=%2Fprofile&error=Configuration");
  }

  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=%2Fprofile&error=SessionRequired");
  }

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  };
}

