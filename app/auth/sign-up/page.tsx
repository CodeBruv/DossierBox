import { redirect } from "next/navigation";
import { buildSignInUrl } from "@/auth/redirects";

export default function SignUpPage() {
  redirect(buildSignInUrl("/account"));
}
