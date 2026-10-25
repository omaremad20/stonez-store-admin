import { redirect } from "next/navigation";

import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/redirect";

export default function Home() {
  redirect(DEFAULT_AUTHENTICATED_PATH);
}
