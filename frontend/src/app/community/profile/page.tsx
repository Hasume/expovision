"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCommunityAuthState } from "@/features/api";

export default function ProfileRedirect() {
  const router = useRouter();
  useEffect(() => {
    const auth = getCommunityAuthState();
    if (auth?.userId) {
      router.replace(`/community/profile/${auth.userId}`);
    } else {
      router.replace("/community");
    }
  }, [router]);
  return null;
}
