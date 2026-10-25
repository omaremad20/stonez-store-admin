import { redirect } from "next/navigation";

import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/redirect";

// "/" is redirected by the proxy before rendering. This page is only a
// fallback, and a redirect has no instant UI to validate.
export const instant = false;

export default function Home() {
  redirect(DEFAULT_AUTHENTICATED_PATH);
}
